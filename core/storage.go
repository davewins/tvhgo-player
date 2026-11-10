package core

import "context"

type (
	// StorageStatus is how much disk the recordings use compared with what Tvheadend allows itself.
	StorageStatus struct {
		// Available is false when the recordings folder cannot be read.
		Available bool `json:"available"`
		// Disk is the disk (filesystem) the recordings live on.
		Disk DiskUsage `json:"disk"`
		// Recordings is what the finished recordings take.
		Recordings RecordingsUsage `json:"recordings"`
		// Limits are the storage limits set in Tvheadend's DVR profile (0 = not set).
		Limits StorageLimits `json:"limits"`
		// AllowanceBytes is the space the recordings may use before Tvheadend starts to clean up or refuse new
		// recordings: what they use now plus the headroom the limits leave. 0 if it cannot be worked out.
		AllowanceBytes int64 `json:"allowanceBytes"`
		// HoursLeft estimates how many more hours could be recorded (at the average size so far) before the limit.
		HoursLeft float64 `json:"hoursLeft"`
	}

	DiskUsage struct {
		TotalBytes int64 `json:"totalBytes"`
		UsedBytes  int64 `json:"usedBytes"`
		FreeBytes  int64 `json:"freeBytes"`
	}

	RecordingsUsage struct {
		Count int `json:"count"`
		// MasterBytes is the broadcast recordings (.ts) Tvheadend keeps.
		MasterBytes int64 `json:"masterBytes"`
		// PlayableBytes is the MP4 copies made for playback.
		PlayableBytes int64   `json:"playableBytes"`
		Hours         float64 `json:"hours"`
	}

	StorageLimits struct {
		// MinFreeBytes is "maintain free disk space": Tvheadend removes old recordings to keep at least this free.
		MinFreeBytes int64 `json:"minFreeBytes"`
		// MaxUsedBytes is "maintain used disk space": the most the recordings may take. 0 = no limit.
		MaxUsedBytes int64 `json:"maxUsedBytes"`
	}

	// StorageService reports storage use.
	StorageService interface {
		Status(ctx context.Context) (*StorageStatus, error)
	}
)
