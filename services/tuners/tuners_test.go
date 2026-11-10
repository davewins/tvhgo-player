package tuners

import (
	"testing"

	"github.com/davidborzek/tvhgo/core"
	"github.com/stretchr/testify/assert"
)

var (
	svcs = []mpegtsService{
		{Enabled: true, Network: "Freeview", Multiplex: "482MHz", Channel: []string{"itv1hd", "bbc1hd"}},
		{Enabled: true, Network: "Freeview", Multiplex: "538MHz", Channel: []string{"itv1"}},
		{Enabled: true, Network: "Freeview", Multiplex: "506MHz", Channel: []string{"itv1", "dave"}},
		{Enabled: true, Network: "Freeview", Multiplex: "498MHz", Channel: []string{"film4"}},
		{Enabled: false, Network: "Freeview", Multiplex: "490MHz", Channel: []string{"off"}},
	}
	dvr = subscription{Title: "DVR: EastEnders", Channel: "BBC ONE HD", Service: "tuner #1/Freeview/482MHz/BBC ONE HD"}
)

func TestOneFreeTunerBlocksNothing(t *testing.T) {
	st := compute([]input{
		{Input: "tuner #1", Stream: "482MHz in Freeview", Subs: 1},
		{Input: "tuner #0", Subs: 0},
	}, []subscription{dvr}, svcs)

	assert.True(t, st.Available)
	assert.Equal(t, 2, st.Total)
	assert.Equal(t, 1, st.Busy)
	assert.Empty(t, st.Blocked)
	assert.Equal(t, "EastEnders", st.Tuners[1].Users[0].Title)
	assert.Equal(t, "recording", st.Tuners[1].Users[0].Kind)
}

func TestBothBusyBlocksOtherMultiplexes(t *testing.T) {
	st := compute([]input{
		{Input: "tuner #1", Stream: "482MHz in Freeview", Subs: 2},
		{Input: "tuner #0", Stream: "498MHz in Freeview", Subs: 1},
	}, []subscription{
		dvr,
		{Title: "", Channel: "ITV1 HD", Service: "tuner #1/Freeview/482MHz/ITV1 HD"},
		{Title: "DVR: Film", Channel: "Film4", Service: "tuner #0/Freeview/498MHz/Film4"},
	}, svcs)

	assert.Equal(t, 2, st.Busy)
	// channels on the two held multiplexes stay watchable; ITV1 (538/506) and Dave (506) do not
	assert.Equal(t, []string{"dave", "itv1"}, st.Blocked)
	assert.Equal(t, "live", st.Tuners[1].Users[1].Kind)
}

func TestChannelWithAnotherReachableServiceIsNotBlocked(t *testing.T) {
	st := compute([]input{
		{Input: "a", Stream: "538MHz in Freeview", Subs: 1},
		{Input: "b", Stream: "482MHz in Freeview", Subs: 1},
	}, nil, svcs)
	// itv1 has a service on 538MHz, which is held
	assert.NotContains(t, st.Blocked, "itv1")
	assert.Contains(t, st.Blocked, "dave")
	assert.NotContains(t, st.Blocked, "off") // disabled services are ignored
}

func TestNoTunersOrIdle(t *testing.T) {
	assert.Empty(t, compute(nil, nil, svcs).Blocked)
	assert.Equal(t, 0, compute([]input{{Input: "a"}, {Input: "b"}}, nil, svcs).Busy)
}

func need1(id string, start, end int64, opts ...string) need {
	return need{entry: core.ClashEntry{ID: id, Start: start, End: end}, options: opts}
}

func TestClashes(t *testing.T) {
	a, b, c := "482 in F", "498 in F", "506 in F"

	// two on the same multiplex plus one on another: fits in two tuners
	assert.Empty(t, findClashes([]need{need1("1", 0, 100, a), need1("2", 0, 100, a), need1("3", 0, 100, b)}, 2))

	// three different multiplexes at once: clash for the shared period only
	got := findClashes([]need{need1("1", 0, 100, a), need1("2", 50, 150, b), need1("3", 80, 120, c)}, 2)
	assert.Len(t, got, 1)
	assert.Equal(t, int64(80), got[0].Start)
	assert.Equal(t, int64(100), got[0].End)
	assert.Len(t, got[0].Entries, 3)

	// back to back on different multiplexes never overlap
	assert.Empty(t, findClashes([]need{need1("1", 0, 100, a), need1("2", 100, 200, b), need1("3", 100, 200, c)}, 2))

	// a channel with two possible multiplexes can use one that is already needed
	assert.Empty(t, findClashes([]need{need1("1", 0, 100, a), need1("2", 0, 100, b), need1("3", 0, 100, c, a)}, 2))

	// no tuners known: nothing to say
	assert.Empty(t, findClashes([]need{need1("1", 0, 10, a)}, 0))
}
