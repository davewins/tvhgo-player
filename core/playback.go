package core

import (
	"context"
	"errors"
	"io"
)

var (
	ErrPlaybackConversionDisabled = errors.New("on-demand conversion is disabled")
	ErrPlaybackNoSource           = errors.New("recording file not available")
	ErrLiveDisabled               = errors.New("live transcoding is disabled")
	ErrLiveBusy                   = errors.New("too many live streams")
	ErrLiveQuality                = errors.New("unsupported quality")
	ErrLiveStart                  = errors.New("the live stream did not start")
)

type (
	// PlaybackStatus is the state of the browser-playable copy of a recording.
	PlaybackStatus string

	// PlaybackInfo describes whether and how a recording can be played in a browser.
	PlaybackInfo struct {
		Status PlaybackStatus `json:"status"`
		// Progress of a running conversion in percent.
		Progress int `json:"progress"`
		// Source of a ready file: "library" (the configured source dir) or "cache" (converted by tvhgo).
		Source string `json:"source,omitempty"`
		// CanConvert is true if tvhgo can create the playable copy itself.
		CanConvert bool   `json:"canConvert"`
		Error      string `json:"error,omitempty"`
	}

	// PlaybackService finds or creates browser-playable copies (MP4) of finished recordings.
	PlaybackService interface {
		// Status returns the playback state of a recording.
		Status(rec *Recording) PlaybackInfo
		// Prepare starts converting a recording if no playable copy exists (idempotent).
		Prepare(rec *Recording) (PlaybackInfo, error)
		// LiveQualities returns the selectable live transcode heights (empty if live transcoding is disabled).
		LiveQualities() []int
		// StreamLive transcodes the raw MPEG-TS stream from src to a fragmented MP4 of the given height on dst
		// until ctx is cancelled or src ends.
		StreamLive(ctx context.Context, src io.Reader, dst io.Writer, height int) error
		// StartHLS starts a live HLS session (for Safari / iOS) at the given height and returns its id once the first
		// segments exist. open supplies the raw MPEG-TS stream; its context ends with the session.
		StartHLS(open func(ctx context.Context) (io.ReadCloser, error), height int) (string, error)
		// HLSFile returns the path of a session's playlist ("index.m3u8") or segment and counts as activity.
		HLSFile(id, name string) (string, bool)
		// StopHLS ends a live HLS session.
		StopHLS(id string)
		// Chapters returns the chapters of the recording's playable MP4, advert breaks flagged.
		Chapters(ctx context.Context, rec *Recording) ([]Chapter, error)
		// Thumb returns the path of a thumbnail image for a recording: a frame from the recording itself if it
		// is finished, otherwise (or if no frame can be made) TMDb artwork for the programme, if configured.
		Thumb(ctx context.Context, rec *Recording) (string, bool)
		// ProgrammeArt returns TMDb artwork for a programme title (e.g. one that has not aired yet), if a key is
		// configured and the title matches.
		ProgrammeArt(ctx context.Context, title string) (string, bool)
		// File returns the path of the ready playable copy, if there is one.
		File(rec *Recording) (string, bool)
	}
)

// Chapter is a named stretch of a recording; Advert is true for an advert break (written by the pipeline's Comskip job).
type Chapter struct {
	Start  float64 `json:"start"`
	End    float64 `json:"end"`
	Title  string  `json:"title"`
	Advert bool    `json:"advert"`
}

const (
	PlaybackNone       PlaybackStatus = "none"
	PlaybackQueued     PlaybackStatus = "queued"
	PlaybackConverting PlaybackStatus = "converting"
	PlaybackReady      PlaybackStatus = "ready"
	PlaybackFailed     PlaybackStatus = "failed"
)
