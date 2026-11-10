package pipeline

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func write(t *testing.T, updated int64, body string) string {
	p := filepath.Join(t.TempDir(), "status.json")
	assert.NoError(t, os.WriteFile(p, []byte(fmt.Sprintf(`{"updated":%d,%s}`, updated, body)), 0o644))
	return p
}

func TestStatusAndConverting(t *testing.T) {
	p := write(t, time.Now().Unix(), `"current":{"id":"a","title":"A","step":"convert_mp4","percent":41.3,"since":1},
		"queue":[{"id":"b","title":"B","steps":["convert_mp4"]}],"failed":[{"id":"c","title":"C","step":"convert_mp4","detail":"x","attempts":5,"retry_at":null}]`)
	r := New(p)
	st := r.Status()
	assert.True(t, st.Available)
	assert.Equal(t, "A", st.Current.Title)
	assert.Len(t, st.Queue, 1)
	assert.Nil(t, st.Failed[0].RetryAt) // given up

	pct, ok := r.Converting("a")
	assert.True(t, ok)
	assert.Equal(t, 41, pct)
	_, ok = r.Converting("b")
	assert.False(t, ok)
}

func TestStaleOrMissingMeansUnavailable(t *testing.T) {
	assert.False(t, New(write(t, time.Now().Add(-10*time.Minute).Unix(), `"current":null,"queue":[],"failed":[]`)).Status().Available)
	assert.False(t, New("/nonexistent/status.json").Status().Available)
	assert.False(t, New("").Status().Available)
	var nilReader *Reader
	assert.False(t, nilReader.Status().Available)
}
