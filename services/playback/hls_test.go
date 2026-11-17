package playback

import (
	"strings"
	"testing"
)

func TestHLSArgs(t *testing.T) {
	args := strings.Join(hlsArgs(720, "veryfast", "/tmp/x"), " ")
	for _, want := range []string{"-f hls", "-hls_time 2", "/tmp/x/seg%d.ts", "/tmp/x/index.m3u8", "libx264", "-map 0:v:0?"} {
		if !strings.Contains(args, want) {
			t.Errorf("hls args missing %q: %s", want, args)
		}
	}
	for _, bad := range []string{"-f mp4", "pipe:1", "frag_keyframe"} {
		if strings.Contains(args, bad) {
			t.Errorf("hls args must not contain %q: %s", bad, args)
		}
	}
}

func TestHLSFileRejectsOddNames(t *testing.T) {
	s := &service{}
	for _, name := range []string{"../etc/passwd", "seg1.mp4", "index.m3u8/../x", ""} {
		if _, ok := s.HLSFile("nosuch", name); ok {
			t.Errorf("accepted %q", name)
		}
	}
}

func TestHLSWindow(t *testing.T) {
	if hlsSegments(30) != 900 || hlsSegments(0) != 8 {
		t.Errorf("unexpected window: %d, %d", hlsSegments(30), hlsSegments(0))
	}
	args := strings.Join(hlsArgsFor(liveEncoder{}, 720, "veryfast", "/tmp/x", hlsSegments(30)), " ")
	if !strings.Contains(args, "-hls_list_size 900") {
		t.Errorf("window not applied: %s", args)
	}
}
