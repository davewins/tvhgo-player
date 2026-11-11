package kept

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/davidborzek/tvhgo/core"
)

// fake is a Tvheadend with a few finished recordings; it remembers what was removed.
type fake struct {
	core.RecordingService
	recs    []*core.Recording
	removed []string
}

func (f *fake) GetAll(_ context.Context, p core.GetRecordingsParams) (*core.RecordingListResult, error) {
	out := f.recs
	if p.Limit > 0 && int(p.Limit) < len(out) {
		out = out[:p.Limit]
	}
	return &core.RecordingListResult{Entries: out, Total: int64(len(f.recs))}, nil
}

func (f *fake) Get(_ context.Context, id string) (*core.Recording, error) {
	for _, r := range f.recs {
		if r.ID == id {
			return r, nil
		}
	}
	return nil, core.ErrRecordingNotFound
}

func (f *fake) BatchRemove(_ context.Context, ids []string) error {
	f.removed = append(f.removed, ids...)
	var left []*core.Recording
	for _, r := range f.recs {
		gone := false
		for _, id := range ids {
			gone = gone || id == r.ID
		}
		if !gone {
			left = append(left, r)
		}
	}
	f.recs = left
	return nil
}

func write(t *testing.T, p string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func setup(t *testing.T) (*Service, *fake, string) {
	dir := t.TempDir()
	f := &fake{recs: []*core.Recording{
		{ID: "a", Title: "Show", Filename: "/recordings/Show/Show - 1.ts", StartsAt: 100, Status: "completed", Size: 50},
		{ID: "b", Title: "Show", Filename: "/recordings/Show/Show - 2.ts", StartsAt: 300, Status: "completed", Size: 50},
	}}
	return New(f, dir, "/recordings"), f, dir
}

func TestKeepAndRemoveThenListAndDeleteForGood(t *testing.T) {
	s, f, dir := setup(t)
	ctx := context.Background()
	write(t, filepath.Join(dir, "Show", "Show - 1.mp4"))
	write(t, filepath.Join(dir, "Show", "Show - 1-thumb.jpg"))
	write(t, filepath.Join(dir, "Show", "Show - 1.nfo"))
	write(t, filepath.Join(dir, "Show", "folder.jpg"))

	if err := s.KeepAndRemove(ctx, []string{"a"}); err != nil {
		t.Fatal(err)
	}
	if len(f.removed) != 1 || f.removed[0] != "a" {
		t.Fatalf("original not removed: %v", f.removed)
	}

	// the kept recording is listed alongside the remaining one, sorted, with its details and flagged
	res, err := s.GetAll(ctx, core.GetRecordingsParams{Status: "finished", PaginationSortQueryParams: core.PaginationSortQueryParams{SortQueryParams: core.SortQueryParams{SortKey: "startsAt", SortDirection: "desc"}}})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 2 || len(res.Entries) != 2 || res.Entries[0].ID != "b" || res.Entries[1].ID != "a" {
		t.Fatalf("unexpected list: total=%d %+v", res.Total, res.Entries)
	}
	k := res.Entries[1]
	if !k.Kept || k.Status != "completed" || k.Title != "Show" || k.Size != 0 {
		t.Fatalf("kept entry wrong: %+v", k)
	}
	if got, err := s.Get(ctx, "a"); err != nil || !got.Kept {
		t.Fatalf("get kept: %v %+v", err, got)
	}
	if !s.IsKept(ctx, "a") || s.IsKept(ctx, "b") {
		t.Fatal("IsKept wrong")
	}

	// paging covers both sources
	page, _ := s.GetAll(ctx, core.GetRecordingsParams{Status: "finished", PaginationSortQueryParams: core.PaginationSortQueryParams{PaginationQueryParams: core.PaginationQueryParams{Limit: 1, Offset: 1}, SortQueryParams: core.SortQueryParams{SortKey: "startsAt", SortDirection: "desc"}}})
	if len(page.Entries) != 1 || page.Entries[0].ID != "a" || page.Total != 2 {
		t.Fatalf("page: %+v", page)
	}

	// deleting it for good removes the MP4, its extras and the (now empty of MP4s) show folder content
	f.removed = nil
	if err := s.Remove(ctx, "a"); err != nil {
		t.Fatal(err)
	}
	if len(f.removed) != 0 {
		t.Fatalf("Tvheadend must not be asked: %v", f.removed)
	}
	if _, err := os.Stat(filepath.Join(dir, "Show")); !os.IsNotExist(err) {
		t.Fatalf("show folder should be gone: %v", err)
	}
	if _, err := s.Get(ctx, "a"); err != core.ErrRecordingNotFound {
		t.Fatalf("still found: %v", err)
	}
}

func TestKeepNeedsAnMP4AndLeavesNothingBehind(t *testing.T) {
	s, f, dir := setup(t)
	write(t, filepath.Join(dir, "Show", "Show - 1.mp4")) // a has a copy, b does not
	err := s.KeepAndRemove(context.Background(), []string{"a", "b"})
	if err == nil || !errorsIs(err, core.ErrNoLibraryCopy) {
		t.Fatalf("expected ErrNoLibraryCopy, got %v", err)
	}
	if len(f.removed) != 0 {
		t.Fatalf("nothing may be removed: %v", f.removed)
	}
	if _, err := os.Stat(filepath.Join(dir, "Show", "Show - 1.keep")); !os.IsNotExist(err) {
		t.Fatalf("marker must be rolled back: %v", err)
	}
}

func TestEmptyMarkerStillListsTheMP4(t *testing.T) {
	s, _, dir := setup(t)
	write(t, filepath.Join(dir, "Old", "Old - 5.mp4"))
	if err := os.WriteFile(filepath.Join(dir, "Old", "Old - 5.keep"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	res, _ := s.GetAll(context.Background(), core.GetRecordingsParams{Status: "finished"})
	found := false
	for _, r := range res.Entries {
		if r.Kept && r.Title == "Old" && r.Subtitle == "Old - 5" && r.ID != "" {
			found = true
		}
	}
	if !found {
		t.Fatalf("not listed: %+v", res.Entries)
	}
}

func errorsIs(err, target error) bool {
	for err != nil {
		if err == target {
			return true
		}
		u, ok := err.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}
