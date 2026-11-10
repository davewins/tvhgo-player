// Package pipeline reads the status file of the tvh-pipeline container.
package pipeline

import (
	"encoding/json"
	"os"
	"sync"
	"time"

	"github.com/davidborzek/tvhgo/core"
)

// a status file older than this means the pipeline is not running (it refreshes every few seconds)
const staleAfter = 90 * time.Second

type doc struct {
	Updated int64                  `json:"updated"`
	Current *core.PipelineCurrent  `json:"current"`
	Queue   []core.PipelineWaiting `json:"queue"`
	Failed  []core.PipelineFailure `json:"failed"`
}

// Reader reads the status file, caching it briefly.
type Reader struct {
	path string

	mu     sync.Mutex
	at     time.Time
	cached core.PipelineStatus
}

func New(path string) *Reader { return &Reader{path: path} }

func (r *Reader) Status() core.PipelineStatus {
	empty := core.PipelineStatus{Queue: []core.PipelineWaiting{}, Failed: []core.PipelineFailure{}}
	if r == nil || r.path == "" {
		return empty
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if time.Since(r.at) < 2*time.Second {
		return r.cached
	}
	r.at = time.Now()
	r.cached = empty

	b, err := os.ReadFile(r.path)
	if err != nil {
		return r.cached
	}
	var d doc
	if json.Unmarshal(b, &d) != nil || time.Since(time.Unix(d.Updated, 0)) > staleAfter {
		return r.cached
	}
	st := core.PipelineStatus{Available: true, Current: d.Current, Queue: d.Queue, Failed: d.Failed}
	if st.Queue == nil {
		st.Queue = []core.PipelineWaiting{}
	}
	if st.Failed == nil {
		st.Failed = []core.PipelineFailure{}
	}
	r.cached = st
	return r.cached
}

// Converting returns the percentage if the pipeline is converting this recording to MP4 right now.
func (r *Reader) Converting(id string) (percent int, ok bool) {
	st := r.Status()
	if !st.Available || st.Current == nil || st.Current.ID != id || st.Current.Step != "convert_mp4" {
		return 0, false
	}
	if st.Current.Percent != nil {
		percent = int(*st.Current.Percent)
	}
	return percent, true
}
