package playback

import "testing"

func TestIsAdChapter(t *testing.T) {
	yes := []string{"Commercial", "commercial", "Ad", "Advert", "Adverts", "Advertisement", "Intermission", "Ad break", "Commercial 2"}
	no := []string{"Part 1", "Credits", "Intro", "Adventure", "Add", "Ad End", "Commercial End", "Radio", ""}
	for _, s := range yes {
		if !IsAdChapter(s) {
			t.Errorf("%q should be an advert chapter", s)
		}
	}
	for _, s := range no {
		if IsAdChapter(s) {
			t.Errorf("%q should not be an advert chapter", s)
		}
	}
}

func TestParseChapters(t *testing.T) {
	in := []byte(`{"chapters":[
		{"start_time":"0.000000","end_time":"36.440000","tags":{"title":"Commercial"}},
		{"start_time":"36.440000","end_time":"663.360000","tags":{"title":"Part 1"}},
		{"start_time":"663.360000","end_time":"917.600000","tags":{"title":"Commercial"}},
		{"start_time":"10","end_time":"10","tags":{"title":"empty"}},
		{"start_time":"x","end_time":"5","tags":{}},
		{"start_time":"917.6","end_time":"1856.96"}]}`)
	list, err := parseChapters(in)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 4 {
		t.Fatalf("expected 4 usable chapters (empty and unparsable dropped), got %d: %+v", len(list), list)
	}
	if !list[0].Advert || list[1].Advert || !list[2].Advert || list[3].Advert {
		t.Fatalf("advert flags wrong: %+v", list)
	}
	if list[0].Start != 0 || list[2].Start != 663.36 || list[2].End != 917.6 {
		t.Fatalf("times wrong: %+v", list)
	}
}

func TestParseChaptersNone(t *testing.T) {
	list, err := parseChapters([]byte(`{}`))
	if err != nil || len(list) != 0 {
		t.Fatalf("got %v %v", list, err)
	}
}
