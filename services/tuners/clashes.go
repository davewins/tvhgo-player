package tuners

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/davidborzek/tvhgo/core"
	"github.com/davidborzek/tvhgo/tvheadend"
)

const lookahead = 14 * 24 * time.Hour

type (
	dvrEntry struct {
		UUID        string `json:"uuid"`
		Enabled     bool   `json:"enabled"`
		Channel     string `json:"channel"`
		ChannelName string `json:"channelname"`
		Title       string `json:"disp_title"`
		StartReal   int64  `json:"start_real"`
		StopReal    int64  `json:"stop_real"`
	}
	dvrConfig struct {
		PreExtra  int64 `json:"pre-extra-time"`
		PostExtra int64 `json:"post-extra-time"`
	}
	// need is one recording and the multiplexes it could be recorded from.
	need struct {
		entry   core.ClashEntry
		options []string
	}
)

// minMuxes is the fewest distinct multiplexes that cover every recording, choosing one option per recording.
func minMuxes(needs []need) int {
	best := len(needs) + 1
	var walk func(i int, used map[string]int)
	walk = func(i int, used map[string]int) {
		if len(used) >= best {
			return
		}
		if i == len(needs) {
			best = len(used)
			return
		}
		for _, o := range needs[i].options {
			used[o]++
			walk(i+1, used)
			if used[o]--; used[o] == 0 {
				delete(used, o)
			}
		}
	}
	walk(0, map[string]int{})
	return best
}

// findClashes sweeps over the recordings' start and end times and reports each period in which more multiplexes are
// needed than there are tuners. Recordings without a known multiplex are ignored.
func findClashes(needs []need, tuners int) []core.Clash {
	if tuners <= 0 {
		return nil
	}
	cut := map[int64]bool{}
	for _, n := range needs {
		cut[n.entry.Start], cut[n.entry.End] = true, true
	}
	times := make([]int64, 0, len(cut))
	for t := range cut {
		times = append(times, t)
	}
	sort.Slice(times, func(i, j int) bool { return times[i] < times[j] })

	var out []core.Clash
	for i := 0; i+1 < len(times); i++ {
		a, b := times[i], times[i+1]
		var active []need
		for _, n := range needs {
			if n.entry.Start < b && n.entry.End > a {
				active = append(active, n)
			}
		}
		if len(active) <= tuners || minMuxes(active) <= tuners {
			continue
		}
		ids := make([]string, 0, len(active))
		entries := make([]core.ClashEntry, 0, len(active))
		for _, n := range active {
			ids = append(ids, n.entry.ID)
			entries = append(entries, n.entry)
		}
		key := strings.Join(ids, ",")
		// extend the previous clash when the same recordings are involved
		if last := len(out) - 1; last >= 0 && out[last].End == a && sameIDs(out[last].Entries, key) {
			out[last].End = b
			continue
		}
		out = append(out, core.Clash{Start: a, End: b, Entries: entries})
	}
	return out
}

func sameIDs(entries []core.ClashEntry, key string) bool {
	ids := make([]string, 0, len(entries))
	for _, e := range entries {
		ids = append(ids, e.ID)
	}
	return strings.Join(ids, ",") == key
}

func muxShort(key string) string {
	return strings.SplitN(key, " in ", 2)[0]
}

func (s *service) Clashes(ctx context.Context, probe *core.ClashProbe) ([]core.Clash, error) {
	if s.off {
		return []core.Clash{}, nil
	}

	var inputs tvheadend.ListResponse[input]
	if err := s.get(ctx, "/api/status/inputs", &inputs); err != nil {
		return nil, err
	}
	var svcs tvheadend.GridResponse[mpegtsService]
	q := tvheadend.NewQuery()
	q.Limit(5000)
	if err := s.get(ctx, "/api/mpegts/service/grid", &svcs, q); err != nil {
		return nil, err
	}
	var upcoming tvheadend.GridResponse[dvrEntry]
	q = tvheadend.NewQuery()
	q.Limit(1000)
	if err := s.get(ctx, "/api/dvr/entry/grid_upcoming", &upcoming, q); err != nil {
		return nil, err
	}

	// channel -> the multiplexes its enabled services are on
	muxes := map[string][]string{}
	for _, sv := range svcs.Entries {
		if !sv.Enabled {
			continue
		}
		key := muxKey(sv.Multiplex, sv.Network)
		for _, ch := range sv.Channel {
			if !contains(muxes[ch], key) {
				muxes[ch] = append(muxes[ch], key)
			}
		}
	}

	horizon := time.Now().Add(lookahead).Unix()
	var needs []need
	add := func(e core.ClashEntry) {
		opts := muxes[e.ChannelID]
		if len(opts) == 0 || e.Start > horizon || e.End <= time.Now().Unix() {
			return
		}
		short := make([]string, 0, len(opts))
		for _, o := range opts {
			short = append(short, muxShort(o))
		}
		e.Mux = strings.Join(short, " / ")
		needs = append(needs, need{entry: e, options: opts})
	}
	for _, d := range upcoming.Entries {
		if !d.Enabled {
			continue
		}
		add(core.ClashEntry{ID: d.UUID, Title: d.Title, ChannelID: d.Channel, Channel: d.ChannelName, Start: d.StartReal, End: d.StopReal})
	}

	if probe != nil {
		// the recording would get the default profile's padding
		var cfg tvheadend.GridResponse[dvrConfig]
		pre, post := int64(0), int64(0)
		if err := s.get(ctx, "/api/dvr/config/grid", &cfg); err == nil && len(cfg.Entries) > 0 {
			pre, post = cfg.Entries[0].PreExtra*60, cfg.Entries[0].PostExtra*60
		}
		add(core.ClashEntry{ID: "new", Title: probe.Title, ChannelID: probe.ChannelID, Start: probe.Start - pre, End: probe.End + post})
	}

	clashes := findClashes(needs, len(inputs.Entries))
	if clashes == nil {
		clashes = []core.Clash{}
	}
	return clashes, nil
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
