package playback

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"sync"
	"time"

	"github.com/davidborzek/tvhgo/core"
)

// adTitle matches chapter names that mark an advert break ("Commercial", "Ad", "Advert", "Advertisement",
// "Intermission"), as Jellyfin's Intro Skipper plugin does; "Ad End"-style names do not count.
var (
	adTitle    = regexp.MustCompile(`(?i)(^|\s)(ad|adverts?|advertisement|commercial|intermission)(\s|:|$)`)
	adTitleEnd = regexp.MustCompile(`(?i)(ad|adverts?|advertisement|commercial|intermission)[\s:]+end`)
)

// IsAdChapter reports whether a chapter title marks an advert break.
func IsAdChapter(title string) bool {
	return adTitle.MatchString(title) && !adTitleEnd.MatchString(title)
}

type probeChapters struct {
	Chapters []struct {
		StartTime string            `json:"start_time"`
		EndTime   string            `json:"end_time"`
		Tags      map[string]string `json:"tags"`
	} `json:"chapters"`
}

// parseChapters turns ffprobe's -show_chapters JSON into chapters.
func parseChapters(data []byte) ([]core.Chapter, error) {
	var p probeChapters
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	list := make([]core.Chapter, 0, len(p.Chapters))
	for _, c := range p.Chapters {
		start, err1 := strconv.ParseFloat(c.StartTime, 64)
		end, err2 := strconv.ParseFloat(c.EndTime, 64)
		if err1 != nil || err2 != nil || end <= start {
			continue
		}
		title := c.Tags["title"]
		list = append(list, core.Chapter{Start: start, End: end, Title: title, Advert: IsAdChapter(title)})
	}
	return list, nil
}

type chapterCache struct {
	mod  time.Time
	size int64
	list []core.Chapter
}

var (
	chaptersMu    sync.Mutex
	chaptersCache = map[string]chapterCache{}
)

// Chapters returns the chapters of the recording's playable MP4 (none if it has none or there is no MP4). Results are
// cached until the file changes, so playing a recording does not run ffprobe each time.
func (s *service) Chapters(ctx context.Context, rec *core.Recording) ([]core.Chapter, error) {
	p, ok := s.File(rec)
	if !ok {
		return []core.Chapter{}, nil
	}
	fi, err := os.Stat(p)
	if err != nil {
		return []core.Chapter{}, nil
	}
	chaptersMu.Lock()
	if c, hit := chaptersCache[p]; hit && c.mod.Equal(fi.ModTime()) && c.size == fi.Size() {
		chaptersMu.Unlock()
		return c.list, nil
	}
	chaptersMu.Unlock()

	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, s.cfg.FFprobe, "-v", "error", "-of", "json", "-show_chapters", "file:"+p).Output()
	if err != nil {
		return nil, fmt.Errorf("ffprobe: %w", err)
	}
	list, err := parseChapters(out)
	if err != nil {
		return nil, err
	}
	chaptersMu.Lock()
	chaptersCache[p] = chapterCache{mod: fi.ModTime(), size: fi.Size(), list: list}
	chaptersMu.Unlock()
	return list, nil
}
