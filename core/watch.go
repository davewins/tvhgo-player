package core

import "context"

type (
	// WatchProgress is how far a user has watched a recording.
	WatchProgress struct {
		RecordingID string `json:"recordingId"`
		// Position is where the user stopped, in seconds.
		Position float64 `json:"position"`
		// Duration is the length of the recording in seconds.
		Duration  float64 `json:"duration"`
		UpdatedAt int64   `json:"updatedAt"`
	}

	WatchProgressRepository interface {
		// List returns the progress of all recordings of a user.
		List(ctx context.Context, userID int64) ([]*WatchProgress, error)
		// Save stores (or replaces) the progress of one recording.
		Save(ctx context.Context, userID int64, p *WatchProgress) error
		// Delete forgets the progress of one recording.
		Delete(ctx context.Context, userID int64, recordingID string) error
	}
)
