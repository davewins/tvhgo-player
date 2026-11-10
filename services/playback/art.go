package playback

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/davidborzek/tvhgo/core"
	"github.com/rs/zerolog/log"
)

const (
	tmdbAPIBase   = "https://api.themoviedb.org/3"
	tmdbImageBase = "https://image.tmdb.org/t/p/w780"
	tmdbMissTTL   = 7 * 24 * time.Hour
)

// lockFor returns a mutex for a cache key so concurrent requests for the same artwork do the work once.
func (s *service) lockFor(key string) *sync.Mutex {
	s.artMu.Lock()
	defer s.artMu.Unlock()
	if s.artLocks == nil {
		s.artLocks = map[string]*sync.Mutex{}
	}
	m, ok := s.artLocks[key]
	if !ok {
		m = &sync.Mutex{}
		s.artLocks[key] = m
	}
	return m
}

func (s *service) artDir(sub string) string {
	d := filepath.Join(s.cfg.CacheDir, sub)
	_ = os.MkdirAll(d, 0o755)
	return d
}

func (s *service) Thumb(ctx context.Context, rec *core.Recording) (string, bool) {
	if rec == nil {
		return "", false
	}
	if rec.Status == "completed" {
		if p, ok := s.frame(ctx, rec); ok {
			return p, true
		}
	}
	if s.cfg.TMDBAPIKey != "" {
		return s.tmdbImage(ctx, rec.Title)
	}
	return "", false
}

// ProgrammeArt returns TMDb artwork for a programme title: there is no frame to take for something not yet recorded.
func (s *service) ProgrammeArt(ctx context.Context, title string) (string, bool) {
	if s.cfg.TMDBAPIKey == "" {
		return "", false
	}
	return s.tmdbImage(ctx, title)
}

// frame returns a still from the recording: the pipeline's "<name>-thumb.jpg" next to the MP4 if there is one,
// else one cached by tvhgo, else one extracted now (from the playable MP4 or the original file).
func (s *service) frame(ctx context.Context, rec *core.Recording) (string, bool) {
	rel, ok := s.relPath(rec)
	if !ok {
		return "", false
	}
	if s.cfg.SourceDir != "" {
		p := filepath.Join(s.cfg.SourceDir, rel+"-thumb.jpg")
		if within(s.cfg.SourceDir, p) && fileOK(p) {
			return p, true
		}
	}

	in, fi, ok := s.original(rec)
	if mp4, have := s.File(rec); have {
		in = mp4
		if st, err := os.Stat(mp4); err == nil {
			fi = st
		}
	} else if !ok {
		return "", false
	}
	if fi == nil {
		return "", false
	}
	out := filepath.Join(s.artDir("thumbs"), fmt.Sprintf("%s-%d-%d.jpg", safeID(rec.ID), fi.Size(), fi.ModTime().Unix()))
	if fileOK(out) {
		return out, true
	}
	if _, err := exec.LookPath(s.cfg.FFmpeg); err != nil {
		return "", false
	}

	mu := s.lockFor(out)
	mu.Lock()
	defer mu.Unlock()
	if fileOK(out) {
		return out, true
	}
	s.artSem <- struct{}{}
	defer func() { <-s.artSem }()

	cctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	ss := "60"
	if p, err := s.probe(cctx, in); err == nil {
		if d, _ := strconv.ParseFloat(p.Format.Duration, 64); d > 0 {
			ss = strconv.Itoa(int(d * 0.15))
		}
	}
	tmp := out + ".tmp.jpg"
	cmd := exec.CommandContext(cctx, s.cfg.FFmpeg, "-nostdin", "-v", "error", "-y", "-ss", ss, "-i", "file:"+in,
		"-vf", "thumbnail=150,scale=640:-2", "-frames:v", "1", "-q:v", "4", tmp)
	if err := cmd.Run(); err != nil || !fileOK(tmp) {
		_ = os.Remove(tmp)
		log.Debug().Err(err).Str("recording", rec.ID).Msg("artwork: frame extraction failed")
		return "", false
	}
	if err := os.Rename(tmp, out); err != nil {
		return "", false
	}
	return out, true
}

// normTitle lower-cases and strips everything but letters and digits, so "Doctor Who!" == "doctor who".
func normTitle(t string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(t) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

type tmdbResult struct {
	Name         string  `json:"name"`
	OriginalName string  `json:"original_name"`
	Title        string  `json:"title"`
	OriginalTitl string  `json:"original_title"`
	Backdrop     string  `json:"backdrop_path"`
	Poster       string  `json:"poster_path"`
	Popularity   float64 `json:"popularity"`
	// OriginCountry is where a TV show comes from ("GB", "US"...); movies do not have it
	OriginCountry []string `json:"origin_country"`
}

// ukBonus puts a UK-made show ahead of any other with the same title, however popular: this is UK television, and
// "Countdown" means the Channel 4 game show, not the American drama of that name.
const ukBonus = 1e6

func (r tmdbResult) score() float64 {
	for _, c := range r.OriginCountry {
		if c == "GB" {
			return r.Popularity + ukBonus
		}
	}
	return r.Popularity
}

func (s *service) tmdbSearch(ctx context.Context, kind, title string) (string, error) {
	q := url.Values{}
	q.Set("api_key", s.cfg.TMDBAPIKey)
	q.Set("query", title)
	q.Set("language", s.cfg.TMDBLanguage)
	q.Set("include_adult", "false")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.tmdbAPI+"/search/"+kind+"?"+q.Encode(), nil)
	if err != nil {
		return "", err
	}
	res, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("tmdb search: http %d", res.StatusCode)
	}
	var body struct {
		Results []tmdbResult `json:"results"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return "", err
	}
	want := normTitle(title)
	best, bestScore := "", -1.0
	for _, r := range body.Results {
		// only accept an exact (normalised) title match: a wrong picture is worse than none
		match := normTitle(r.Name) == want || normTitle(r.OriginalName) == want ||
			normTitle(r.Title) == want || normTitle(r.OriginalTitl) == want
		img := r.Backdrop
		if img == "" {
			img = r.Poster
		}
		if match && img != "" && r.score() > bestScore {
			best, bestScore = img, r.score()
		}
	}
	return best, nil
}

// tmdbImage returns cached TMDb artwork (a landscape backdrop, else the poster) for a programme title.
func (s *service) tmdbImage(ctx context.Context, title string) (string, bool) {
	key := normTitle(title)
	if key == "" || len(key) > 120 {
		return "", false
	}
	// "art2": pictures cached before UK shows were preferred could be the wrong show with the same title
	dir := s.artDir("art2")
	img := filepath.Join(dir, key+".jpg")
	miss := filepath.Join(dir, key+".none")
	if fileOK(img) {
		return img, true
	}
	if fi, err := os.Stat(miss); err == nil && time.Since(fi.ModTime()) < tmdbMissTTL {
		return "", false
	}

	mu := s.lockFor("tmdb:" + key)
	mu.Lock()
	defer mu.Unlock()
	if fileOK(img) {
		return img, true
	}
	s.artSem <- struct{}{}
	defer func() { <-s.artSem }()

	cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	path := ""
	for _, kind := range []string{"tv", "movie"} {
		p, err := s.tmdbSearch(cctx, kind, title)
		if err != nil {
			log.Debug().Err(err).Str("title", title).Msg("artwork: tmdb lookup failed")
			return "", false // transient: do not cache a miss
		}
		if p != "" {
			path = p
			break
		}
	}
	if path == "" {
		_ = os.WriteFile(miss, nil, 0o644)
		return "", false
	}
	req, err := http.NewRequestWithContext(cctx, http.MethodGet, s.tmdbImg+path, nil)
	if err != nil {
		return "", false
	}
	res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil || res.StatusCode != http.StatusOK {
		if res != nil {
			res.Body.Close()
		}
		return "", false
	}
	defer res.Body.Close()
	tmp := img + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return "", false
	}
	_, cerr := io.Copy(f, io.LimitReader(res.Body, 10<<20))
	f.Close()
	if cerr != nil || !fileOK(tmp) {
		_ = os.Remove(tmp)
		return "", false
	}
	if err := os.Rename(tmp, img); err != nil {
		return "", false
	}
	return img, true
}
