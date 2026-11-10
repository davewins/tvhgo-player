package core_test

import (
	"testing"

	"github.com/davidborzek/tvhgo/core"
)

func TestCleanTitle(t *testing.T) {
	cases := map[string]string{
		"New: Lingo":             "Lingo",
		"NEW: Lingo":             "Lingo",
		"new : Lingo":            "Lingo",
		"New Series: Lingo":      "Lingo",
		"Final: Lingo":           "Lingo",
		"Last in Series: Lingo":  "Lingo",
		"Return: Lingo":          "Lingo",
		"New: Final: Lingo":      "Lingo",
		"Lingo":                  "Lingo",
		"DIY SOS: The Big Build": "DIY SOS: The Big Build", // a real title, not a tag
		"Snooker: Scottish Open": "Snooker: Scottish Open",
		"Newsnight":              "Newsnight",
		"New: ":                  "New:", // nothing left: leave it
		"  New:   Pointless  ":   "Pointless",
	}
	for in, want := range cases {
		if got := core.CleanTitle(in); got != want {
			t.Errorf("CleanTitle(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPlainTitleOfUnderstandsTheTagGroup(t *testing.T) {
	plain, ok := core.PlainTitleOf("^" + core.TitleTagPattern + `Lingo$`)
	if !ok || plain != "Lingo" {
		t.Fatalf("got %q %v", plain, ok)
	}
}
