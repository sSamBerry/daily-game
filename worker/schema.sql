CREATE TABLE IF NOT EXISTS scores (
  date TEXT NOT NULL,
  anon_id TEXT NOT NULL,
  name TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (date, anon_id)
);

CREATE INDEX IF NOT EXISTS idx_scores_date_time ON scores (date, time_ms);

-- Puzzles published straight from the /config puzzle lab (no code push). The
-- live game fetches these on load; a row here for a given date overrides the
-- built-in puzzle that date would otherwise show. `data` is JSON.stringify of
-- the level object (same shape as BUILT_IN_LEVELS entries in DailyPuzzle.jsx).
CREATE TABLE IF NOT EXISTS puzzles (
  game       TEXT NOT NULL DEFAULT 'defender',
  date       TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (game, date)
);

-- Generic daily leaderboard for games where higher is better (Sheep: most
-- tiles penned in). Defender keeps its own `scores` table (lower time wins).
CREATE TABLE IF NOT EXISTS game_scores (
  game         TEXT NOT NULL,
  date         TEXT NOT NULL,
  anon_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  score        INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (game, date, anon_id)
);

CREATE INDEX IF NOT EXISTS idx_game_scores ON game_scores (game, date, score DESC);
