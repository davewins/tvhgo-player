package playback

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strconv"

	"github.com/davidborzek/tvhgo/core"
	"github.com/rs/zerolog/log"
)

func (s *service) liveEnabled() bool { return s.cfg.LiveEnabled() }

func (s *service) LiveQualities() []int {
	if !s.liveEnabled() {
		return []int{}
	}
	return s.cfg.LiveQualities
}

func (s *service) qualityAllowed(h int) bool {
	for _, q := range s.LiveQualities() {
		if q == h {
			return true
		}
	}
	return false
}

// liveArgs builds the ffmpeg arguments that turn a raw MPEG-TS stream on stdin into a fragmented MP4 on stdout.
func liveArgs(height int, preset string) []string {
	h := strconv.Itoa(height)
	// the video map is optional: radio channels have no video and come out as audio-only MP4
	// never upscale; keep the display aspect ratio (handles non-square-pixel SD); deinterlace interlaced frames
	vf := fmt.Sprintf("yadif=0:-1:1,scale=w=trunc(min(%s\\,ih)*dar/2)*2:h=min(%s\\,ih):flags=bilinear,setsar=1", h, h)
	crf, maxrate := "23", "6M"
	switch {
	case height <= 360:
		crf, maxrate = "26", "1M"
	case height <= 480:
		crf, maxrate = "25", "2M"
	case height <= 720:
		crf, maxrate = "24", "4M"
	}
	return []string{
		"-nostdin", "-v", "error", "-fflags", "+genpts+discardcorrupt",
		"-probesize", "1500000", "-analyzeduration", "1500000",
		"-i", "pipe:0", "-map", "0:v:0?", "-map", "0:a:0?",
		"-vf", vf,
		"-c:v", "libx264", "-preset", preset, "-tune", "zerolatency", "-crf", crf, "-maxrate", maxrate, "-bufsize", "2M",
		"-force_key_frames", "expr:gte(t,n_forced*1)", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "128k", "-ac", "2", "-af", "aresample=async=1",
		"-sn", "-dn",
		// frag_duration: audio-only (radio) streams have no video keyframes to cut fragments at
		"-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-frag_duration", "1000000", "pipe:1",
	}
}

func (s *service) StreamLive(ctx context.Context, src io.Reader, dst io.Writer, height int) error {
	if !s.liveEnabled() {
		return core.ErrLiveDisabled
	}
	if !s.qualityAllowed(height) {
		return core.ErrLiveQuality
	}
	select {
	case s.liveSem <- struct{}{}:
		defer func() { <-s.liveSem }()
	default:
		return core.ErrLiveBusy
	}

	bin, pre := s.cfg.FFmpeg, []string{}
	if nice, err := exec.LookPath("nice"); err == nil {
		pre = []string{"-n", "5", bin}
		bin = nice
	}
	cmd := exec.CommandContext(ctx, bin, append(pre, liveArgs(height, s.cfg.Preset)...)...)
	cmd.Stdin = src
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}

	flusher, _ := dst.(http.Flusher)
	buf := make([]byte, 32*1024)
	var copyErr error
	for {
		n, rerr := stdout.Read(buf)
		if n > 0 {
			if _, werr := dst.Write(buf[:n]); werr != nil {
				copyErr = werr
				break
			}
			if flusher != nil {
				flusher.Flush() // push each chunk out immediately: this is a live stream
			}
		}
		if rerr != nil {
			break
		}
	}
	_ = cmd.Process.Kill() // client gone or stream ended: stop ffmpeg (and with it the upstream request)
	_ = cmd.Wait()
	if copyErr != nil && ctx.Err() == nil {
		log.Debug().Err(copyErr).Msg("live: client write failed")
	}
	return nil
}
