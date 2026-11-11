CREATE TABLE IF NOT EXISTS watch_progress (
    user_id INTEGER NOT NULL,
    recording_id TEXT NOT NULL,
    position DOUBLE PRECISION NOT NULL,
    duration DOUBLE PRECISION NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, recording_id),
    CONSTRAINT fk_user FOREIGN KEY(user_id) REFERENCES "user"(id) ON DELETE CASCADE
);
