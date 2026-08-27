CREATE TABLE IF NOT EXISTS scores (
  date TEXT NOT NULL,
  anon_id TEXT NOT NULL,
  name TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (date, anon_id)
);

CREATE INDEX IF NOT EXISTS idx_scores_date_time ON scores (date, time_ms);
