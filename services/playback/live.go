package playback

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

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

// liveEncoder says how the video of a live stream is encoded.
type liveEncoder struct {
	vaapi  bool
	device string
}

// liveArgs builds the ffmpeg arguments (CPU encoder) that turn a raw MPEG-TS stream on stdin into a fragmented MP4
// on stdout.
func liveArgs(height int, preset string) []string {
	return liveArgsFor(liveEncoder{}, height, preset)
}

// liveArgsFor is liveArgs for a chosen encoder. The VAAPI variant decodes on the CPU (robust against the damaged
// packets of a live broadcast), then deinterlaces (only frames flagged interlaced), scales and encodes on the GPU in
// constant-quality mode, so quality and bitrate come out close to the x264 settings.
func liveArgsFor(enc liveEncoder, height int, preset string) []string {
	h := strconv.Itoa(height)
	// the video map is optional: radio channels have no video and come out as audio-only MP4
	// never upscale; keep the display aspect ratio (handles non-square-pixel SD); deinterlace interlaced frames
	vf := fmt.Sprintf("yadif=0:-1:1,scale=w=trunc(min(%s\\,ih)*dar/2)*2:h=min(%s\\,ih):flags=bilinear,setsar=1", h, h)
	if enc.vaapi {
		vf = fmt.Sprintf("format=nv12,hwupload,deinterlace_vaapi=auto=1,scale_vaapi=w=trunc(min(%s\\,ih)*dar/2)*2:h=min(%s\\,ih),setsar=1", h, h)
	}
	crf, maxrate := "23", "6M"
	switch {
	case height <= 360:
		crf, maxrate = "26", "1M"
	case height <= 480:
		crf, maxrate = "25", "2M"
	case height <= 720:
		crf, maxrate = "24", "4M"
	}
	args := []string{"-nostdin", "-v", "error", "-fflags", "+genpts+discardcorrupt",
		"-probesize", "1500000", "-analyzeduration", "1500000"}
	if enc.vaapi {
		args = append(args, "-vaapi_device", enc.device)
	}
	args = append(args, "-i", "pipe:0", "-map", "0:v:0?", "-map", "0:a:0?", "-vf", vf)
	if enc.vaapi {
		args = append(args,
			"-c:v", "h264_vaapi", "-rc_mode", "ICQ", "-global_quality", crf, "-maxrate", maxrate, "-bufsize", "2M",
			"-profile:v", "high", "-g", "50", "-force_key_frames", "expr:gte(t,n_forced*1)")
	} else {
		args = append(args,
			"-c:v", "libx264", "-preset", preset, "-tune", "zerolatency", "-crf", crf, "-maxrate", maxrate, "-bufsize", "2M",
			"-force_key_frames", "expr:gte(t,n_forced*1)", "-pix_fmt", "yuv420p")
	}
	return append(args,
		"-c:a", "aac", "-b:a", "128k", "-ac", "2", "-af", "aresample=async=1",
		"-sn", "-dn",
		// frag_duration: audio-only (radio) streams have no video keyframes to cut fragments at
		"-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-frag_duration", "1000000", "pipe:1",
	)
}

// encoder returns the encoder to use for a new live stream: the GPU if it is configured and has proved to work,
// otherwise the CPU.
func (s *service) encoder() liveEncoder {
	if s.cfg.LiveEncoder != "vaapi" || s.vaapiBroken.Load() {
		return liveEncoder{}
	}
	s.vaapiOnce.Do(func() {
		if err := s.probeVAAPI(); err != nil {
			log.Warn().Err(err).Str("device", s.cfg.LiveVAAPIDevice).Msg("live: GPU encoding not available, using the CPU")
			s.vaapiBroken.Store(true)
			return
		}
		log.Info().Str("device", s.cfg.LiveVAAPIDevice).Msg("live: GPU (VAAPI) encoding enabled")
	})
	if s.vaapiBroken.Load() {
		return liveEncoder{}
	}
	return liveEncoder{vaapi: true, device: s.cfg.LiveVAAPIDevice}
}

// probeVAAPI encodes a few test frames on the GPU.
func (s *service) probeVAAPI() error {
	if _, err := os.Stat(s.cfg.LiveVAAPIDevice); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, s.cfg.FFmpeg, "-nostdin", "-v", "error", "-vaapi_device", s.cfg.LiveVAAPIDevice,
		"-f", "lavfi", "-i", "testsrc=size=320x180:rate=25", "-frames:v", "5",
		"-vf", "format=nv12,hwupload", "-c:v", "h264_vaapi", "-f", "null", "-").CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if len(msg) > 300 {
			msg = msg[len(msg)-300:]
		}
		return fmt.Errorf("test encode failed: %w: %s", err, msg)
	}
	return nil
}

// vaapiFailed is called when a GPU stream died without producing anything: stop using the GPU until restart.
func (s *service) vaapiFailed(err error) {
	if s.vaapiBroken.CompareAndSwap(false, true) {
		log.Warn().Err(err).Msg("live: GPU encoding failed on a stream, falling back to the CPU until restart")
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
	enc := s.encoder()
	cmd := exec.CommandContext(ctx, bin, append(pre, liveArgsFor(enc, height, s.cfg.Preset)...)...)
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
	var sent int64
	for {
		n, rerr := stdout.Read(buf)
		if n > 0 {
			sent += int64(n)
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
	werr := cmd.Wait()
	if enc.vaapi && sent == 0 && werr != nil && ctx.Err() == nil {
		s.vaapiFailed(werr)
	}
	if copyErr != nil && ctx.Err() == nil {
		log.Debug().Err(copyErr).Msg("live: client write failed")
	}
	return nil
}
