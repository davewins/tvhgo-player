package playback

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/davidborzek/tvhgo/core"
	"github.com/rs/zerolog/log"
)

const (
	hlsIdleTimeout = 25 * time.Second // a session nobody has fetched from for this long is stopped
	hlsStartWait   = 20 * time.Second // how long to wait for the first segments
)

var hlsFileRe = regexp.MustCompile(`^(index\.m3u8|seg[0-9]+\.ts)$`)

type hlsSession struct {
	dir    string
	cancel context.CancelFunc
	last   time.Time // guarded by hlsMu
	done   chan struct{}
}

var (
	hlsMu       sync.Mutex
	hlsSessions = map[string]*hlsSession{}
)

// hlsArgs builds the ffmpeg arguments that turn a raw MPEG-TS stream on stdin into a rolling HLS playlist
// (MPEG-TS segments, H.264 + AAC) in dir. Safari and iOS play HLS natively but not an endless fragmented MP4.
func hlsArgs(height int, preset, dir string) []string {
	return hlsArgsFor(liveEncoder{}, height, preset, dir)
}

func hlsArgsFor(enc liveEncoder, height int, preset, dir string) []string {
	args := liveArgsFor(enc, height, preset)
	// keep everything up to the output options; drop the "-f mp4 ... pipe:1" tail
	cut := len(args)
	for i, a := range args {
		if a == "-f" {
			cut = i
			break
		}
	}
	// segments need a key frame every 2 s at most (liveArgs forces one per second)
	return append(args[:cut:cut],
		"-f", "hls", "-hls_time", "2", "-hls_list_size", "8",
		"-hls_flags", "delete_segments+independent_segments+omit_endlist",
		"-hls_segment_filename", filepath.Join(dir, "seg%d.ts"),
		filepath.Join(dir, "index.m3u8"),
	)
}

// StartHLS starts a live HLS session: open is called to get the raw stream (cancelled when the session ends) and the
// returned id is used to fetch the playlist and segments. The session ends when it is stopped or goes idle.
func (s *service) StartHLS(open func(ctx context.Context) (io.ReadCloser, error), height int) (string, error) {
	if !s.liveEnabled() {
		return "", core.ErrLiveDisabled
	}
	if !s.qualityAllowed(height) {
		return "", core.ErrLiveQuality
	}
	select {
	case s.liveSem <- struct{}{}:
	default:
		return "", core.ErrLiveBusy
	}
	release := func() { <-s.liveSem }

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		release()
		return "", err
	}
	id := hex.EncodeToString(b)

	dir, err := os.MkdirTemp("", "tvhgo-hls-")
	if err != nil {
		release()
		return "", err
	}

	ctx, cancel := context.WithCancel(context.Background())
	src, err := open(ctx)
	if err != nil {
		cancel()
		release()
		_ = os.RemoveAll(dir)
		return "", err
	}

	bin, pre := s.cfg.FFmpeg, []string{}
	if nice, lerr := exec.LookPath("nice"); lerr == nil {
		pre = []string{"-n", "5", bin}
		bin = nice
	}
	enc := s.encoder()
	cmd := exec.CommandContext(ctx, bin, append(pre, hlsArgsFor(enc, height, s.cfg.Preset, dir)...)...)
	started := time.Now()
	cmd.Stdin = src
	if err := cmd.Start(); err != nil {
		src.Close()
		cancel()
		release()
		_ = os.RemoveAll(dir)
		return "", err
	}

	sess := &hlsSession{dir: dir, cancel: cancel, last: time.Now(), done: make(chan struct{})}
	hlsMu.Lock()
	hlsSessions[id] = sess
	hlsMu.Unlock()

	go func() { // end of ffmpeg: clean up
		werr := cmd.Wait()
		if enc.vaapi && werr != nil && ctx.Err() == nil && time.Since(started) < 10*time.Second {
			s.vaapiFailed(werr)
		}
		src.Close()
		cancel()
		hlsMu.Lock()
		delete(hlsSessions, id)
		hlsMu.Unlock()
		_ = os.RemoveAll(dir)
		release()
		close(sess.done)
	}()
	go func() { // idle reaper
		t := time.NewTicker(5 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-sess.done:
				return
			case <-t.C:
				hlsMu.Lock()
				idle := time.Since(sess.last)
				hlsMu.Unlock()
				if idle > hlsIdleTimeout {
					log.Debug().Str("session", id).Msg("live hls: idle, stopping")
					cancel()
					return
				}
			}
		}
	}()

	// wait for the playlist to list a couple of segments so the player can start straight away
	deadline := time.Now().Add(hlsStartWait)
	for time.Now().Before(deadline) {
		if data, rerr := os.ReadFile(filepath.Join(dir, "index.m3u8")); rerr == nil && strings.Count(string(data), "#EXTINF") >= 2 {
			return id, nil
		}
		select {
		case <-sess.done:
			return "", core.ErrLiveStart
		case <-time.After(250 * time.Millisecond):
		}
	}
	cancel()
	return "", core.ErrLiveStart
}

// HLSFile returns the path of the playlist or segment of a session (and counts as activity).
func (s *service) HLSFile(id, name string) (string, bool) {
	if !hlsFileRe.MatchString(name) {
		return "", false
	}
	hlsMu.Lock()
	defer hlsMu.Unlock()
	sess, ok := hlsSessions[id]
	if !ok {
		return "", false
	}
	sess.last = time.Now()
	return filepath.Join(sess.dir, name), true
}

// StopHLS ends a session (idempotent).
func (s *service) StopHLS(id string) {
	hlsMu.Lock()
	sess, ok := hlsSessions[id]
	hlsMu.Unlock()
	if ok {
		sess.cancel()
	}
}
