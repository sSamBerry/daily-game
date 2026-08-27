# Daily Push Puzzle

This is the **complete project repo** — the live deployed site plus the
level-design tool, in one place. This is the repo you connect to GitHub
Desktop and push from; Netlify is watching it and auto-deploys on every
push to `main`.

## Folder layout

```
/                     ← the actual deployed site (Netlify builds from here)
  src/DailyPuzzle.jsx ← the game, player-only, picks today's puzzle by date
  src/main.jsx
  index.html
  package.json / package-lock.json / vite.config.js / netlify.toml

level-editor/          ← NOT deployed — a design tool for making new puzzles
  puzzle-lab.jsx        ← full version with the menu + level editor
  README.md             ← how to use it

worker/                 ← the leaderboard backend, deployed separately (see below)
  src/index.js           ← Cloudflare Worker: POST /api/score, GET /api/leaderboard
  schema.sql              ← D1 table definition
  wrangler.toml           ← Worker + D1 binding config
```

Netlify only ever builds `src/DailyPuzzle.jsx` (via `npm run build` at the
repo root, per `netlify.toml`). The `level-editor/` folder is just sitting
in the repo for your own reference — it's never bundled into the live site.

## Workflow for adding new puzzles (with Claude Code)

1. **Design the level.** Either use `level-editor/puzzle-lab.jsx` as a
   Claude.ai artifact to visually build and test a level (see
   `level-editor/README.md`), or just describe the puzzle you want in plain
   English to Claude Code and let it write the level JSON directly.
2. **Ask Claude Code to add it.** With this folder open in Claude Code,
   something like: *"Add a new level to `src/DailyPuzzle.jsx`'s
   BUILT_IN_LEVELS array: a Pusher and a Rotator, two enemies, one
   building..."* — Claude Code edits the file directly.
3. **Test locally** (optional but recommended):
   ```
   npm install
   npm run dev
   ```
4. **Commit and push** — via GitHub Desktop, or ask Claude Code to do it
   for you (`git add`, `git commit`, `git push`). Netlify picks it up
   automatically within a minute or two.

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

## Leaderboard backend (Cloudflare Worker + D1)

Daily solve times go to a small Cloudflare Worker at
`daily-giu-leaderboard.samberry3522.workers.dev`, backed by a D1 (SQLite)
table — this is separate from the GitHub Pages static site and has its own
deploy step. No login: each player is a random id + a chosen nickname, both
saved in `localStorage` (see `getOrCreateAnonId` / `getNickname` in
`src/DailyPuzzle.jsx`).

**To change the Worker's behavior** (e.g. edit `worker/src/index.js` or
`worker/schema.sql`):

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

