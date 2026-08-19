# Daily Push Puzzle — player build

This is the player-facing game only — no dev menu, no level editor. It picks
one puzzle per day, the same for every visitor, purely by looking at the
date in the browser (no server/database needed, like Wordle).

## What's actually in here

- `src/DailyPuzzle.jsx` — the trimmed game. Menu screen and level editor
  removed; `window.storage` (a Claude-only API that doesn't exist in real
  browsers) swapped for real `localStorage`, used only to remember your
  win-streak on that device.
- `index.html` / `src/main.jsx` — a normal Vite + React entry point.
- `package.json` / `vite.config.js` — the build tooling.

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

Right now `levelList` is the 12 built-in levels from the game. That means
day 13 repeats day 1. To fix that as you go:

- Design more levels using the full editor (the version of this file *with*
  the level editor — not this trimmed build) and copy their JSON into the
  `BUILT_IN_LEVELS` array here.
- Keep adding to the array over time so the cycle stays ahead of the
  calendar — you don't need all of them on day 1, just more than you'll
  need before you next update the site.

If you'd rather have a true backend pick/serve the puzzle (so you can change
tomorrow's puzzle after deploying, run a real archive page, etc.), that's a
bigger step — say the word and we can talk through it — but it's not
required to launch.

## 4. Domain vs. hosting — these are two different things

- **Hosting** is the computer that actually serves your game's files to
  visitors. This is required.
- **A domain** (like `dailypushpuzzle.com`) is just a friendly name that
  points at your host. This is optional — you can launch today on a free
  address like `dailypushpuzzle.vercel.app` and add a custom domain later
  whenever you like, with zero downtime.

**You don't need to buy a domain to launch.** Get it live first, buy the
domain later if you still want one.

## 5. Deploying (free, ~5 minutes)

The easiest path for a static React app like this is **Vercel** or
**Netlify** — both have generous free tiers built exactly for this.

### Option A — Vercel

1. Push this folder to a GitHub repo.
2. Go to vercel.com → "Add New Project" → import that repo.
3. It auto-detects Vite. Click Deploy.
4. You get a live URL immediately (`your-project.vercel.app`).

### Option B — Netlify

Same idea: connect the repo at netlify.com, build command `npm run build`,
publish directory `dist`. Deploy.

### Option C — no GitHub account yet

Both Vercel and Netlify also let you drag-and-drop a folder to deploy:

```
npm run build
```

Then drag the resulting `dist/` folder onto Netlify's "Deploy manually" box
(app.netlify.com/drop). Live in seconds, no git required.

## 6. Adding a custom domain later

Once you've bought a domain (Namecheap, Cloudflare, Google Domains'
successor — any registrar works, prices are all similar, ~$10–15/year for a
.com):

1. In Vercel/Netlify's project settings, add your domain.
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
