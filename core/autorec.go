package core

import (
	"errors"
	"regexp"
	"strings"
)

var (
	ErrAutorecNotFound = errors.New("series rule not found")
	ErrAutorecExists   = errors.New("a series rule for this programme already exists")
)

const (
	// AutorecRecordAll records every matching broadcast, repeats included.
	AutorecRecordAll = 0
	// AutorecRecordDifferentDescription skips a broadcast whose description was already recorded (i.e. a repeat).
	AutorecRecordDifferentDescription = 3
	// AutorecRecordDVRConfig leaves duplicate handling to the DVR configuration.
	AutorecRecordDVRConfig = 15
)

type (
	// Autorec is a series rule: tvheadend schedules every upcoming programme matching it.
	Autorec struct {
		ID      string `json:"id"`
		Enabled bool   `json:"enabled"`
		Name    string `json:"name"`
		// Title is the title pattern as tvheadend stores it (a regular expression).
		Title string `json:"title"`
		// PlainTitle is Title as plain text when it is just "^exact title$"; IsPattern is true when it is not.
		PlainTitle  string `json:"plainTitle"`
		IsPattern   bool   `json:"isPattern"`
		FullText    bool   `json:"fullText"`
		ChannelID   string `json:"channelId"`
		ChannelName string `json:"channelName"`
		// Duplicates is "all", "skip_repeats", "dvr_config" or "other".
		Duplicates string `json:"duplicates"`
		Creator    string `json:"creator"`
		Comment    string `json:"comment"`
	}

	// CreateAutorecByEvent defines a series rule made from a programme.
	CreateAutorecByEvent struct {
		EventID int64 `json:"eventId"`
		// AnyChannel matches the title on every channel; by default the rule is for the programme's channel only.
		AnyChannel bool `json:"anyChannel"`
		// RecordRepeats records repeats too; by default a broadcast already recorded is skipped.
		RecordRepeats bool   `json:"recordRepeats"`
		ConfigID      string `json:"configId"`
	}
)

var literalTitle = regexp.MustCompile(`^\^(.*)\$$`)

// PlainTitleOf returns the text a title pattern matches exactly, if it is a plain "^text$" pattern.
func PlainTitleOf(pattern string) (string, bool) {
	// rules made by tvhgo allow the broadcast tag ("New: ") in front of the title
	if strings.HasPrefix(pattern, "^"+TitleTagPattern) {
		pattern = "^" + strings.TrimPrefix(pattern, "^"+TitleTagPattern)
	}
	m := literalTitle.FindStringSubmatch(pattern)
	if m == nil {
		return pattern, false
	}
	var b strings.Builder
	inner := m[1]
	for i := 0; i < len(inner); i++ {
		c := inner[i]
		if c == '\\' && i+1 < len(inner) {
			i++
			b.WriteByte(inner[i])
			continue
		}
		if strings.IndexByte(`.+*?()|[]{}^$`, c) >= 0 {
			return pattern, false // a real pattern, not just escaped text
		}
		b.WriteByte(c)
	}
	return b.String(), true
}

// DuplicatesName names tvheadend's duplicate handling value.
func DuplicatesName(record int) string {
	switch record {
	case AutorecRecordAll:
		return "all"
	case AutorecRecordDVRConfig:
		return "dvr_config"
	case AutorecRecordDifferentDescription:
		return "skip_repeats"
	}
	return "other"
}
