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

	// TunerService reports tuner usage.
	TunerService interface {
		Status(ctx context.Context) (*TunerStatus, error)
	}
)
