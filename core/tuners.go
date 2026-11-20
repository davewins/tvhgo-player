package core

import "context"

type (
	// TunerUser is something holding a tuner: a recording or someone watching.
	TunerUser struct {
		Title   string `json:"title"`
		Channel string `json:"channel"`
		// Kind is "recording" or "live".
		Kind string `json:"kind"`
		// Client is what Tvheadend knows of who is watching: for a stream started from tvhgo the viewer's browser
		// ("tvhgo: <browser user agent>"), for other programs their own name (e.g. "Lavf/62" for Jellyfin).
		Client string `json:"client,omitempty"`
		// Username is the Tvheadend account the stream uses and Host the address it came from.
		Username string `json:"username,omitempty"`
		Host     string `json:"host,omitempty"`
	}

	// Tuner is one tuner (input) of the tvheadend server.
	Tuner struct {
		Name string `json:"name"`
		// Mux is the multiplex it is tuned to ("482MHz in Freeview Malvern"), empty when idle.
		Mux   string      `json:"mux"`
		Busy  bool        `json:"busy"`
		Users []TunerUser `json:"users"`
	}

	// TunerStatus is the current tuner usage.
	TunerStatus struct {
		// Available is false when no status account is configured; the other fields are then empty.
		Available bool    `json:"available"`
		Total     int     `json:"total"`
		Busy      int     `json:"busy"`
		Tuners    []Tuner `json:"tuners"`
		// Blocked lists the channels that cannot be tuned right now: every tuner is busy and none of
		// them is on a multiplex that carries the channel. Empty while a tuner is free.
		Blocked []string `json:"blocked"`
	}

	// ClashEntry is a recording that takes part in a clash.
	ClashEntry struct {
		// ID is the recording's id, or "new" for the programme being checked.
		ID        string `json:"id"`
		Title     string `json:"title"`
		ChannelID string `json:"channelId"`
		Channel   string `json:"channel"`
		Start     int64  `json:"start"`
		End       int64  `json:"end"`
		// Mux is the multiplex the recording needs ("482MHz"); several are listed when the channel has more than one.
		Mux string `json:"mux"`
	}

	// Clash is a period in which the recordings need more multiplexes than there are tuners.
	Clash struct {
		Start   int64        `json:"start"`
		End     int64        `json:"end"`
		Entries []ClashEntry `json:"entries"`
	}

	// ClashProbe is a programme that is not scheduled (yet): "would recording this clash?".
	ClashProbe struct {
		ChannelID string
		Title     string
		Start     int64
		End       int64
	}

	// LiveImpact says whether starting to watch a channel live would harm a recording in progress.
	LiveImpact struct {
		// Warn is true when an HD recording is running and watching the channel would take the second tuner (the
		// channel is on another multiplex). On a Hauppauge dualHD that corrupts the HD recording.
		Warn bool `json:"warn"`
		// Recording lists the HD recordings that would be at risk.
		Recording []string `json:"recording"`
	}

	// TunerService reports tuner usage.
	TunerService interface {
		// LiveImpact checks whether watching the named channel would take the second tuner away from an HD recording.
		LiveImpact(ctx context.Context, channel string) (*LiveImpact, error)
		Status(ctx context.Context) (*TunerStatus, error)
		// Clashes looks through the scheduled recordings of the next two weeks, optionally with one more
		// programme added, for times when there are more multiplexes to record than tuners.
		Clashes(ctx context.Context, probe *ClashProbe) ([]Clash, error)
	}
)
