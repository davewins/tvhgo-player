package watch

import (
	"context"
	"time"

	"github.com/davidborzek/tvhgo/core"
	"github.com/davidborzek/tvhgo/db"
)

type sqlRepository struct {
	db *db.DB
}

func New(db *db.DB) core.WatchProgressRepository {
	return &sqlRepository{db: db}
}

const (
	queryList = `
SELECT recording_id, position, duration, updated_at
FROM watch_progress
WHERE user_id = $1
ORDER BY updated_at DESC
`
	stmtUpsert = `
INSERT INTO watch_progress (user_id, recording_id, position, duration, updated_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, recording_id) DO UPDATE SET
position = excluded.position,
duration = excluded.duration,
updated_at = excluded.updated_at
`
	stmtDelete = `DELETE FROM watch_progress WHERE user_id = $1 AND recording_id = $2`
)

func (s *sqlRepository) List(ctx context.Context, userID int64) ([]*core.WatchProgress, error) {
	rows, err := s.db.QueryContext(ctx, queryList, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*core.WatchProgress{}
	for rows.Next() {
		p := new(core.WatchProgress)
		if err := rows.Scan(&p.RecordingID, &p.Position, &p.Duration, &p.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

func (s *sqlRepository) Save(ctx context.Context, userID int64, p *core.WatchProgress) error {
	p.UpdatedAt = time.Now().Unix()
	_, err := s.db.ExecContext(ctx, stmtUpsert, userID, p.RecordingID, p.Position, p.Duration, p.UpdatedAt)
	return err
}

func (s *sqlRepository) Delete(ctx context.Context, userID int64, recordingID string) error {
	_, err := s.db.ExecContext(ctx, stmtDelete, userID, recordingID)
	return err
}
