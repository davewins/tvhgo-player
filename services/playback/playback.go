// Package playback finds or creates browser-playable MP4 copies of finished recordings.
package playback

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/davidborzek/tvhgo/config"
	"github.com/davidborzek/tvhgo/core"
	"github.com/davidborzek/tvhgo/services/pipeline"
	"github.com/rs/zerolog/log"
)

type job struct {
	status   core.PlaybackStatus
	progress int
	err      string
}

type service struct {
	cfg  config.PlaybackConfig
	mu   sync.Mutex
	jobs map[string]*job
	sem  chan struct{}
	// limits concurrent live transcodes
	liveSem chan struct{}
	// artwork (see art.go)
	artMu    sync.Mutex
	artLocks map[string]*sync.Mutex
	artSem   chan struct{}
	tmdbAPI  string
	tmdbImg  string
	// the recording pipeline's progress (nil without a status file)
	pipe *pipeline.Reader
	// GPU live encoding: probed once, switched off for good if it fails
	vaapiOnce   sync.Once
	vaapiBroken atomic.Bool
}

// New creates the playback service. With conversion enabled it also starts the cache cleanup.
func New(cfg config.PlaybackConfig) core.PlaybackService {
	s := &service{
		cfg:      cfg,
		jobs:     map[string]*job{},
		sem:      make(chan struct{}, cfg.MaxJobs),
		liveSem:  make(chan struct{}, cfg.LiveMaxStreams),
		artLocks: map[string]*sync.Mutex{},
		artSem:   make(chan struct{}, 4),
		tmdbAPI:  tmdbAPIBase,
		tmdbImg:  tmdbImageBase,
		pipe:     pipeline.New(cfg.PipelineStatus),
	}
	if cfg.Convert {
		if err := os.MkdirAll(cfg.CacheDir, 0o755); err != nil {
			log.Error().Err(err).Str("dir", cfg.CacheDir).Msg("playback: cannot create cache dir")
		}
		s.removePartials()
		go func() {
			for {
				s.cleanup()
				time.Sleep(time.Hour)
			}
		}()
	}
	return s
}

// relPath returns the recording's path relative to the tvheadend root, without extension.
func (s *service) relPath(rec *core.Recording) (string, bool) {
	root := strings.TrimRight(s.cfg.TvheadendRoot, "/") + "/"
	if rec == nil || !strings.HasPrefix(rec.Filename, root) {
		return "", false
	}
	rel := filepath.Clean("/" + strings.TrimPrefix(rec.Filename, root))
	rel = strings.TrimPrefix(rel, "/")
	if rel == "" || rel == "." {
		return "", false
	}
	return strings.TrimSuffix(rel, filepath.Ext(rel)), true
}

func within(base, p string) bool {
	return strings.HasPrefix(p, filepath.Clean(base)+string(os.PathSeparator))
}

func (s *service) sourceFile(rec *core.Recording) (string, bool) {
	if s.cfg.SourceDir == "" {
		return "", false
	}
	rel, ok := s.relPath(rec)
	if !ok {
		return "", false
	}
	p := filepath.Join(s.cfg.SourceDir, rel+".mp4")
	if !within(s.cfg.SourceDir, p) {
		return "", false
	}
	if fi, err := os.Stat(p); err != nil || !fi.Mode().IsRegular() || fi.Size() == 0 {
		return "", false
	}
	return p, true
}

// original returns the recorded file as tvhgo sees it.
func (s *service) original(rec *core.Recording) (string, os.FileInfo, bool) {
	rel, ok := s.relPath(rec)
	if !ok {
		return "", nil, false
	}
	p := filepath.Join(s.cfg.RecordingsDir, rel+filepath.Ext(rec.Filename))
	if !within(s.cfg.RecordingsDir, p) {
		return "", nil, false
	}
	fi, err := os.Stat(p)
	if err != nil || !fi.Mode().IsRegular() || fi.Size() == 0 {
		return "", nil, false
	}
	return p, fi, true
}

// cacheFile is keyed by recording id plus size and mtime of the original, so a changed file is converted again.
func (s *service) cacheFile(rec *core.Recording, fi os.FileInfo) string {
	return filepath.Join(s.cfg.CacheDir, fmt.Sprintf("%s-%d-%d.mp4", safeID(rec.ID), fi.Size(), fi.ModTime().Unix()))
}

func safeID(id string) string {
	return strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, id)
}

// PlayableSize is the size of the recording's MP4 copy in the library (0 if there is none).
func (s *service) PlayableSize(rec *core.Recording) int64 {
	p, ok := s.sourceFile(rec)
	if !ok {
		return 0
	}
	if fi, err := os.Stat(p); err == nil {
		return fi.Size()
	}
	return 0
}

func (s *service) File(rec *core.Recording) (string, bool) {
	if p, ok := s.sourceFile(rec); ok {
		return p, true
	}
	if !s.cfg.Convert {
		return "", false
	}
	if _, fi, ok := s.original(rec); ok {
		c := s.cacheFile(rec, fi)
		if cfi, err := os.Stat(c); err == nil && cfi.Mode().IsRegular() && cfi.Size() > 0 {
			now := time.Now()
			_ = os.Chtimes(c, now, now) // mark as recently played for the cache cleanup
			return c, true
		}
	}
	return "", false
}

func (s *service) Status(rec *core.Recording) core.PlaybackInfo {
	if p, ok := s.sourceFile(rec); ok {
		_ = p
		return core.PlaybackInfo{Status: core.PlaybackReady, Progress: 100, Source: "library"}
	}
	if !s.cfg.Convert {
		return core.PlaybackInfo{Status: core.PlaybackNone}
	}
	_, fi, ok := s.original(rec)
	if !ok {
		return core.PlaybackInfo{Status: core.PlaybackNone}
	}
	if c := s.cacheFile(rec, fi); fileOK(c) {
		return core.PlaybackInfo{Status: core.PlaybackReady, Progress: 100, Source: "cache", CanConvert: true}
	}
	// the recording pipeline is already converting this one: show its progress instead of starting a second conversion
	if pct, ok := s.pipe.Converting(rec.ID); ok {
		return core.PlaybackInfo{Status: core.PlaybackConverting, Progress: pct, Source: "pipeline", CanConvert: true}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if j, ok := s.jobs[rec.ID]; ok {
		return core.PlaybackInfo{Status: j.status, Progress: j.progress, Error: j.err, CanConvert: true, Ahead: s.aheadLocked(j)}
	}
	return core.PlaybackInfo{Status: core.PlaybackNone, CanConvert: true}
}

func fileOK(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && fi.Mode().IsRegular() && fi.Size() > 0
}

// aheadLocked counts the conversions in front of a queued job: those running or queued (the pipeline's counts too).
func (s *service) aheadLocked(self *job) int {
	if self.status != core.PlaybackQueued {
		return 0
	}
	n := 0
	for _, o := range s.jobs {
		if o != self && (o.status == core.PlaybackConverting || o.status == core.PlaybackQueued) {
			n++
		}
	}
	return n
}

func (s *service) Prepare(rec *core.Recording) (core.PlaybackInfo, error) {
	if info := s.Status(rec); info.Status == core.PlaybackReady || info.Source == "pipeline" {
		return info, nil
	}
	if !s.cfg.Convert {
		return core.PlaybackInfo{Status: core.PlaybackNone}, core.ErrPlaybackConversionDisabled
	}
	in, fi, ok := s.original(rec)
	if !ok {
		return core.PlaybackInfo{Status: core.PlaybackNone}, core.ErrPlaybackNoSource
	}
	out := s.cacheFile(rec, fi)

	s.mu.Lock()
	if j, exists := s.jobs[rec.ID]; exists && (j.status == core.PlaybackQueued || j.status == core.PlaybackConverting) {
		info := core.PlaybackInfo{Status: j.status, Progress: j.progress, CanConvert: true}
		s.mu.Unlock()
		return info, nil
	}
	j := &job{status: core.PlaybackQueued}
	s.jobs[rec.ID] = j
	s.mu.Unlock()

	go s.run(rec.ID, in, out, j)
	return core.PlaybackInfo{Status: core.PlaybackQueued, CanConvert: true}, nil
}

func (s *service) set(j *job, status core.PlaybackStatus, progress int, errMsg string) {
	s.mu.Lock()
	j.status, j.progress, j.err = status, progress, errMsg
	s.mu.Unlock()
}

func (s *service) run(id, in, out string, j *job) {
	s.sem <- struct{}{} // wait for a free conversion slot
	defer func() { <-s.sem }()
	s.set(j, core.PlaybackConverting, 0, "")

	start := time.Now()
	err := s.convert(in, out, func(p int) { s.set(j, core.PlaybackConverting, p, "") })
	if err != nil {
		log.Error().Err(err).Str("recording", id).Msg("playback: conversion failed")
		msg := err.Error()
		if len(msg) > 300 {
			msg = msg[:300]
		}
		s.set(j, core.PlaybackFailed, 0, msg)
		return
	}
	log.Info().Str("recording", id).Dur("took", time.Since(start)).Msg("playback: conversion finished")
	s.mu.Lock()
	delete(s.jobs, id) // the file itself is now the state
	s.mu.Unlock()
}

type probe struct {
	Streams []struct {
		Index       int               `json:"index"`
		CodecType   string            `json:"codec_type"`
		CodecName   string            `json:"codec_name"`
		Height      int               `json:"height"`
		SAR         string            `json:"sample_aspect_ratio"`
		DAR         string            `json:"display_aspect_ratio"`
		Channels    int               `json:"channels"`
		Disposition map[string]int    `json:"disposition"`
		Tags        map[string]string `json:"tags"`
	} `json:"streams"`
	Format struct {
		Duration string `json:"duration"`
	} `json:"format"`
}

func (s *service) probe(ctx context.Context, path string) (*probe, error) {
	out, err := exec.CommandContext(ctx, s.cfg.FFprobe, "-v", "error", "-of", "json",
		"-show_entries", "format=duration:stream=index,codec_type,codec_name,height,sample_aspect_ratio,display_aspect_ratio,channels:stream_disposition=visual_impaired",
		"file:"+path).Output()
	if err != nil {
		return nil, fmt.Errorf("ffprobe: %w", err)
	}
	var p probe
	if err := json.Unmarshal(out, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func parseRatio(s string) float64 {
	a, b, ok := strings.Cut(s, ":")
	if !ok {
		return 0
	}
	x, err1 := strconv.ParseFloat(a, 64)
	y, err2 := strconv.ParseFloat(b, 64)
	if err1 != nil || err2 != nil || y == 0 {
		return 0
	}
	return x / y
}

// buildArgs builds the ffmpeg arguments for a probed input. Exposed for tests.
func (s *service) buildArgs(in, out string, p *probe) ([]string, error) {
	vIdx, aIdx := -1, -1
	var vCodec, vSAR, vDAR string
	var vHeight int
	for _, st := range p.Streams {
		switch st.CodecType {
		case "video":
			if vIdx < 0 {
				vIdx, vCodec, vSAR, vDAR, vHeight = st.Index, st.CodecName, st.SAR, st.DAR, st.Height
			}
		case "audio":
			// prefer the main track: skip audio-description tracks (flagged) and empty ones
			if aIdx < 0 && st.Disposition["visual_impaired"] == 0 && st.Channels > 0 {
				aIdx = st.Index
			}
		}
	}
	if aIdx < 0 { // fall back to any audio stream
		for _, st := range p.Streams {
			if st.CodecType == "audio" {
				aIdx = st.Index
				break
			}
		}
	}
	if vIdx < 0 {
		if aIdx < 0 {
			return nil, fmt.Errorf("no video or audio stream")
		}
		// radio recording: audio only
		return []string{"-nostdin", "-v", "error", "-y", "-progress", "pipe:1", "-fflags", "+genpts",
			"-i", "file:" + in, "-map", "0:" + strconv.Itoa(aIdx),
			"-vn", "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-sn", "-dn",
			"-movflags", "+faststart", "-f", "mp4", out}, nil
	}

	// deinterlace: always for MPEG-2 SD (broadcast SD is interlaced), only frames flagged interlaced otherwise
	deint := "yadif=0:-1:1"
	if vCodec == "mpeg2video" {
		deint = "yadif=0:-1:0"
	}
	filters := []string{deint}
	// anamorphic video (non-square pixels): scale to square pixels at the display aspect ratio
	if sar := parseRatio(vSAR); sar > 0 && math.Abs(sar-1) > 0.01 && vHeight > 0 {
		if dar := parseRatio(vDAR); dar > 0 {
			w := int(math.Round(float64(vHeight)*dar/2)) * 2
			filters = append(filters, fmt.Sprintf("scale=%d:%d:flags=lanczos", w, vHeight), "setsar=1")
		}
	}

	crf := s.cfg.CRF
	if vHeight > 0 && vHeight <= 576 {
		crf -= 2
	}

	args := []string{"-nostdin", "-v", "error", "-y", "-progress", "pipe:1", "-fflags", "+genpts",
		"-i", "file:" + in, "-map", "0:" + strconv.Itoa(vIdx)}
	if aIdx >= 0 {
		args = append(args, "-map", "0:"+strconv.Itoa(aIdx))
	}
	// A keyframe every ~2s with closed GOPs: broadcast keyframes are often unusable as seek points in browsers.
	args = append(args,
		"-vf", strings.Join(filters, ","),
		"-c:v", "libx264", "-preset", s.cfg.Preset, "-crf", strconv.Itoa(crf),
		"-g", "50", "-keyint_min", "50", "-sc_threshold", "0", "-x264-params", "open-gop=0", "-pix_fmt", "yuv420p")
	if aIdx >= 0 {
		args = append(args, "-c:a", "aac", "-b:a", "192k", "-ac", "2")
	}
	args = append(args, "-sn", "-dn", "-movflags", "+faststart", "-f", "mp4", out)
	return args, nil
}

func (s *service) convert(in, out string, progress func(int)) error {
	ctx := context.Background()
	p, err := s.probe(ctx, in)
	if err != nil {
		return err
	}
	dur, _ := strconv.ParseFloat(p.Format.Duration, 64)
	part := out + ".part"
	args, err := s.buildArgs(in, part, p)
	if err != nil {
		return err
	}

	bin, pre := s.cfg.FFmpeg, []string{}
	if nice, err := exec.LookPath("nice"); err == nil { // keep conversions from starving everything else
		pre = []string{"-n", "10", bin}
		bin = nice
	}
	cmd := exec.CommandContext(ctx, bin, append(pre, args...)...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	sc := bufio.NewScanner(stdout)
	for sc.Scan() {
		line := sc.Text()
		if v, ok := strings.CutPrefix(line, "out_time_us="); ok && dur > 0 {
			if us, err := strconv.ParseFloat(v, 64); err == nil {
				pct := int(us / 1e6 / dur * 100)
				if pct > 99 {
					pct = 99
				}
				if pct >= 0 {
					progress(pct)
				}
			}
		}
	}
	if err := cmd.Wait(); err != nil {
		_ = os.Remove(part)
		return fmt.Errorf("ffmpeg failed: %w: %s", err, tail(stderr.String()))
	}

	// verify the result before it becomes playable
	q, err := s.probe(ctx, part)
	if err != nil {
		_ = os.Remove(part)
		return fmt.Errorf("converted file unreadable: %w", err)
	}
	d2, _ := strconv.ParseFloat(q.Format.Duration, 64)
	if dur > 0 && math.Abs(dur-d2)/dur > 0.05 {
		_ = os.Remove(part)
		return fmt.Errorf("converted duration %.0fs does not match source %.0fs", d2, dur)
	}
	return os.Rename(part, out)
}

func tail(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.LastIndex(s, "\n"); i >= 0 {
		s = s[i+1:]
	}
	return s
}

func (s *service) removePartials() {
	parts, _ := filepath.Glob(filepath.Join(s.cfg.CacheDir, "*.part"))
	for _, p := range parts {
		_ = os.Remove(p)
	}
}

// cleanup removes cached files older than the max age, then the least recently played until under the size limit.
func (s *service) cleanup() {
	files, _ := filepath.Glob(filepath.Join(s.cfg.CacheDir, "*.mp4"))
	type f struct {
		p    string
		size int64
		mt   time.Time
	}
	var all []f
	var total int64
	cutoff := time.Now().Add(-time.Duration(s.cfg.CacheMaxAgeDays) * 24 * time.Hour)
	for _, p := range files {
		fi, err := os.Stat(p)
		if err != nil {
			continue
		}
		if fi.ModTime().Before(cutoff) {
			if os.Remove(p) == nil {
				log.Info().Str("file", filepath.Base(p)).Msg("playback: removed old cache file")
			}
			continue
		}
		all = append(all, f{p, fi.Size(), fi.ModTime()})
		total += fi.Size()
	}
	limit := int64(s.cfg.CacheMaxGB) << 30
	sort.Slice(all, func(i, j int) bool { return all[i].mt.Before(all[j].mt) })
	for _, x := range all {
		if total <= limit {
			break
		}
		if os.Remove(x.p) == nil {
			total -= x.size
			log.Info().Str("file", filepath.Base(x.p)).Msg("playback: removed cache file (size limit)")
		}
	}
}
