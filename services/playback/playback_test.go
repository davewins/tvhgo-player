package playback

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/davidborzek/tvhgo/config"
	"github.com/davidborzek/tvhgo/core"
)

func testService(t *testing.T) (*service, string) {
	t.Helper()
	dir := t.TempDir()
	cfg := config.PlaybackConfig{
		TvheadendRoot: "/recordings",
		RecordingsDir: filepath.Join(dir, "rec"),
		SourceDir:     filepath.Join(dir, "src"),
		CacheDir:      filepath.Join(dir, "cache"),
		Convert:       true,
		CacheMaxGB:    1,
		MaxJobs:       1,
	}
	cfg.SetDefaults()
	cfg.RecordingsDir = filepath.Join(dir, "rec")
	for _, d := range []string{cfg.RecordingsDir, cfg.SourceDir, cfg.CacheDir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	return &service{cfg: cfg, jobs: map[string]*job{}, sem: make(chan struct{}, 1), liveSem: make(chan struct{}, 1), artSem: make(chan struct{}, 2)}, dir
}

func write(t *testing.T, p string, n int) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, make([]byte, n), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestRelPathRejectsEscapes(t *testing.T) {
	s, _ := testService(t)
	for _, fn := range []string{"", "/other/x.ts", "/recordings/../etc/passwd", "/recordings/", "/recordings"} {
		if rel, ok := s.relPath(&core.Recording{Filename: fn}); ok && (strings.Contains(rel, "..") || rel == "") {
			t.Errorf("%q accepted as %q", fn, rel)
		}
	}
	if rel, ok := s.relPath(&core.Recording{Filename: "/recordings/Show/Show - 1.ts"}); !ok || rel != "Show/Show - 1" {
		t.Errorf("got %q %v", rel, ok)
	}
	// ".." segments are collapsed inside the root, never escape it
	if rel, ok := s.relPath(&core.Recording{Filename: "/recordings/a/../../x.ts"}); ok && strings.HasPrefix(rel, "..") {
		t.Errorf("escaped: %q", rel)
	}
}

func TestSourceDirIsPreferred(t *testing.T) {
	s, dir := testService(t)
	rec := &core.Recording{ID: "abc", Filename: "/recordings/Show/Show - 1.ts"}
	write(t, filepath.Join(dir, "rec", "Show", "Show - 1.ts"), 10)
	if info := s.Status(rec); info.Status != core.PlaybackNone || !info.CanConvert {
		t.Fatalf("expected none+canConvert, got %+v", info)
	}
	write(t, filepath.Join(dir, "src", "Show", "Show - 1.mp4"), 10)
	info := s.Status(rec)
	if info.Status != core.PlaybackReady || info.Source != "library" {
		t.Fatalf("expected ready from library, got %+v", info)
	}
	if p, ok := s.File(rec); !ok || !strings.HasSuffix(p, "Show - 1.mp4") {
		t.Fatalf("file: %q %v", p, ok)
	}
}

func TestCacheHitAndInvalidation(t *testing.T) {
	s, dir := testService(t)
	rec := &core.Recording{ID: "r1", Filename: "/recordings/Show/Show - 1.ts"}
	orig := filepath.Join(dir, "rec", "Show", "Show - 1.ts")
	write(t, orig, 10)
	fi, _ := os.Stat(orig)
	write(t, s.cacheFile(rec, fi), 5)
	if info := s.Status(rec); info.Status != core.PlaybackReady || info.Source != "cache" {
		t.Fatalf("expected cache hit, got %+v", info)
	}
	// original changes -> cache key changes -> not ready any more
	write(t, orig, 20)
	if info := s.Status(rec); info.Status != core.PlaybackNone {
		t.Fatalf("expected none after change, got %+v", info)
	}
}

func TestConversionDisabled(t *testing.T) {
	s, dir := testService(t)
	s.cfg.Convert = false
	rec := &core.Recording{ID: "r1", Filename: "/recordings/Show/Show - 1.ts"}
	write(t, filepath.Join(dir, "rec", "Show", "Show - 1.ts"), 10)
	if _, err := s.Prepare(rec); err != core.ErrPlaybackConversionDisabled {
		t.Fatalf("got %v", err)
	}
	if info := s.Status(rec); info.CanConvert {
		t.Fatalf("canConvert should be false: %+v", info)
	}
}

func TestBuildArgsAnamorphicSDMpeg2(t *testing.T) {
	s, _ := testService(t)
	p := &probe{}
	p.Streams = append(p.Streams,
		struct {
			Index       int               `json:"index"`
			CodecType   string            `json:"codec_type"`
			CodecName   string            `json:"codec_name"`
			Height      int               `json:"height"`
			SAR         string            `json:"sample_aspect_ratio"`
			DAR         string            `json:"display_aspect_ratio"`
			Channels    int               `json:"channels"`
			Disposition map[string]int    `json:"disposition"`
			Tags        map[string]string `json:"tags"`
		}{Index: 1, CodecType: "video", CodecName: "mpeg2video", Height: 576, SAR: "32:17", DAR: "16:9"},
		struct {
			Index       int               `json:"index"`
			CodecType   string            `json:"codec_type"`
			CodecName   string            `json:"codec_name"`
			Height      int               `json:"height"`
			SAR         string            `json:"sample_aspect_ratio"`
			DAR         string            `json:"display_aspect_ratio"`
			Channels    int               `json:"channels"`
			Disposition map[string]int    `json:"disposition"`
			Tags        map[string]string `json:"tags"`
		}{Index: 2, CodecType: "audio", Channels: 0, Disposition: map[string]int{"visual_impaired": 1}},
		struct {
			Index       int               `json:"index"`
			CodecType   string            `json:"codec_type"`
			CodecName   string            `json:"codec_name"`
			Height      int               `json:"height"`
			SAR         string            `json:"sample_aspect_ratio"`
			DAR         string            `json:"display_aspect_ratio"`
			Channels    int               `json:"channels"`
			Disposition map[string]int    `json:"disposition"`
			Tags        map[string]string `json:"tags"`
		}{Index: 3, CodecType: "audio", Channels: 2},
	)
	args, err := s.buildArgs("/in.ts", "/out.mp4.part", p)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(args, " ")
	for _, want := range []string{"-map 0:1", "-map 0:3", "yadif=0:-1:0", "scale=1024:576", "setsar=1", "-crf 20", "-g 50", "open-gop=0"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in %s", want, joined)
		}
	}
	if strings.Contains(joined, "-map 0:2") {
		t.Error("audio-description track must not be mapped")
	}
}

func TestCleanupAgeAndSize(t *testing.T) {
	s, dir := testService(t)
	s.cfg.CacheMaxAgeDays = 10
	s.cfg.CacheMaxGB = 0 // limit 0 bytes -> everything that survives age must go oldest-first
	old := filepath.Join(dir, "cache", "old.mp4")
	fresh := filepath.Join(dir, "cache", "fresh.mp4")
	write(t, old, 10)
	write(t, fresh, 10)
	past := time.Now().Add(-20 * 24 * time.Hour)
	_ = os.Chtimes(old, past, past)
	s.cleanup()
	if _, err := os.Stat(old); err == nil {
		t.Error("old file not removed")
	}
	if _, err := os.Stat(fresh); err == nil {
		t.Error("fresh file not removed by size limit")
	}
	// within limits nothing is removed
	s.cfg.CacheMaxGB = 1
	write(t, fresh, 10)
	s.cleanup()
	if _, err := os.Stat(fresh); err != nil {
		t.Error("file within limits was removed")
	}
}

func TestLiveArgs(t *testing.T) {
	joined := strings.Join(liveArgs(720, "veryfast"), " ")
	for _, want := range []string{"pipe:0", "pipe:1", "min(720\\,ih)", "-crf 24", "frag_keyframe+empty_moov", "-frag_duration 1000000", "-map 0:v:0?", "-map 0:a:0?", "n_forced*1"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %q in %s", want, joined)
		}
	}
	if !strings.Contains(strings.Join(liveArgs(360, "veryfast"), " "), "-maxrate 1M") {
		t.Error("360p should use the low bitrate cap")
	}
}

func TestLiveQualityValidation(t *testing.T) {
	s, _ := testService(t)
	on := true
	s.cfg.LiveTranscode = &on
	s.cfg.LiveQualities = []int{720, 480}
	if err := s.StreamLive(context.Background(), nil, nil, 1080); err != core.ErrLiveQuality {
		t.Fatalf("want ErrLiveQuality, got %v", err)
	}
	off := false
	s.cfg.LiveTranscode = &off
	if q := s.LiveQualities(); len(q) != 0 {
		t.Fatalf("disabled should list nothing: %v", q)
	}
	if err := s.StreamLive(context.Background(), nil, nil, 720); err != core.ErrLiveDisabled {
		t.Fatalf("want ErrLiveDisabled, got %v", err)
	}
}

func TestNormTitle(t *testing.T) {
	if normTitle("Doctor Who!") != normTitle("doctor  who") {
		t.Fatal("normalisation")
	}
	if normTitle("Emmerdale") == normTitle("Emmerdale 1918") {
		t.Fatal("different titles must not match")
	}
}

func TestTMDbArtwork(t *testing.T) {
	var searches, downloads int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/search/tv"):
			atomic.AddInt32(&searches, 1)
			if r.URL.Query().Get("api_key") != "k" {
				w.WriteHeader(401)
				return
			}
			// a wrong, more popular result first, then the exact one
			_, _ = w.Write([]byte(`{"results":[{"name":"Emmerdale 1918","backdrop_path":"/wrong.jpg","popularity":99},{"name":"Emmerdale","backdrop_path":"/right.jpg","popularity":5}]}`))
		case strings.HasPrefix(r.URL.Path, "/search/movie"):
			_, _ = w.Write([]byte(`{"results":[]}`))
		case r.URL.Path == "/img/right.jpg":
			atomic.AddInt32(&downloads, 1)
			_, _ = w.Write([]byte("JPEGDATA"))
		default:
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()

	s, _ := testService(t)
	s.cfg.TMDBAPIKey, s.cfg.TMDBLanguage = "k", "en-GB"
	s.tmdbAPI, s.tmdbImg = srv.URL, srv.URL+"/img"

	p, ok := s.tmdbImage(context.Background(), "Emmerdale")
	if !ok {
		t.Fatal("expected artwork")
	}
	if b, _ := os.ReadFile(p); string(b) != "JPEGDATA" {
		t.Fatalf("wrong image content %q", b)
	}
	if _, ok := s.tmdbImage(context.Background(), "emmerdale"); !ok || atomic.LoadInt32(&searches) != 1 || atomic.LoadInt32(&downloads) != 1 {
		t.Fatalf("second call must come from cache (searches=%d downloads=%d)", searches, downloads)
	}

	// no exact match -> nothing, and the miss is remembered (no repeated lookups)
	srv2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&searches, 1)
		_, _ = w.Write([]byte(`{"results":[{"name":"Something Else","backdrop_path":"/x.jpg","popularity":1}]}`))
	}))
	defer srv2.Close()
	s.tmdbAPI = srv2.URL
	before := atomic.LoadInt32(&searches)
	if _, ok := s.tmdbImage(context.Background(), "ITV Lunchtime News"); ok {
		t.Fatal("must not accept a non-matching result")
	}
	mid := atomic.LoadInt32(&searches)
	s.tmdbImage(context.Background(), "ITV Lunchtime News")
	if atomic.LoadInt32(&searches) != mid || mid == before {
		t.Fatalf("miss should be cached: before=%d mid=%d now=%d", before, mid, searches)
	}
}

func TestThumbPrefersPipelineFrame(t *testing.T) {
	s, dir := testService(t)
	rec := &core.Recording{ID: "r1", Title: "Show", Status: "completed", Filename: "/recordings/Show/Show - 1.ts"}
	write(t, filepath.Join(dir, "rec", "Show", "Show - 1.ts"), 10)
	write(t, filepath.Join(dir, "src", "Show", "Show - 1-thumb.jpg"), 7)
	p, ok := s.Thumb(context.Background(), rec)
	if !ok || !strings.HasSuffix(p, "Show - 1-thumb.jpg") {
		t.Fatalf("got %q %v", p, ok)
	}
	// an upcoming recording has no frame and (without a TMDb key) no artwork
	up := &core.Recording{ID: "r2", Title: "Show", Status: "scheduled"}
	if _, ok := s.Thumb(context.Background(), up); ok {
		t.Fatal("no artwork expected")
	}
}

func TestBuildArgsAudioOnly(t *testing.T) {
	s, _ := testService(t)
	p := &probe{}
	st := struct {
		Index       int               `json:"index"`
		CodecType   string            `json:"codec_type"`
		CodecName   string            `json:"codec_name"`
		Height      int               `json:"height"`
		SAR         string            `json:"sample_aspect_ratio"`
		DAR         string            `json:"display_aspect_ratio"`
		Channels    int               `json:"channels"`
		Disposition map[string]int    `json:"disposition"`
		Tags        map[string]string `json:"tags"`
	}{Index: 0, CodecType: "audio", CodecName: "mp2", Channels: 2}
	p.Streams = append(p.Streams, st)
	args, err := s.buildArgs("/in.ts", "/out.mp4.part", p)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "-vn") || !strings.Contains(joined, "-c:a aac") || strings.Contains(joined, "libx264") {
		t.Fatalf("expected an audio-only conversion, got %s", joined)
	}
	if _, err := s.buildArgs("/in.ts", "/out", &probe{}); err == nil {
		t.Fatal("a file with no streams must be rejected")
	}
}

func TestProgrammeArtNeedsAKey(t *testing.T) {
	s, _ := testService(t)
	s.cfg.TMDBAPIKey = ""
	if p, ok := s.ProgrammeArt(context.Background(), "Emmerdale"); ok || p != "" {
		t.Fatalf("no key must give no artwork, got %q %v", p, ok)
	}
}

func TestProgrammeArtUsesTMDb(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/search/tv"):
			_, _ = w.Write([]byte(`{"results":[{"name":"Bargain Hunt","backdrop_path":"/bh.jpg","popularity":5}]}`))
		case r.URL.Path == "/img/bh.jpg":
			_, _ = w.Write([]byte("JPEGDATA"))
		default:
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()
	s, _ := testService(t)
	s.cfg.TMDBAPIKey, s.cfg.TMDBLanguage = "k", "en-GB"
	s.tmdbAPI, s.tmdbImg = srv.URL, srv.URL+"/img"
	if _, ok := s.ProgrammeArt(context.Background(), "Bargain Hunt"); !ok {
		t.Fatal("expected artwork for an exact title match")
	}
}
