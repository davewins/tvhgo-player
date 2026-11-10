package core

import (
	"regexp"
	"strings"
)

// Broadcasters tag programme titles with notes such as "New: Lingo" or "Final: Lingo". The tag is not part of the
// programme's name: it must not stop artwork being found, split a show into two, or make a series rule miss the
// episodes that are not tagged. Only these known tags are removed; "DIY SOS: The Big Build" is a real title.
const titleTagGroup = `(New Series|New|Final|Last in Series|Last|Returns|Return|Premiere)`

var titleTag = regexp.MustCompile(`(?i)^` + titleTagGroup + `\s*:\s*`)

// TitleTagPattern is the tag as a (tvheadend / PCRE) pattern, optional, for the start of a title pattern.
const TitleTagPattern = `(` + titleTagGroup + `: ?)?`

// CleanTitle removes a leading broadcast tag: "New: Lingo" -> "Lingo".
func CleanTitle(title string) string {
	t := strings.TrimSpace(title)
	for i := 0; i < 2; i++ { // "New: Final: X" is not unheard of
		stripped := titleTag.ReplaceAllString(t, "")
		if stripped == t || strings.TrimSpace(stripped) == "" {
			break
		}
		t = strings.TrimSpace(stripped)
	}
	return t
}
