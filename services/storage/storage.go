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
func compute(d core.DiskUsage, rec core.RecordingsUsage, lim core.StorageLimits) (allowance int64, hoursLeft float64) {
	used := rec.MasterBytes + rec.PlayableBytes
	// headroom before the free-space limit bites
	room := d.FreeBytes - lim.MinFreeBytes
	if room < 0 {
		room = 0
	}
	allowance = used + room
	if lim.MaxUsedBytes > 0 {
		// the "used space" limit counts the recordings themselves
		maxRoom := lim.MaxUsedBytes - rec.MasterBytes
		if maxRoom < 0 {
			maxRoom = 0
		}
		if lim.MaxUsedBytes < allowance {
			allowance = lim.MaxUsedBytes
		}
		if maxRoom < room {
			room = maxRoom
		}
	}
	if rec.Hours > 0 && used > 0 {
		perHour := float64(used) / rec.Hours
		hoursLeft = float64(room) / perHour
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
		st.Recordings.Hours += float64(r.Duration) / 3600
		if s.sizer != nil {
			st.Recordings.PlayableBytes += s.sizer.PlayableSize(r)
		}
	}
	st.AllowanceBytes, st.HoursLeft = compute(st.Disk, st.Recordings, st.Limits)

	s.cached, s.at = st, time.Now()
	return st, nil
}
