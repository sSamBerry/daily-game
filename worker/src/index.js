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

    return json({ error: "not found" }, 404, origin);
  },
};
