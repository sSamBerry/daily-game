const ALLOWED_ORIGINS = new Set([
  "https://dailygiu.com",
  "http://localhost:5173",
]);

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://dailygiu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME_LEN = 20;
const MAX_TIME_MS = 24 * 60 * 60 * 1000;
const KNOWN_GAMES = new Set(["defender"]);
const MAX_PUZZLE_BYTES = 20000;

function cleanName(raw) {
  const trimmed = String(raw ?? "").trim().slice(0, MAX_NAME_LEN);
  return trimmed || "Anonymous";
}

async function handleGetLeaderboard(request, env, origin) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const anonId = url.searchParams.get("anonId") || "";
  if (!date || !DATE_RE.test(date)) {
    return json({ error: "invalid date" }, 400, origin);
  }

  const { results } = await env.DB.prepare(
    "SELECT anon_id, name, time_ms FROM scores WHERE date = ? ORDER BY time_ms ASC LIMIT 50"
  )
    .bind(date)
    .all();

  const entries = results.map((row, i) => ({
    rank: i + 1,
    name: row.name,
    timeMs: row.time_ms,
    isYou: row.anon_id === anonId,
  }));

  return json({ date, entries }, 200, origin);
}

async function handlePostScore(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "invalid json" }, 400, origin);
  }

  const { date, anonId, name, timeMs } = body || {};
  if (!date || !DATE_RE.test(date)) return json({ error: "invalid date" }, 400, origin);
  if (!anonId || typeof anonId !== "string" || anonId.length > 64) {
    return json({ error: "invalid anonId" }, 400, origin);
  }
  if (!Number.isFinite(timeMs) || timeMs <= 0 || timeMs > MAX_TIME_MS) {
    return json({ error: "invalid timeMs" }, 400, origin);
  }

  const safeName = cleanName(name);
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO scores (date, anon_id, name, time_ms, submitted_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date, anon_id) DO UPDATE SET
       name = excluded.name,
       time_ms = MIN(scores.time_ms, excluded.time_ms),
       submitted_at = excluded.submitted_at`
  )
    .bind(date, anonId, safeName, Math.round(timeMs), now)
    .run();

  return json({ ok: true }, 200, origin);
}

function cleanGame(raw) {
  const g = String(raw ?? "defender").trim();
  return KNOWN_GAMES.has(g) ? g : "defender";
}

// Published puzzles for the live game. Public read — the game fetches this on
// load and a row here overrides the built-in puzzle for its date.
async function handleGetPuzzles(request, env, origin) {
  const url = new URL(request.url);
  const game = cleanGame(url.searchParams.get("game"));

  const { results } = await env.DB.prepare(
    "SELECT date, data FROM puzzles WHERE game = ? ORDER BY date ASC"
  )
    .bind(game)
    .all();

  const puzzles = results.map((row) => ({ date: row.date, data: row.data }));
  return json({ game, puzzles }, 200, origin);
}

// Publish (or overwrite) a puzzle for a date. Gated by the same shared
// password as /config — casual-write protection only, not real auth.
async function handlePostPuzzle(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "invalid json" }, 400, origin);
  }

  const { game: rawGame, date, password, level } = body || {};
  if (password !== env.CONFIG_PASSWORD) return json({ error: "unauthorized" }, 401, origin);
  if (!date || !DATE_RE.test(date)) return json({ error: "invalid date" }, 400, origin);
  if (!level || typeof level !== "object" || Array.isArray(level)) {
    return json({ error: "invalid level" }, 400, origin);
  }
  for (const field of ["units", "enemies", "buildings", "walls"]) {
    if (!Array.isArray(level[field])) {
      return json({ error: `level.${field} must be an array` }, 400, origin);
    }
  }

  const game = cleanGame(rawGame);
  const stored = {
    ...level,
    date,
    id: level.id || `pub-${date}`,
  };
  const dataStr = JSON.stringify(stored);
  if (dataStr.length > MAX_PUZZLE_BYTES) {
    return json({ error: "level too large" }, 400, origin);
  }

  await env.DB.prepare(
    `INSERT INTO puzzles (game, date, data, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(game, date) DO UPDATE SET
       data = excluded.data,
       updated_at = excluded.updated_at`
  )
    .bind(game, date, dataStr, Date.now())
    .run();

  return json({ ok: true }, 200, origin);
}

async function handleDeletePuzzle(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "invalid json" }, 400, origin);
  }

  const { game: rawGame, date, password } = body || {};
  if (password !== env.CONFIG_PASSWORD) return json({ error: "unauthorized" }, 401, origin);
  if (!date || !DATE_RE.test(date)) return json({ error: "invalid date" }, 400, origin);

  await env.DB.prepare("DELETE FROM puzzles WHERE game = ? AND date = ?")
    .bind(cleanGame(rawGame), date)
    .run();

  return json({ ok: true }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      return handleGetLeaderboard(request, env, origin);
    }
    if (url.pathname === "/api/score" && request.method === "POST") {
      return handlePostScore(request, env, origin);
    }
    if (url.pathname === "/api/puzzles" && request.method === "GET") {
      return handleGetPuzzles(request, env, origin);
    }
    if (url.pathname === "/api/puzzles" && request.method === "POST") {
      return handlePostPuzzle(request, env, origin);
    }
    if (url.pathname === "/api/puzzles/delete" && request.method === "POST") {
      return handleDeletePuzzle(request, env, origin);
    }

    return json({ error: "not found" }, 404, origin);
  },
};
