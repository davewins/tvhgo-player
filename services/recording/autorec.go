package recording

import (
	"context"
	"regexp"
	"strings"

	"github.com/davidborzek/tvhgo/core"
	"github.com/davidborzek/tvhgo/tvheadend"
)

type autorecEntry struct {
	UUID     string `json:"uuid"`
	Enabled  bool   `json:"enabled"`
	Name     string `json:"name"`
	Title    string `json:"title"`
	FullText bool   `json:"fulltext"`
	Channel  string `json:"channel"`
	Record   int    `json:"record"`
	Creator  string `json:"creator"`
	Comment  string `json:"comment"`
}

func (s *service) channelNames(ctx context.Context) map[string]string {
	names := map[string]string{}
	q := tvheadend.NewQuery()
	q.Limit(1000)
	var grid tvheadend.ChannelGrid
	if res, err := s.tvh.Exec(ctx, "/api/channel/grid", &grid, q); err == nil && res.StatusCode < 400 {
		for _, c := range grid.Entries {
			names[c.UUID] = c.Name
		}
	}
	return names
}

func mapAutorec(e autorecEntry, channels map[string]string) *core.Autorec {
	plain, ok := core.PlainTitleOf(e.Title)
	return &core.Autorec{
		ID:          e.UUID,
		Enabled:     e.Enabled,
		Name:        e.Name,
		Title:       e.Title,
		PlainTitle:  plain,
		IsPattern:   !ok,
		FullText:    e.FullText,
		ChannelID:   e.Channel,
		ChannelName: channels[e.Channel],
		Duplicates:  core.DuplicatesName(e.Record),
		Creator:     e.Creator,
		Comment:     e.Comment,
	}
}

func (s *service) GetAutorecs(ctx context.Context) ([]*core.Autorec, error) {
	q := tvheadend.NewQuery()
	q.Limit(1000)

	var grid struct {
		Entries []autorecEntry `json:"entries"`
	}
	res, err := s.tvh.Exec(ctx, "/api/dvr/autorec/grid", &grid, q)
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 400 {
		return nil, ErrRequestFailed
	}

	channels := s.channelNames(ctx)
	list := make([]*core.Autorec, 0, len(grid.Entries))
	for _, e := range grid.Entries {
		list = append(list, mapAutorec(e, channels))
	}
	return list, nil
}

func (s *service) CreateAutorecByEvent(
	ctx context.Context,
	opts core.CreateAutorecByEvent,
) (*core.Autorec, error) {
	// the programme the rule is made from
	q := tvheadend.NewQuery()
	q.SetInt("eventId", opts.EventID)
	var events tvheadend.EpgEventGrid
	res, err := s.tvh.Exec(ctx, "/api/epg/events/load", &events, q)
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 400 {
		return nil, ErrRequestFailed
	}
	if len(events.Entries) == 0 {
		return nil, core.ErrEpgEventNotFound
	}
	event := events.Entries[0]

	// the rule is for the programme, not for its tag: "New: Lingo" and a later plain "Lingo" are the same show
	name := core.CleanTitle(event.Title)
	pattern := "^" + core.TitleTagPattern + regexp.QuoteMeta(name) + "$"
	channel := event.ChannelUUID
	if opts.AnyChannel {
		channel = ""
	}

	// no second rule for the same title and channel
	existing, err := s.GetAutorecs(ctx)
	if err != nil {
		return nil, err
	}
	for _, r := range existing {
		if r.ChannelID == channel && !r.IsPattern && strings.EqualFold(r.PlainTitle, name) {
			return r, core.ErrAutorecExists
		}
	}

	record := core.AutorecRecordDifferentDescription
	if opts.RecordRepeats {
		record = core.AutorecRecordAll
	}
	conf := map[string]interface{}{
		"enabled": true,
		"name":    name,
		"title":   pattern,
		"channel": channel,
		"record":  record,
		"comment": "Created by tvhgo",
	}
	if opts.ConfigID != "" {
		conf["config_name"] = opts.ConfigID
	}

	cq := tvheadend.NewQuery()
	if err := cq.Conf(&conf); err != nil {
		return nil, err
	}
	var created struct {
		UUID string `json:"uuid"`
	}
	cres, err := s.tvh.Exec(ctx, "/api/dvr/autorec/create", &created, cq)
	if err != nil {
		return nil, err
	}
	if cres.StatusCode >= 400 || created.UUID == "" {
		return nil, ErrRequestFailed
	}

	channels := s.channelNames(ctx)
	return mapAutorec(autorecEntry{
		UUID:    created.UUID,
		Enabled: true,
		Name:    name,
		Title:   pattern,
		Channel: channel,
		Record:  record,
		Comment: "Created by tvhgo",
	}, channels), nil
}

func (s *service) SetAutorecEnabled(ctx context.Context, id string, enabled bool) error {
	q := tvheadend.NewQuery()
	if err := q.Node(map[string]interface{}{"uuid": id, "enabled": enabled}); err != nil {
		return err
	}
	res, err := s.tvh.Exec(ctx, "/api/idnode/save", nil, q)
	if err != nil {
		return err
	}
	if res.StatusCode >= 400 {
		return ErrRequestFailed
	}
	return nil
}

func (s *service) RemoveAutorec(ctx context.Context, id string) error {
	q := tvheadend.NewQuery()
	if err := q.SetJSON("uuid", []string{id}); err != nil {
		return err
	}
	res, err := s.tvh.Exec(ctx, "/api/idnode/delete", nil, q)
	if err != nil {
		return err
	}
	if res.StatusCode >= 400 {
		return ErrRequestFailed
	}
	return nil
}
