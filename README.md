# Daily Push Puzzle

This is the **complete project repo** — the live deployed site plus the
level-design tool, in one place. This is the repo you connect to GitHub
Desktop and push from; Netlify is watching it and auto-deploys on every
push to `main`.

## Folder layout

```
/                     ← the actual deployed site (Netlify builds from here)
  src/DailyPuzzle.jsx ← core: Defender game + routing + /config + home hub
  src/Sheep.jsx        ← Sheep game (the /sheep route + its /config lab)
  src/main.jsx
  index.html
  package.json / package-lock.json / vite.config.js / netlify.toml

level-editor/          ← NOT deployed — a design tool for making new puzzles
  puzzle-lab.jsx        ← full version with the menu + level editor
  README.md             ← how to use it

worker/                 ← the backend, deployed separately (see below)
  src/index.js           ← Cloudflare Worker: /api/score, /api/leaderboard,
                            /api/puzzles, /api/sheep/*
  schema.sql              ← D1 tables (scores + puzzles + game_scores)
  wrangler.toml           ← Worker + D1 binding config, CONFIG_PASSWORD var
```

## The two games

| Game     | Route        | Board  | Goal                                   | Leaderboard      |
|----------|--------------|--------|----------------------------------------|------------------|
| Defender | `/defenders` | 8×8    | keep all buildings standing            | fastest solve    |
| Sheep    | `/sheep`     | 16×16  | seal the biggest pen around the sheep  | most tiles penned|

Both pick today's puzzle by date, take backend-published puzzles as overrides,
have their own local streak, and are authored in `/config` (pick the game on
the lab's landing screen). The home hub (`/`) shows a card per game.

Netlify only ever builds `src/DailyPuzzle.jsx` (via `npm run build` at the
repo root, per `netlify.toml`). The `level-editor/` folder is just sitting
in the repo for your own reference — it's never bundled into the live site.

## Workflow for adding new puzzles (normal path — no code push)

Since the backend can store puzzles, the day-to-day flow doesn't touch code:

1. Go to **`/config`** on the live site (or locally), unlock with the
   password, pick **Defender** or **Sheep**.
2. Hit **New puzzle for `<date>`**, build the board, set the hint (and, for
   Sheep, the wall budget).
3. **Test play** it — make sure it's solvable (for Sheep: sealable within
   budget, with room to spare).
4. **Publish live for `<date>`**. It's written straight to the backend and
   the game serves it on that date, live within a minute. No commit, no
   deploy.

The puzzle list in `/config` shows a **LIVE** pill on every date that has a
published puzzle, plus an **Unpublish** button (which reverts that date to
the built-in puzzle). Puzzles you published for dates that aren't in the
build at all show up under "Live puzzles not in this build".

> A published puzzle for a date always wins over the built-in puzzle for
> that date. If the backend is unreachable when a player opens
> `/defenders`, the game shows a brief "couldn't load" and sends them back
> to the menu rather than serving a wrong puzzle — so keep the Worker up.

### Making a puzzle a permanent part of the build (still via Claude Code)

Publishing lives only in the backend D1. To bake a puzzle into the shipped
code (so it survives even without the backend), use **Copy JSON** in the
editor and ask Claude Code to add it to `BUILT_IN_LEVELS` in
`src/DailyPuzzle.jsx`, then commit and push as before.

## Setting up this folder as your repo

1. Unzip this into your Documents folder (or wherever you keep projects) —
   e.g. `~/Documents/daily-game`.
2. In GitHub Desktop: **File → Add Local Repository**, point it at that
   folder. If it says the folder isn't a git repo yet, use **File → Clone
   Repository** instead, cloning your existing `daily-game` GitHub repo
   into that exact path — then copy these files into the cloned folder,
   overwriting what's there.
3. Commit everything, push.
4. In Netlify, make sure the site is connected to that same GitHub repo
   (Site settings → Build & deploy → confirm it's linked). It'll read
   `netlify.toml` automatically for the build command, publish directory,
   and Node version — you shouldn't need to touch the Build Settings page.

## 1. Try it locally

```
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## 2. Set your launch date

Open `src/DailyPuzzle.jsx`, find:

```js
const LAUNCH_DATE = "2026-08-19";
```

Set this to the actual day you're launching. **Set it once and never change
it again** — changing it later shifts which puzzle everyone sees on a given
day.

## 3. How "different puzzle each day" works

There's no backend. Every visitor's browser independently computes:

```
dayIndex = (today's date − LAUNCH_DATE) in days
puzzle   = levelList[dayIndex % levelList.length]
```

Right now `levelList` is the 12 built-in levels from the game (Standoff is
first). That means the cycle repeats once you run out of levels. To fix
that as you go, keep adding new levels to `BUILT_IN_LEVELS` in
`src/DailyPuzzle.jsx` — see the Claude Code workflow above — staying ahead
of the calendar so it doesn't visibly repeat.

If you'd rather have a true backend pick/serve the puzzle (so you can
change tomorrow's puzzle after deploying, run a real archive page, etc.),
that's a bigger step — say the word and we can talk through it — but it's
not required to launch.

## 4. Domain vs. hosting — these are two different things

- **Hosting** is the computer that actually serves your game's files to
  visitors. This is required.
- **A domain** (like `dailypushpuzzle.com`) is just a friendly name that
  points at your host. This is optional — you can launch today on a free
  address like `dailygiu.netlify.app` and add a custom domain later
  whenever you like, with zero downtime.

**You don't need to buy a domain to launch.** Get it live first, buy the
domain later if you still want one.

## 5. Adding a custom domain later

Once you've bought a domain (Namecheap, Cloudflare, etc — any registrar
works, prices are all similar, ~$10–15/year for a .com):

1. In Netlify's project settings, add your domain.
2. They'll give you 1–2 DNS records to add at your registrar (usually just
   an A record or CNAME).
3. Add those at your registrar's DNS settings, wait a few minutes to a few
   hours for DNS to propagate. Done — free SSL/HTTPS included automatically.

## Known limitation to be aware of

Streaks are stored per-browser via `localStorage`, not a real account
system — a player switching devices or clearing browser data loses their
streak. That's fine for a v1 launch (this is exactly how most daily-puzzle
games start), but if you want cross-device streaks later, that needs a real
backend + login, which is a separate, bigger project.

## Backend (Cloudflare Worker + D1)

A small Cloudflare Worker at
`daily-giu-leaderboard.samberry3522.workers.dev`, backed by a D1 (SQLite)
database — separate from the static site, with its own deploy step. It does:

- **Defender leaderboard** — `GET /api/leaderboard`, `POST /api/score`
  (`scores` table, fastest time wins). No login: each player is a random id
  + a chosen nickname in `localStorage` (`getOrCreateAnonId` / `getNickname`
  in `src/DailyPuzzle.jsx`).
- **Sheep leaderboard** — `GET /api/sheep/leaderboard`, `POST /api/sheep/score`
  (`game_scores` table, highest score wins). Same anon id / nickname.
- **Published puzzles** — `GET /api/puzzles?game=` (public; each game fetches
  this on load), `POST /api/puzzles` and `POST /api/puzzles/delete` (publish
  / unpublish from `/config`). Writes are gated by `CONFIG_PASSWORD`, a
  `[vars]` entry in `wrangler.toml` that must match the `CONFIG_PASSWORD`
  constant in `src/DailyPuzzle.jsx` — the same value that's already in the
  client bundle, casual-write protection, not real auth.

### One-time setup after changing `schema.sql` / adding a game

```
cd worker
npx wrangler d1 execute daily-giu-leaderboard --remote --file schema.sql   # idempotent — creates any missing tables
npx wrangler deploy                                                        # ships index.js + CONFIG_PASSWORD
```

Then push the frontend once. After that, new puzzles for either game go
through **Publish** in `/config` with no deploy.

**To change the Worker's behavior later** (e.g. edit `worker/src/index.js`
or `worker/schema.sql`):

```
cd worker
npx wrangler deploy                              # after editing index.js
npx wrangler d1 execute daily-giu-leaderboard \
  --remote --file schema.sql                     # after editing schema.sql
```

This needs `npx wrangler login` once per machine (opens a browser to
authorize against the Cloudflare account that owns this Worker/D1
database). The frontend talks to the Worker over plain `fetch()` — no SDK,
no secrets in the client bundle. There's no anti-cheat: a submitted time is
trusted as-is, which is an accepted tradeoff for a casual leaderboard like
this one.

