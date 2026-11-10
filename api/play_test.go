package api

import (
	"testing"

	"github.com/davidborzek/tvhgo/core"
)

func TestDownloadName(t *testing.T) {
	cases := []struct {
		rec  core.Recording
		want string
	}{
		{core.Recording{Filename: "/recordings/Emmerdale/Emmerdale - 2026-11-09 20.00.ts", Title: "Emmerdale"}, "Emmerdale - 2026-11-09 20.00.mp4"},
		{core.Recording{Filename: "", Title: "A/B"}, "A-B.mp4"},
		{core.Recording{}, "recording.mp4"},
	}
	for _, c := range cases {
		if got := downloadName(&c.rec); got != c.want {
			t.Errorf("downloadName(%q, %q) = %q, want %q", c.rec.Filename, c.rec.Title, got, c.want)
		}
	}
}
