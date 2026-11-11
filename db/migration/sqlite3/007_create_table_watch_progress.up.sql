CREATE TABLE IF NOT EXISTS watch_progress (
    user_id INTEGER NOT NULL,
    recording_id TEXT NOT NULL,
    position REAL NOT NULL,
    duration REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, recording_id),
    FOREIGN KEY(user_id) REFERENCES user(id) ON DELETE CASCADE
);
