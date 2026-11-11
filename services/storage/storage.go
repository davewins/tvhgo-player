// Package storage works out how much disk the recordings use compared with the limits set in Tvheadend.
package storage

import (
	"context"
	"sync"
	"syscall"
	"time"

	"github.com/davidborzek/tvhgo/core"
)

const (
	cacheFor = 30 * time.Second
	mib      = int64(1024 * 1024)
)

type service struct {
	recordings core.RecordingService
	dvr        core.DVRConfigService
	sizer      core.PlayableSizer
	dir        string

	mu     sync.Mutex
	at     time.Time
	cached *core.StorageStatus
}

// New creates the storage service. dir is where tvhgo sees the recordings folder; sizer may be nil.
func New(recordings core.RecordingService, dvr core.DVRConfigService, sizer core.PlayableSizer, dir string) core.StorageService {
	return &service{recordings: recordings, dvr: dvr, sizer: sizer, dir: dir}
}

func disk(dir string) (core.DiskUsage, bool) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(dir, &st); err != nil {
		return core.DiskUsage{}, false
	}
	bs := int64(st.Bsize)
	total := int64(st.Blocks) * bs
	free := int64(st.Bavail) * bs
	return core.DiskUsage{TotalBytes: total, FreeBytes: free, UsedBytes: total - int64(st.Bfree)*bs}, true
}

// compute is the pure part: given what is on disk and the limits, how much room is there for recordings?
//
// Tvheadend's "maintain free space" is about the disk as a whole. Its "maintain used space" counts only the
// recordings it keeps (the originals), not the MP4 copies the pipeline makes next to them, so the total those two
// limits allow is the cap times (1 + the MP4 copies' size relative to the originals).
func compute(d core.DiskUsage, rec core.RecordingsUsage, lim core.StorageLimits) (allowance int64, hoursLeft float64) {
	used := rec.MasterBytes + rec.PlayableBytes
	room := d.FreeBytes - lim.MinFreeBytes
	if room < 0 {
		room = 0
	}
	if lim.MaxUsedBytes > 0 {
		ratio := 1.0 // until there is something to measure, assume an MP4 copy is as big as its original
		if rec.MasterBytes > 0 {
			ratio = float64(rec.PlayableBytes) / float64(rec.MasterBytes)
		}
		maxRoom := int64(float64(lim.MaxUsedBytes-rec.MasterBytes) * (1 + ratio))
		if maxRoom < 0 {
			maxRoom = 0
		}
		if maxRoom < room {
			room = maxRoom
		}
	}
	allowance = used + room
	if rec.Hours > 0 && used > 0 {
		hoursLeft = float64(room) / (float64(used) / rec.Hours)
	}
	return allowance, hoursLeft
}

func (s *service) Status(ctx context.Context) (*core.StorageStatus, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cached != nil && time.Since(s.at) < cacheFor {
		return s.cached, nil
	}

	st := &core.StorageStatus{}
	d, ok := disk(s.dir)
	if !ok {
		s.cached, s.at = st, time.Now()
		return st, nil
	}
	st.Available, st.Disk = true, d

	// the limits come from the DVR profile (the default one is the first)
	if cfgs, err := s.dvr.GetAll(ctx); err == nil && len(cfgs) > 0 {
		st.Limits.MinFreeBytes = int64(cfgs[0].Storage.MaintainFreeSpace) * mib
		st.Limits.MaxUsedBytes = int64(cfgs[0].Storage.MaintainUsedSpace) * mib
	}

	list, err := s.recordings.GetAll(ctx, core.GetRecordingsParams{Status: "finished", PaginationSortQueryParams: core.PaginationSortQueryParams{PaginationQueryParams: core.PaginationQueryParams{Limit: 5000}}})
	if err != nil {
		return nil, err
	}
	for _, r := range list.Entries {
		st.Recordings.Count++
		st.Recordings.MasterBytes += r.Size
		if r.Protected {
			st.Recordings.ProtectedBytes += r.Size
			st.Recordings.ProtectedCount++
		}
		st.Recordings.Hours += float64(r.Duration) / 3600
		if s.sizer != nil {
			st.Recordings.PlayableBytes += s.sizer.PlayableSize(r)
		}
	}
	st.AllowanceBytes, st.HoursLeft = compute(st.Disk, st.Recordings, st.Limits)

	s.cached, s.at = st, time.Now()
	return st, nil
}
