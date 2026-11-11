package watch_test

import (
	"context"
	"testing"

	"github.com/davidborzek/tvhgo/core"
	"github.com/davidborzek/tvhgo/db/testdb"
	"github.com/davidborzek/tvhgo/repository/user"
	"github.com/davidborzek/tvhgo/repository/watch"
	"github.com/davidborzek/tvhgo/services/clock"
	"github.com/stretchr/testify/assert"
)

func TestWatchProgress(t *testing.T) {
	conn, err := testdb.Setup()
	assert.NoError(t, err)
	defer testdb.Close(conn)
	conn.SetMaxOpenConns(1) // every connection to ":memory:" is its own database
	repo := watch.New(conn)
	ctx := context.Background()
	users := user.New(conn, clock.NewClock())
	u1 := &core.User{Username: "one", Email: "1@example.com", PasswordHash: "x"}
	u2 := &core.User{Username: "two", Email: "2@example.com", PasswordHash: "x"}
	assert.NoError(t, users.Create(ctx, u1))
	assert.NoError(t, users.Create(ctx, u2))

	assert.NoError(t, repo.Save(ctx, u1.ID, &core.WatchProgress{RecordingID: "a", Position: 10.5, Duration: 100}))
	assert.NoError(t, repo.Save(ctx, u1.ID, &core.WatchProgress{RecordingID: "a", Position: 42, Duration: 100}))
	assert.NoError(t, repo.Save(ctx, u1.ID, &core.WatchProgress{RecordingID: "b", Position: 5, Duration: 50}))
	assert.NoError(t, repo.Save(ctx, u2.ID, &core.WatchProgress{RecordingID: "a", Position: 1, Duration: 100}))

	list, err := repo.List(ctx, 1)
	assert.NoError(t, err)
	assert.Len(t, list, 2)
	got := map[string]float64{}
	for _, p := range list {
		got[p.RecordingID] = p.Position
	}
	assert.Equal(t, 42.0, got["a"])
	assert.Equal(t, 5.0, got["b"])

	assert.NoError(t, repo.Delete(ctx, u1.ID, "a"))
	list, _ = repo.List(ctx, 1)
	assert.Len(t, list, 1)
	other, _ := repo.List(ctx, 2)
	assert.Len(t, other, 1)
}
