// Package kept lets a recording live on as just its converted MP4 after the original is deleted.
//
// "Delete, keep the MP4 copy" writes a marker "<name>.keep" next to the MP4 in the library; the marker holds the
// recording's details (JSON), because Tvheadend forgets them once the original is gone. The pipeline's cleanup leaves
// MP4s with a marker alone. This package wraps the recording service so those kept recordings show up in the lists
// like any other recording (flagged Kept) and can be deleted for good.
package kept

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/davidborzek/tvhgo/core"
)

const (
	Suffix   = ".keep"
	cacheTTL = 5 * time.Second
	// how many finished recordings are looked at to tell kept-only from still-in-Tvheadend
	finishedLimit = 5000
)

type Service struct {
	core.RecordingService
	dir  string // the library (e.g. /recordings/_jellyfin)
	root string // where Tvheadend says its recordings are (e.g. /recordings)

	mu      sync.Mutex
	cached  []*core.Recording
	cacheAt time.Time
}

// New wraps inner. dir is the pipeline's library folder; root is the recordings path as Tvheadend names it.
func New(inner core.RecordingService, dir, root string) *Service {
	return &Service{RecordingService: inner, dir: dir, root: root}
}

var _ core.KeepService = (*Service)(nil)

func (s *Service) rel(filename string) (string, bool) {
	rel := filepath.Clean("/" + strings.TrimPrefix(filename, s.root))
	rel = strings.TrimPrefix(rel, "/")
	if rel == "" || rel == "." {
		return "", false
	}
	return strings.TrimSuffix(rel, filepath.Ext(rel)), true
}

func (s *Service) mp4(rel string) (string, bool) {
	p := filepath.Join(s.dir, rel+".mp4")
	return p, strings.HasPrefix(p, filepath.Clean(s.dir)+string(os.PathSeparator))
}

func exists(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && fi.Mode().IsRegular() && fi.Size() > 0
}

// --- marking

// Keep writes the marker for a recording's MP4 copy.
func (s *Service) Keep(rec *core.Recording) error {
	rel, ok := s.rel(rec.Filename)
	if !ok {
		return core.ErrNoLibraryCopy
	}
	mp4, ok := s.mp4(rel)
	if !ok || !exists(mp4) {
		return core.ErrNoLibraryCopy
	}
	k := *rec
	k.Status = "completed"
	k.Size = 0
	k.PlayableSize = 0
	k.Kept = false
	data, err := json.Marshal(&k)
	if err != nil {
		return err
	}
	s.invalidate()
	return os.WriteFile(strings.TrimSuffix(mp4, ".mp4")+Suffix, data, 0o644)
}

// Unkeep removes the marker again (used when the original could not be deleted after all).
func (s *Service) Unkeep(rec *core.Recording) {
	if rel, ok := s.rel(rec.Filename); ok {
		if mp4, ok := s.mp4(rel); ok {
			_ = os.Remove(strings.TrimSuffix(mp4, ".mp4") + Suffix)
		}
	}
	s.invalidate()
}

func (s *Service) KeepAndRemove(ctx context.Context, ids []string) error {
	recs := make([]*core.Recording, 0, len(ids))
	for _, id := range ids {
		rec, err := s.RecordingService.Get(ctx, id)
		if err != nil {
			return err
		}
		recs = append(recs, rec)
	}
	var marked []*core.Recording
	rollback := func() {
		for _, r := range marked {
			s.Unkeep(r)
		}
	}
	for _, rec := range recs {
		if err := s.Keep(rec); err != nil {
			rollback()
			return fmt.Errorf("%s: %w", rec.Title, err)
		}
		marked = append(marked, rec)
	}
	if err := s.RecordingService.BatchRemove(ctx, ids); err != nil {
		rollback()
		return err
	}
	return nil
}

func (s *Service) invalidate() {
	s.mu.Lock()
	s.cacheAt = time.Time{}
	s.mu.Unlock()
}

// --- reading

func (s *Service) fromMarker(markerPath string) *core.Recording {
	mp4 := strings.TrimSuffix(markerPath, Suffix) + ".mp4"
	if !exists(mp4) {
		return nil
	}
	relDir, err := filepath.Rel(s.dir, markerPath)
	if err != nil {
		return nil
	}
	rel := strings.TrimSuffix(relDir, Suffix)
	rec := &core.Recording{}
	if data, err := os.ReadFile(markerPath); err == nil && len(data) > 0 {
		if json.Unmarshal(data, rec) != nil {
			rec = &core.Recording{}
		}
	}
	if rec.ID == "" { // an empty or unreadable marker: describe it from its file name
		sum := sha1.Sum([]byte("kept:" + rel))
		rec.ID = hex.EncodeToString(sum[:16])
		rec.Title = filepath.Base(filepath.Dir(rel))
		rec.Subtitle = filepath.Base(rel)
		if fi, err := os.Stat(mp4); err == nil {
			rec.StartsAt, rec.EndsAt = fi.ModTime().Unix(), fi.ModTime().Unix()
			rec.OriginalStartsAt, rec.OriginalEndsAt = rec.StartsAt, rec.EndsAt
		}
	}
	rec.Filename = filepath.Join(s.root, rel+".ts") // so the playback code finds the MP4 like for any recording
	rec.Status = "completed"
	rec.Size = 0
	rec.Kept = true
	return rec
}

func (s *Service) all() []*core.Recording {
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Since(s.cacheAt) < cacheTTL {
		return s.cached
	}
	list := []*core.Recording{}
	_ = filepath.WalkDir(s.dir, func(p string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.HasSuffix(p, Suffix) {
			if rec := s.fromMarker(p); rec != nil {
				list = append(list, rec)
			}
		}
		return nil
	})
	s.cached, s.cacheAt = list, time.Now()
	return list
}

// keptOnly returns the kept recordings that are not (any longer) in Tvheadend.
func (s *Service) keptOnly(ctx context.Context) []*core.Recording {
	all := s.all()
	if len(all) == 0 {
		return nil
	}
	res, err := s.RecordingService.GetAll(ctx, core.GetRecordingsParams{
		Status:                    "finished",
		PaginationSortQueryParams: core.PaginationSortQueryParams{PaginationQueryParams: core.PaginationQueryParams{Limit: finishedLimit}},
	})
	live := map[string]bool{}
	if err == nil {
		for _, r := range res.Entries {
			live[r.ID] = true
		}
	}
	out := make([]*core.Recording, 0, len(all))
	for _, r := range all {
		if !live[r.ID] {
			out = append(out, r)
		}
	}
	return out
}

func (s *Service) IsKept(ctx context.Context, id string) bool {
	for _, r := range s.keptOnly(ctx) {
		if r.ID == id {
			return true
		}
	}
	return false
}

// --- the RecordingService methods that kept recordings take part in

func (s *Service) Get(ctx context.Context, id string) (*core.Recording, error) {
	rec, err := s.RecordingService.Get(ctx, id)
	if errors.Is(err, core.ErrRecordingNotFound) {
		for _, r := range s.keptOnly(ctx) {
			if r.ID == id {
				return r, nil
			}
		}
	}
	return rec, err
}

func less(a, b *core.Recording, key string) int {
	switch key {
	case "title":
		return strings.Compare(strings.ToLower(a.Title), strings.ToLower(b.Title))
	case "channelName":
		return strings.Compare(a.ChannelName, b.ChannelName)
	case "endsAt":
		return cmp64(a.EndsAt, b.EndsAt)
	case "originalStartsAt":
		return cmp64(a.OriginalStartsAt, b.OriginalStartsAt)
	case "originalEndsAt":
		return cmp64(a.OriginalEndsAt, b.OriginalEndsAt)
	case "filename":
		return strings.Compare(a.Filename, b.Filename)
	}
	return cmp64(a.StartsAt, b.StartsAt)
}

func cmp64(a, b int64) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}

func (s *Service) GetAll(ctx context.Context, params core.GetRecordingsParams) (*core.RecordingListResult, error) {
	if params.Status != "" && params.Status != "finished" {
		return s.RecordingService.GetAll(ctx, params)
	}
	extra := s.keptOnly(ctx)
	if len(extra) == 0 {
		return s.RecordingService.GetAll(ctx, params)
	}
	// merge: take enough from Tvheadend to cover the requested page, add the kept ones, sort, cut the page
	inner := params
	inner.Offset = 0
	if params.Limit > 0 {
		inner.Limit = params.Offset + params.Limit
	}
	res, err := s.RecordingService.GetAll(ctx, inner)
	if err != nil {
		return nil, err
	}
	entries := append(append([]*core.Recording{}, res.Entries...), extra...)
	if params.SortKey != "" {
		desc := params.SortDirection == "desc"
		sort.SliceStable(entries, func(i, j int) bool {
			c := less(entries[i], entries[j], params.SortKey)
			if desc {
				return c > 0
			}
			return c < 0
		})
	}
	total := res.Total + int64(len(extra))
	from := params.Offset
	if from > int64(len(entries)) {
		from = int64(len(entries))
	}
	entries = entries[from:]
	if params.Limit > 0 && int64(len(entries)) > params.Limit {
		entries = entries[:params.Limit]
	}
	return &core.RecordingListResult{Entries: entries, Total: total, Offset: params.Offset}, nil
}

// --- removing

func (s *Service) Remove(ctx context.Context, id string) error {
	return s.BatchRemove(ctx, []string{id})
}

func (s *Service) BatchRemove(ctx context.Context, ids []string) error {
	kept := map[string]*core.Recording{}
	for _, r := range s.keptOnly(ctx) {
		kept[r.ID] = r
	}
	var normal []string
	for _, id := range ids {
		if r, ok := kept[id]; ok {
			if err := s.deleteFiles(r); err != nil {
				return err
			}
		} else {
			normal = append(normal, id)
		}
	}
	if len(normal) > 0 {
		if err := s.RecordingService.BatchRemove(ctx, normal); err != nil {
			return err
		}
		// a leftover marker from an earlier keep that did not complete must not keep an MP4 nobody wanted kept
		for _, r := range s.all() {
			for _, id := range normal {
				if r.ID == id {
					s.Unkeep(r)
				}
			}
		}
	}
	s.invalidate()
	return nil
}

// deleteFiles removes a kept recording for good: its MP4, thumbnail, NFO and marker, and the show's folder.jpg /
// tvshow.nfo and the folder itself if nothing else is left there.
func (s *Service) deleteFiles(r *core.Recording) error {
	rel, ok := s.rel(r.Filename)
	if !ok {
		return core.ErrRecordingNotFound
	}
	mp4, ok := s.mp4(rel)
	if !ok {
		return core.ErrRecordingNotFound
	}
	base := strings.TrimSuffix(mp4, ".mp4")
	for _, p := range []string{mp4, base + "-thumb.jpg", base + ".nfo", base + Suffix} {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	dir := filepath.Dir(mp4)
	if dir != filepath.Clean(s.dir) {
		if entries, err := os.ReadDir(dir); err == nil {
			hasMP4 := false
			for _, e := range entries {
				if strings.HasSuffix(e.Name(), ".mp4") {
					hasMP4 = true
				}
			}
			if !hasMP4 {
				_ = os.Remove(filepath.Join(dir, "folder.jpg"))
				_ = os.Remove(filepath.Join(dir, "tvshow.nfo"))
				_ = os.Remove(dir) // only succeeds if empty
			}
		}
	}
	s.invalidate()
	return nil
}
