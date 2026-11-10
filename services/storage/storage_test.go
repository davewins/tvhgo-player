package storage

import (
	"testing"

	"github.com/davidborzek/tvhgo/core"
	"github.com/stretchr/testify/assert"
)

const gb = int64(1000 * 1000 * 1000)

func TestFreeSpaceLimit(t *testing.T) {
	d := core.DiskUsage{TotalBytes: 8000 * gb, UsedBytes: 4400 * gb, FreeBytes: 2600 * gb}
	rec := core.RecordingsUsage{Count: 9, MasterBytes: 12 * gb, PlayableBytes: 11 * gb, Hours: 6}
	allowance, hours := compute(d, rec, core.StorageLimits{MinFreeBytes: 1000 * gb})

	// 23 GB used plus 1600 GB before free space falls to 1000 GB
	assert.Equal(t, 1623*gb, allowance)
	// 23 GB per 6 hours = 3.83 GB/h, 1600 GB of room = about 417 hours
	assert.InDelta(t, 417.4, hours, 0.5)
}

func TestUsedSpaceLimitWinsWhenTighter(t *testing.T) {
	d := core.DiskUsage{TotalBytes: 8000 * gb, FreeBytes: 6000 * gb}
	rec := core.RecordingsUsage{MasterBytes: 100 * gb, PlayableBytes: 50 * gb, Hours: 30}
	allowance, hours := compute(d, rec, core.StorageLimits{MinFreeBytes: 100 * gb, MaxUsedBytes: 500 * gb})
	assert.Equal(t, 500*gb, allowance)
	// 400 GB of room under the used-space limit at 5 GB/h = 80 hours
	assert.InDelta(t, 80, hours, 0.5)
}

func TestAlreadyBelowTheFreeSpaceLimit(t *testing.T) {
	d := core.DiskUsage{TotalBytes: 1000 * gb, FreeBytes: 50 * gb}
	rec := core.RecordingsUsage{MasterBytes: 100 * gb, Hours: 10}
	allowance, hours := compute(d, rec, core.StorageLimits{MinFreeBytes: 100 * gb})
	assert.Equal(t, 100*gb, allowance) // no room left
	assert.Equal(t, 0.0, hours)
}

func TestNoRecordingsYet(t *testing.T) {
	d := core.DiskUsage{TotalBytes: 1000 * gb, FreeBytes: 900 * gb}
	allowance, hours := compute(d, core.RecordingsUsage{}, core.StorageLimits{})
	assert.Equal(t, 900*gb, allowance)
	assert.Equal(t, 0.0, hours) // no average to estimate from
}
