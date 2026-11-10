package recording_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/davidborzek/tvhgo/core"
	mock_tvheadend "github.com/davidborzek/tvhgo/mock/tvheadend"
	"github.com/davidborzek/tvhgo/services/recording"
	"github.com/davidborzek/tvhgo/tvheadend"
	"github.com/stretchr/testify/assert"
	"go.uber.org/mock/gomock"
)

// respond decodes body into dst like the real client does and reports status 200.
func respond(body string) func(context.Context, string, interface{}, ...tvheadend.Query) (*tvheadend.Response, error) {
	return func(_ context.Context, _ string, dst interface{}, _ ...tvheadend.Query) (*tvheadend.Response, error) {
		if dst != nil {
			if err := json.Unmarshal([]byte(body), dst); err != nil {
				return nil, err
			}
		}
		return &tvheadend.Response{Response: &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(""))}}, nil
	}
}

const (
	channelsJSON = `{"entries":[{"uuid":"chITV1","name":"ITV1 HD"},{"uuid":"chBBC","name":"BBC One HD"}]}`
	eventJSON    = `{"entries":[{"eventId":42,"title":"Emmerdale","channelUuid":"chITV1","channelName":"ITV1 HD"}]}`
)

func newMock(t *testing.T) (*mock_tvheadend.MockClient, core.RecordingService) {
	ctrl := gomock.NewController(t)
	t.Cleanup(ctrl.Finish)
	m := mock_tvheadend.NewMockClient(ctrl)
	return m, recording.New(m)
}

func TestGetAutorecs(t *testing.T) {
	m, svc := newMock(t)
	m.EXPECT().Exec(gomock.Any(), "/api/dvr/autorec/grid", gomock.Any(), gomock.Any()).DoAndReturn(respond(`{"entries":[
		{"uuid":"a1","enabled":true,"name":"Emmerdale","title":"^Emmerdale$","channel":"chITV1","record":3,"creator":"admin"},
		{"uuid":"a2","enabled":false,"name":"F1","title":"^(F1|Formula 1)\\b.*[Hh]ighlights","channel":"","record":15}]}`))
	m.EXPECT().Exec(gomock.Any(), "/api/channel/grid", gomock.Any(), gomock.Any()).DoAndReturn(respond(channelsJSON))

	list, err := svc.GetAutorecs(context.Background())
	assert.NoError(t, err)
	assert.Len(t, list, 2)
	assert.Equal(t, "Emmerdale", list[0].PlainTitle)
	assert.False(t, list[0].IsPattern)
	assert.Equal(t, "ITV1 HD", list[0].ChannelName)
	assert.Equal(t, "skip_repeats", list[0].Duplicates)
	assert.True(t, list[1].IsPattern)
	assert.False(t, list[1].Enabled)
	assert.Equal(t, "", list[1].ChannelID)
	assert.Equal(t, "dvr_config", list[1].Duplicates)
}

func expectCreate(m *mock_tvheadend.MockClient, conf map[string]interface{}) {
	q := tvheadend.NewQuery()
	_ = q.Conf(&conf)
	m.EXPECT().Exec(gomock.Any(), "/api/dvr/autorec/create", gomock.Any(), q).DoAndReturn(respond(`{"uuid":"new1"}`))
}

func expectNoRulesYet(m *mock_tvheadend.MockClient) {
	m.EXPECT().Exec(gomock.Any(), "/api/epg/events/load", gomock.Any(), gomock.Any()).DoAndReturn(respond(eventJSON))
	m.EXPECT().Exec(gomock.Any(), "/api/dvr/autorec/grid", gomock.Any(), gomock.Any()).DoAndReturn(respond(`{"entries":[]}`))
	m.EXPECT().Exec(gomock.Any(), "/api/channel/grid", gomock.Any(), gomock.Any()).DoAndReturn(respond(channelsJSON)).AnyTimes()
}

func TestCreateAutorecDefaultsToThisChannelAndSkipsRepeats(t *testing.T) {
	m, svc := newMock(t)
	expectNoRulesYet(m)
	expectCreate(m, map[string]interface{}{
		"enabled": true, "name": "Emmerdale", "title": "^Emmerdale$", "channel": "chITV1",
		"record": core.AutorecRecordDifferentDescription, "comment": "Created by tvhgo",
	})

	rule, err := svc.CreateAutorecByEvent(context.Background(), core.CreateAutorecByEvent{EventID: 42})
	assert.NoError(t, err)
	assert.Equal(t, "new1", rule.ID)
	assert.Equal(t, "ITV1 HD", rule.ChannelName)
	assert.Equal(t, "skip_repeats", rule.Duplicates)
}

func TestCreateAutorecAnyChannelAndRepeats(t *testing.T) {
	m, svc := newMock(t)
	expectNoRulesYet(m)
	expectCreate(m, map[string]interface{}{
		"enabled": true, "name": "Emmerdale", "title": "^Emmerdale$", "channel": "",
		"record": core.AutorecRecordAll, "comment": "Created by tvhgo", "config_name": "cfg",
	})

	rule, err := svc.CreateAutorecByEvent(context.Background(),
		core.CreateAutorecByEvent{EventID: 42, AnyChannel: true, RecordRepeats: true, ConfigID: "cfg"})
	assert.NoError(t, err)
	assert.Equal(t, "", rule.ChannelID)
	assert.Equal(t, "all", rule.Duplicates)
}

func TestCreateAutorecEscapesTitle(t *testing.T) {
	m, svc := newMock(t)
	m.EXPECT().Exec(gomock.Any(), "/api/epg/events/load", gomock.Any(), gomock.Any()).
		DoAndReturn(respond(`{"entries":[{"eventId":1,"title":"Still Game (Part 2)? A+B","channelUuid":"chBBC"}]}`))
	m.EXPECT().Exec(gomock.Any(), "/api/dvr/autorec/grid", gomock.Any(), gomock.Any()).DoAndReturn(respond(`{"entries":[]}`))
	m.EXPECT().Exec(gomock.Any(), "/api/channel/grid", gomock.Any(), gomock.Any()).DoAndReturn(respond(channelsJSON)).AnyTimes()
	expectCreate(m, map[string]interface{}{
		"enabled": true, "name": "Still Game (Part 2)? A+B", "title": `^Still Game \(Part 2\)\? A\+B$`, "channel": "chBBC",
		"record": core.AutorecRecordDifferentDescription, "comment": "Created by tvhgo",
	})

	rule, err := svc.CreateAutorecByEvent(context.Background(), core.CreateAutorecByEvent{EventID: 1})
	assert.NoError(t, err)
	// the escaped pattern reads back as the plain title
	assert.Equal(t, "Still Game (Part 2)? A+B", rule.PlainTitle)
	assert.False(t, rule.IsPattern)
}

func TestCreateAutorecRefusesAnExistingRule(t *testing.T) {
	m, svc := newMock(t)
	m.EXPECT().Exec(gomock.Any(), "/api/epg/events/load", gomock.Any(), gomock.Any()).DoAndReturn(respond(eventJSON))
	m.EXPECT().Exec(gomock.Any(), "/api/dvr/autorec/grid", gomock.Any(), gomock.Any()).
		DoAndReturn(respond(`{"entries":[{"uuid":"a1","enabled":true,"name":"Emmerdale","title":"^Emmerdale$","channel":"chITV1"}]}`))
	m.EXPECT().Exec(gomock.Any(), "/api/channel/grid", gomock.Any(), gomock.Any()).DoAndReturn(respond(channelsJSON)).AnyTimes()
	// no create call is expected

	rule, err := svc.CreateAutorecByEvent(context.Background(), core.CreateAutorecByEvent{EventID: 42})
	assert.ErrorIs(t, err, core.ErrAutorecExists)
	assert.Equal(t, "a1", rule.ID)
}

func TestCreateAutorecForAnotherChannelIsAllowed(t *testing.T) {
	m, svc := newMock(t)
	m.EXPECT().Exec(gomock.Any(), "/api/epg/events/load", gomock.Any(), gomock.Any()).DoAndReturn(respond(eventJSON))
	m.EXPECT().Exec(gomock.Any(), "/api/dvr/autorec/grid", gomock.Any(), gomock.Any()).
		DoAndReturn(respond(`{"entries":[{"uuid":"a1","title":"^Emmerdale$","channel":"chBBC"}]}`))
	m.EXPECT().Exec(gomock.Any(), "/api/channel/grid", gomock.Any(), gomock.Any()).DoAndReturn(respond(channelsJSON)).AnyTimes()
	m.EXPECT().Exec(gomock.Any(), "/api/dvr/autorec/create", gomock.Any(), gomock.Any()).DoAndReturn(respond(`{"uuid":"new2"}`))

	rule, err := svc.CreateAutorecByEvent(context.Background(), core.CreateAutorecByEvent{EventID: 42})
	assert.NoError(t, err)
	assert.Equal(t, "new2", rule.ID)
}

func TestCreateAutorecUnknownEvent(t *testing.T) {
	m, svc := newMock(t)
	m.EXPECT().Exec(gomock.Any(), "/api/epg/events/load", gomock.Any(), gomock.Any()).DoAndReturn(respond(`{"entries":[]}`))
	_, err := svc.CreateAutorecByEvent(context.Background(), core.CreateAutorecByEvent{EventID: 9})
	assert.ErrorIs(t, err, core.ErrEpgEventNotFound)
}

func TestSetAutorecEnabledAndRemove(t *testing.T) {
	m, svc := newMock(t)
	save := tvheadend.NewQuery()
	_ = save.Node(map[string]interface{}{"uuid": "a1", "enabled": false})
	m.EXPECT().Exec(gomock.Any(), "/api/idnode/save", gomock.Any(), save).DoAndReturn(respond(`{}`))
	del := tvheadend.NewQuery()
	_ = del.SetJSON("uuid", []string{"a1"})
	m.EXPECT().Exec(gomock.Any(), "/api/idnode/delete", gomock.Any(), del).DoAndReturn(respond(`{}`))

	assert.NoError(t, svc.SetAutorecEnabled(context.Background(), "a1", false))
	assert.NoError(t, svc.RemoveAutorec(context.Background(), "a1"))
}

func TestPlainTitleOf(t *testing.T) {
	cases := map[string]struct {
		plain string
		ok    bool
	}{
		"^Emmerdale$":              {"Emmerdale", true},
		`^Still Game \(Part 2\)$`:  {"Still Game (Part 2)", true},
		"^(F1|Formula 1)\\b.*Live": {"^(F1|Formula 1)\\b.*Live", false},
		"Emmerdale":                {"Emmerdale", false},
		"^Emmer.*$":                {"^Emmer.*$", false},
	}
	for in, want := range cases {
		plain, ok := core.PlainTitleOf(in)
		assert.Equal(t, want.plain, plain, in)
		assert.Equal(t, want.ok, ok, in)
	}
}
