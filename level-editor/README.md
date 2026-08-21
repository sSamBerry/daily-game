# Level editor (design tool — not part of the live site)

`puzzle-lab.jsx` is the **full version** of the game: it has the dev menu,
the level browser, and the drag-to-build level editor with a play-test
button. This is a *design tool*, not something that gets deployed —
Netlify never touches this folder; it only builds from the root of the repo
(`src/DailyPuzzle.jsx`, the trimmed player-only version).

## How to actually use it

This file is meant to be pasted into a **Claude.ai conversation** as an
artifact (Claude.ai's "Code Execution and File Creation" / Artifacts
feature), not run locally with `npm run dev` — it relies on a
`window.storage` API that only exists inside Claude's own artifact sandbox,
for saving levels-in-progress while you design them.

1. Start a chat with Claude, upload or paste `puzzle-lab.jsx`.
2. Ask Claude to render it as an artifact, or ask it to help you design a
   new level directly (add enemies, buildings, walls, water tiles, give it a
   name and hint).
3. Use the in-app editor to place things and hit "Test play" until it's
   solvable and feels right.
4. Once you're happy with a level, ask Claude for its level definition as
   plain JSON/JS (the same shape as the entries already in
   `BUILT_IN_LEVELS`).
5. Add that object into the `BUILT_IN_LEVELS` array in
   `../src/DailyPuzzle.jsx` — this is the step that actually makes it part
   of the live rotation. Claude Code can do this step directly for you if
   you're working in this folder locally: just ask it to add the new level
   to `src/DailyPuzzle.jsx`.
6. Commit and push (via GitHub Desktop or Claude Code) — Netlify picks it
   up automatically.

## Keeping this file up to date

If you ask Claude to make further changes to gameplay, visuals, or
mechanics, remember there are technically two copies of the game logic in
this repo: this full editor version, and the trimmed player-only
`src/DailyPuzzle.jsx`. A change to *shared* game logic (how pushing,
pulling, rotating, or the win/loss conditions work) should ideally be made
in both places so they don't drift apart. A change that's purely
editor/menu-specific (like the level editor's tools) only needs to happen
here.
