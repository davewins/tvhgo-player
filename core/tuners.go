package core

import "context"

type (
	// TunerUser is something holding a tuner: a recording or someone watching.
	TunerUser struct {
		Title   string `json:"title"`
		Channel string `json:"channel"`
		// Kind is "recording" or "live".
		Kind string `json:"kind"`
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

	// TunerService reports tuner usage.
	TunerService interface {
		Status(ctx context.Context) (*TunerStatus, error)
		// Clashes looks through the scheduled recordings of the next two weeks, optionally with one more
		// programme added, for times when there are more multiplexes to record than tuners.
		Clashes(ctx context.Context, probe *ClashProbe) ([]Clash, error)
	}
)
