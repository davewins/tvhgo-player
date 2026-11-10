// Package tuners works out which tuners are busy, what they are tuned to, and which channels cannot be watched
// or recorded right now because every tuner is on some other multiplex.
package tuners

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/davidborzek/tvhgo/core"
	"github.com/davidborzek/tvhgo/tvheadend"
)

var ErrRequestFailed = errors.New("tuner request failed")

const cacheFor = 3 * time.Second

type (
	input struct {
		UUID   string `json:"uuid"`
		Input  string `json:"input"`
		Stream string `json:"stream"`
		Subs   int    `json:"subs"`
	}
	subscription struct {
		Title   string `json:"title"`
		Channel string `json:"channel"`
		Service string `json:"service"`
		State   string `json:"state"`
	}
	mpegtsService struct {
		Enabled   bool     `json:"enabled"`
		Network   string   `json:"network"`
		Multiplex string   `json:"multiplex"`
		Channel   []string `json:"channel"`
	}

	service struct {
		tvh tvheadend.Client
		off bool

		mu     sync.Mutex
		at     time.Time
		cached *core.TunerStatus
	}
)

// New returns a service that reads tuner state with the given (admin) client. With a nil client the
// service reports itself unavailable.
func New(tvh tvheadend.Client) core.TunerService {
	return &service{tvh: tvh, off: tvh == nil}
}

func muxKey(multiplex, network string) string {
	return multiplex + " in " + network
}

// compute is the pure part: it combines the raw tvheadend lists into a status.
func compute(
	inputs []input,
	subs []subscription,
	services []mpegtsService,
) *core.TunerStatus {
	st := &core.TunerStatus{Available: true, Tuners: []core.Tuner{}, Blocked: []string{}}

	busyMux := map[string]bool{}
	for _, in := range inputs {
		t := core.Tuner{Name: in.Input, Mux: in.Stream, Busy: in.Subs > 0, Users: []core.TunerUser{}}
		for _, s := range subs {
			// service looks like "adapter/network/multiplex/service name"
			parts := strings.SplitN(s.Service, "/", 4)
			if len(parts) < 3 || parts[0] != in.Input {
				continue
			}
			kind := "live"
			title := s.Channel
			if strings.HasPrefix(s.Title, "DVR:") {
				kind = "recording"
				title = strings.TrimSpace(strings.TrimPrefix(s.Title, "DVR:"))
			}
			t.Users = append(t.Users, core.TunerUser{Title: title, Channel: s.Channel, Kind: kind})
		}
		if t.Busy {
			st.Busy++
			if in.Stream != "" {
				busyMux[in.Stream] = true
			}
		}
		st.Tuners = append(st.Tuners, t)
	}
	st.Total = len(inputs)
	sort.SliceStable(st.Tuners, func(i, j int) bool { return st.Tuners[i].Name < st.Tuners[j].Name })

	// with a tuner free, everything can be tuned
	if st.Total == 0 || st.Busy < st.Total {
		return st
	}

	reachable := map[string]bool{}
	known := map[string]bool{}
	for _, s := range services {
		if !s.Enabled {
			continue
		}
		on := busyMux[muxKey(s.Multiplex, s.Network)]
		for _, ch := range s.Channel {
			known[ch] = true
			if on {
				reachable[ch] = true
			}
		}
	}
	for ch := range known {
		if !reachable[ch] {
			st.Blocked = append(st.Blocked, ch)
		}
	}
	sort.Strings(st.Blocked)
	return st
}

func (s *service) Status(ctx context.Context) (*core.TunerStatus, error) {
	if s.off {
		return &core.TunerStatus{Tuners: []core.Tuner{}, Blocked: []string{}}, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cached != nil && time.Since(s.at) < cacheFor {
		return s.cached, nil
	}

	var inputs tvheadend.ListResponse[input]
	if err := s.get(ctx, "/api/status/inputs", &inputs); err != nil {
		return nil, err
	}
	var subs tvheadend.ListResponse[subscription]
	if err := s.get(ctx, "/api/status/subscriptions", &subs); err != nil {
		return nil, err
	}
	st := compute(inputs.Entries, subs.Entries, nil)
	if st.Total > 0 && st.Busy == st.Total {
		// only needed (and only fetched) when every tuner is busy
		var svcs tvheadend.GridResponse[mpegtsService]
		q := tvheadend.NewQuery()
		q.Limit(5000)
		if err := s.get(ctx, "/api/mpegts/service/grid", &svcs, q); err != nil {
			return nil, err
		}
		st = compute(inputs.Entries, subs.Entries, svcs.Entries)
	}

	s.cached, s.at = st, time.Now()
	return st, nil
}

func (s *service) get(ctx context.Context, path string, dst interface{}, q ...tvheadend.Query) error {
	res, err := s.tvh.Exec(ctx, path, dst, q...)
	if err != nil {
		return err
	}
	if res.StatusCode >= 400 {
		return ErrRequestFailed
	}
	return nil
}
