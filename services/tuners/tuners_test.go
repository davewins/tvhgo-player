package tuners

import (
	"testing"

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
