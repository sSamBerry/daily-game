import { useState, useEffect, useRef, useMemo } from "react";
import { ArrowLeft, Plus, Pencil, RotateCcw, Info, X } from "lucide-react";
import {
  clone,
  uid,
  LEADERBOARD_API,
  getOrCreateAnonId,
  getNickname,
  saveNickname,
  amsterdamPuzzleDateStr,
  shiftDateStr,
  pickDailyLevel,
  mergeLevels,
  fetchPublishedPuzzles,
  publishPuzzle,
  unpublishPuzzle,
  getConfigPassword,
  NicknamePrompt,
} from "./DailyPuzzle.jsx";

// ===========================================================================
// Sheep — the second daily game. 16x16 board, one sheep, some preset walls,
// and a budget of your own walls to place. Build the biggest fully-sealed pen
// around the sheep; your score is the number of tiles inside it. No timer.
// Leaderboard = most tiles. Streak = any day you seal a pen (score >= 1).
//
// Mirrors Defender's shape: /sheep route (SheepApp), a /config puzzle lab
// (SheepConfigApp), backend-published puzzles overriding the built-ins by
// date, and its own localStorage streak.
// ===========================================================================

export const SHEEP_SIZE = 12;
// Sheep goes live on this puzzle-day (rolls over 9am Europe/Amsterdam, same
// as everything else). Before it, /sheep is locked and the home tile shows a
// "coming tomorrow" state. Set once, never change — it's also "puzzle #1".
export const SHEEP_LAUNCH_DATE = "2026-09-03";

const key = (x, y) => x + "," + y;

// --- Scoring --------------------------------------------------------------
//
// Flood-fill from the sheep across every non-wall cell, 4-connected. The board
// border is OPEN: if the fill can step off the grid, the sheep isn't enclosed
// and the score is 0. Otherwise the score is the number of filled cells (the
// sheep's own cell included). Two walls that only touch at a diagonal corner
// still seal the gap, because a 4-connected fill can't move diagonally.
export function scoreEnclosure(sheep, wallKeys, size = SHEEP_SIZE) {
  if (wallKeys.has(key(sheep.x, sheep.y))) return { sealed: false, cells: [] };
  const seen = new Set([key(sheep.x, sheep.y)]);
  const stack = [[sheep.x, sheep.y]];
  const cells = [];
  let sealed = true;
  while (stack.length) {
    const [x, y] = stack.pop();
    cells.push(key(x, y));
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) {
        sealed = false;
        continue;
      }
      const k = key(nx, ny);
      if (seen.has(k) || wallKeys.has(k)) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  return sealed ? { sealed: true, cells } : { sealed: false, cells: [] };
}

// Order the sealed cells so the count-up animation radiates out from the sheep.
function radiateOrder(cells, sheep) {
  return cells.slice().sort((a, b) => {
    const [ax, ay] = a.split(",").map(Number);
    const [bx, by] = b.split(",").map(Number);
    const da = Math.abs(ax - sheep.x) + Math.abs(ay - sheep.y);
    const db = Math.abs(bx - sheep.x) + Math.abs(by - sheep.y);
    return da - db || ay - by || ax - bx;
  });
}

// --- Built-in puzzles ---------------------------------------------------------
//
// Fallback rotation when no puzzle is published for the day. Each is sealable
// within its budget with interior left to spare — verified by the node harness
// in this repo (see the plan's Verification section).

function rectPerimeter(x0, y0, x1, y1) {
  const out = [];
  for (let x = x0; x <= x1; x++) {
    out.push({ x, y: y0 });
    out.push({ x, y: y1 });
  }
  for (let y = y0 + 1; y < y1; y++) {
    out.push({ x: x0, y });
    out.push({ x: x1, y });
  }
  return out;
}
function drop(walls, holes) {
  const hs = new Set(holes.map((h) => key(h.x, h.y)));
  return walls.filter((w) => !hs.has(key(w.x, w.y)));
}
function line(x0, y0, x1, y1) {
  const out = [];
  if (x0 === x1) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push({ x: x0, y });
  else for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push({ x, y: y0 });
  return out;
}
// Rectangle outline walked clockwise from the top-left, so `keep(i)` can pick
// a scattered subset of it as pre-set fence.
function ringPath(x0, y0, x1, y1) {
  const out = [];
  for (let x = x0; x <= x1; x++) out.push({ x, y: y0 });
  for (let y = y0 + 1; y <= y1; y++) out.push({ x: x1, y });
  for (let x = x1 - 1; x >= x0; x--) out.push({ x, y: y1 });
  for (let y = y1 - 1; y >= y0 + 1; y--) out.push({ x: x0, y });
  return out;
}
function ringKeep(x0, y0, x1, y1, keep) {
  return ringPath(x0, y0, x1, y1).filter((_, i) => keep(i));
}

// The undated rotation — used only after the scheduled puzzles run out (or as
// filler if the backend is empty). Every puzzle is sealable within its budget
// with room to spare; verified by the node harness in this repo.
const ROTATION = [
  { id: "sheep-scatter", name: "Scattered Posts", walls: [
      { x: 3, y: 3 }, { x: 5, y: 3 }, { x: 8, y: 3 },
      { x: 9, y: 4 }, { x: 9, y: 6 }, { x: 9, y: 9 },
      { x: 4, y: 9 }, { x: 7, y: 9 }, { x: 3, y: 5 }, { x: 3, y: 8 },
      { x: 1, y: 7 }, { x: 11, y: 4 }], sheep: { x: 6, y: 6 }, budget: 16 },
  { id: "sheep-broken-fence", name: "Broken Fence", walls: drop(rectPerimeter(1, 1, 10, 10), [
      { x: 5, y: 1 }, { x: 6, y: 1 }, { x: 5, y: 10 }, { x: 6, y: 10 },
      { x: 1, y: 5 }, { x: 1, y: 6 }, { x: 10, y: 5 }, { x: 10, y: 6 }]), sheep: { x: 5, y: 5 }, budget: 12 },
  { id: "sheep-corridor", name: "Corridor", walls: [...line(3, 2, 3, 9), ...line(8, 2, 8, 9)], sheep: { x: 5, y: 5 }, budget: 14 },
  { id: "sheep-open-gate", name: "Open Gate", walls: drop(rectPerimeter(2, 2, 8, 9), line(2, 2, 2, 9)), sheep: { x: 4, y: 5 }, budget: 10 },
  { id: "sheep-pillars", name: "Pillars", walls: [
      { x: 3, y: 3 }, { x: 8, y: 3 }, { x: 3, y: 8 }, { x: 8, y: 8 },
      { x: 6, y: 3 }, { x: 6, y: 8 }, { x: 3, y: 6 }, { x: 8, y: 6 }], sheep: { x: 6, y: 6 }, budget: 14 },
  { id: "sheep-sandwich", name: "Sandwich", walls: [...line(3, 3, 8, 3), ...line(3, 8, 8, 8)], sheep: { x: 5, y: 5 }, budget: 12 },
];

// Scheduled daily puzzles — Sept 3 2026 onward. These are editable and
// re-publishable from /config exactly like Defender's dated levels; a puzzle
// published to the backend for one of these dates overrides the entry here.
const SCHEDULED = [
  { id: "sheep-2026-09-03", name: "Half Fence", date: "2026-09-03",
    walls: ringKeep(3, 3, 8, 8, (i) => i % 5 < 3), sheep: { x: 6, y: 6 }, budget: 12 },
  { id: "sheep-2026-09-04", name: "Dashed Paddock", date: "2026-09-04",
    walls: ringKeep(2, 2, 9, 9, (i) => i % 2 === 0), sheep: { x: 6, y: 6 }, budget: 16 },
  { id: "sheep-2026-09-05", name: "Long Yard", date: "2026-09-05",
    walls: ringKeep(2, 3, 9, 8, (i) => i % 3 !== 2), sheep: { x: 5, y: 5 }, budget: 12 },
  { id: "sheep-2026-09-06", name: "Twin Rails", date: "2026-09-06",
    walls: [...line(3, 2, 3, 9), ...line(8, 2, 8, 9)], sheep: { x: 5, y: 5 }, budget: 14 },
  { id: "sheep-2026-09-07", name: "Broken Ring", date: "2026-09-07",
    walls: ringKeep(1, 2, 10, 9, (i) => i % 4 < 3), sheep: { x: 5, y: 5 }, budget: 12 },
  { id: "sheep-2026-09-08", name: "Corner Start", date: "2026-09-08",
    walls: ringPath(2, 2, 8, 8).slice(13), sheep: { x: 4, y: 5 }, budget: 16 },
  { id: "sheep-2026-09-09", name: "Scatter Field", date: "2026-09-09",
    walls: ringKeep(3, 2, 9, 9, (i) => i % 3 !== 0), sheep: { x: 6, y: 6 }, budget: 12 },
  { id: "sheep-2026-09-10", name: "Fence Posts", date: "2026-09-10",
    walls: [
      { x: 3, y: 3 }, { x: 8, y: 3 }, { x: 3, y: 8 }, { x: 8, y: 8 },
      { x: 6, y: 3 }, { x: 6, y: 8 }, { x: 3, y: 6 }, { x: 8, y: 6 }],
    sheep: { x: 6, y: 6 }, budget: 14 },
  { id: "sheep-2026-09-11", name: "Big Field", date: "2026-09-11",
    walls: ringKeep(1, 1, 10, 10, (i) => i % 3 !== 0), sheep: { x: 5, y: 5 }, budget: 14 },
  { id: "sheep-2026-09-12", name: "Nearly Sealed", date: "2026-09-12",
    walls: ringKeep(2, 2, 9, 9, (i) => i % 7 !== 0), sheep: { x: 5, y: 5 }, budget: 8 },
];

export const SHEEP_LEVELS = [...SCHEDULED, ...ROTATION];

export function blankSheepLevel() {
  return { id: null, name: "New pen", date: "", sheep: { x: 6, y: 6 }, walls: [], budget: 12 };
}

// A published row is only usable as a Sheep puzzle if it actually has the
// Sheep shape — guards against a bad publish, and against an older backend
// that doesn't know the "sheep" game yet and hands back Defender puzzles.
function isSheepLevel(p) {
  return (
    p &&
    p.sheep &&
    Number.isFinite(p.sheep.x) &&
    Number.isFinite(p.sheep.y) &&
    Number.isFinite(p.budget) &&
    Array.isArray(p.walls)
  );
}

// --- Streak (Sheep-namespaced localStorage, no migration bonus) --------------

function recordSheepPlayAndGetStreak() {
  const today = amsterdamPuzzleDateStr();
  let streak = 1;
  try {
    const raw = localStorage.getItem("sheep_streak");
    if (raw) {
      const data = JSON.parse(raw);
      if (data.lastDate === today) return Promise.resolve(data.streak);
      if (data.lastDate === shiftDateStr(today, -1)) streak = data.streak + 1;
    }
  } catch (e) {
    // no streak yet / storage unavailable — start at 1
  }
  try {
    localStorage.setItem("sheep_streak", JSON.stringify({ lastDate: today, streak }));
  } catch (e) {
    // ignore write failure
  }
  return Promise.resolve(streak);
}

export function getSheepStreak() {
  const today = amsterdamPuzzleDateStr();
  try {
    const raw = localStorage.getItem("sheep_streak");
    if (!raw) return 0;
    const data = JSON.parse(raw);
    if (data.lastDate === today || data.lastDate === shiftDateStr(today, -1)) return data.streak;
    return 0;
  } catch (e) {
    return 0;
  }
}

export function sheepHasPlayedToday() {
  try {
    const raw = localStorage.getItem("sheep_streak");
    if (!raw) return false;
    return JSON.parse(raw).lastDate === amsterdamPuzzleDateStr();
  } catch (e) {
    return false;
  }
}

function saveSheepLastResult(date, score) {
  try {
    const prev = getSheepLastResult(date);
    const best = prev ? Math.max(prev.score, score) : score;
    localStorage.setItem("sheep_last_result", JSON.stringify({ date, score: best }));
  } catch (e) {
    // ignore
  }
}
function getSheepLastResult(date) {
  try {
    const d = JSON.parse(localStorage.getItem("sheep_last_result"));
    return d && d.date === date ? d : null;
  } catch (e) {
    return null;
  }
}

function saveSheepInProgress(date, id, placed) {
  try {
    localStorage.setItem("sheep_inprogress", JSON.stringify({ date, id, placed }));
  } catch (e) {
    // ignore
  }
}
function loadSheepInProgress(date, id) {
  try {
    const d = JSON.parse(localStorage.getItem("sheep_inprogress"));
    return d && d.date === date && d.id === id ? d.placed : null;
  } catch (e) {
    return null;
  }
}
function clearSheepInProgress() {
  try {
    localStorage.removeItem("sheep_inprogress");
  } catch (e) {
    // ignore
  }
}

// --- Leaderboard API (best-effort, mirrors DailyPuzzle's submitScore) --------

async function submitSheepScore(date, score) {
  try {
    await fetch(`${LEADERBOARD_API}/api/sheep/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, anonId: getOrCreateAnonId(), name: getNickname(), score }),
    });
  } catch (e) {
    // offline / worker down — the local result and streak still stand
  }
}
async function fetchSheepLeaderboard(date) {
  try {
    const res = await fetch(
      `${LEADERBOARD_API}/api/sheep/leaderboard?date=${date}&anonId=${encodeURIComponent(getOrCreateAnonId())}`
    );
    if (!res.ok) return null;
    return (await res.json()).entries || [];
  } catch (e) {
    return null;
  }
}

// --- Shared styling --------------------------------------------------------

const FONT = "'Baloo 2', system-ui, sans-serif";
const MONO = "'DM Mono', monospace";

function backdropStyle(scroll) {
  return {
    height: "100dvh",
    width: "100%",
    overflowY: "auto",
    backgroundColor: "#ffe9f3",
    backgroundImage:
      "linear-gradient(#ffffff 2px, transparent 2px), linear-gradient(90deg, #ffffff 2px, transparent 2px)",
    backgroundSize: "36px 36px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: scroll ? "flex-start" : "center",
    padding: "24px 16px",
    boxSizing: "border-box",
    fontFamily: FONT,
  };
}
const cardStyle = {
  width: "100%",
  maxWidth: 460,
  margin: "0 auto",
  background: "#ffffff",
  border: "3px solid #4b2e73",
  borderRadius: 16,
  padding: 20,
  fontFamily: FONT,
  boxSizing: "border-box",
};
const primaryBtn = {
  padding: "11px 0",
  borderRadius: 12,
  border: "2.5px solid #4b2e73",
  background: "#ffb3d0",
  color: "#4b2e73",
  fontWeight: 800,
  fontSize: 14,
  fontFamily: FONT,
  cursor: "pointer",
};
const ghostBtn = { ...primaryBtn, background: "#ffffff" };

// --- Board renderer ------------------------------------------------------

function SheepBoard({ walls, placed, sheep, highlight, onTapCell }) {
  const wallSet = useMemo(() => new Set(walls.map((w) => key(w.x, w.y))), [walls]);
  const placedSet = useMemo(() => new Set((placed || []).map((w) => key(w.x, w.y))), [placed]);
  const hiSet = highlight ? new Set(highlight) : null;

  const cells = [];
  for (let y = 0; y < SHEEP_SIZE; y++) for (let x = 0; x < SHEEP_SIZE; x++) cells.push({ x, y });

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${SHEEP_SIZE}, 1fr)`,
        gridAutoRows: "1fr",
        gap: 2,
        width: "100%",
        aspectRatio: "1 / 1",
        background: "#e2c7d8",
        border: "3px solid #4b2e73",
        borderRadius: 10,
        padding: 2,
        boxSizing: "border-box",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {cells.map(({ x, y }) => {
        const k = key(x, y);
        const isWall = wallSet.has(k);
        const isPlaced = placedSet.has(k);
        const isSheep = sheep.x === x && sheep.y === y;
        const isHi = hiSet && hiSet.has(k);
        let bg = "#fff8fb";
        if (isHi) bg = "#fde68a";
        if (isWall) bg = "#4b2e73";
        if (isPlaced) bg = "#8a63c9";
        if (isSheep) bg = "#fdecc8"; // soft gold behind the sheep drawing
        return (
          <button
            key={k}
            type="button"
            data-x={x}
            data-y={y}
            onClick={onTapCell ? () => onTapCell(x, y) : undefined}
            style={{
              position: "relative",
              border: "none",
              padding: 0,
              margin: 0,
              borderRadius: 3,
              background: bg,
              boxShadow: isPlaced ? "inset 0 0 0 2px #4b2e73" : "none",
              cursor: onTapCell ? "pointer" : "default",
              overflow: "hidden",
            }}
          >
            {isSheep && (
              <img
                src="/sheep.png"
                alt="sheep"
                draggable={false}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- How-to-play ---------------------------------------------------------
//
// All the standing instructions live here, behind the (i) button — nothing
// is written around the board. The intro pops once on a first visit
// (localStorage flag), same pattern as Defender.

function SheepRuleRow({ swatch, title, children }) {
  return (
    <div className="flex gap-3 mb-3">
      <div style={{ flex: "none", width: 30, display: "flex", justifyContent: "center", paddingTop: 2 }}>{swatch}</div>
      <div>
        <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 13 }}>{title}</p>
        <p style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 11, lineHeight: 1.45 }}>{children}</p>
      </div>
    </div>
  );
}

const swBox = (bg, extra) => (
  <div style={{ width: 20, height: 20, borderRadius: 4, border: "2px solid #4b2e73", background: bg, ...extra }} />
);

function SheepRulesModal({ onClose }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs mx-4"
        style={{ background: "#fff", border: "3px solid #4b2e73", borderRadius: 16, padding: 20, maxHeight: "85vh", overflowY: "auto", fontFamily: FONT }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ color: "#4b2e73", fontWeight: 800, fontSize: 18 }}>How to play</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: "#4b2e73", background: "none", border: "none", padding: 4, cursor: "pointer" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <SheepRuleRow title="Goal" swatch={<img src="/sheep.png" alt="" style={{ width: 24, height: 24, objectFit: "contain" }} />}>
          Fence the sheep in. Your score is the number of tiles sealed inside the pen — build the biggest closed pen you can.
        </SheepRuleRow>

        <SheepRuleRow title="Your fences" swatch={swBox("#8a63c9", { boxShadow: "inset 0 0 0 2px #4b2e73" })}>
          Tap an empty square to drop one; tap it to pick it back up. "Fences left" shows how many you still have to spend — you don't have to use them all.
        </SheepRuleRow>

        <SheepRuleRow title="Fixed fences" swatch={swBox("#4b2e73")}>
          The dark ones are already there. They can't be moved or removed — build off them.
        </SheepRuleRow>

        <SheepRuleRow title="Closed pens only" swatch={<span style={{ color: "#0d9488", fontWeight: 900, fontSize: 18 }}>✓</span>}>
          The board edge is open. If the sheep can still reach it, the pen isn't closed and you can't count it. Fences that meet only at a diagonal corner still count as joined.
        </SheepRuleRow>

        <SheepRuleRow title="Scoring" swatch={<span style={{ fontSize: 16 }}>🧱</span>}>
          No timer. Count the pen whenever it's closed, then keep adjusting and re-count to beat it. The leaderboard ranks the most tiles penned in.
        </SheepRuleRow>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-1"
          style={{ padding: "10px 0", borderRadius: 12, border: "2.5px solid #4b2e73", background: "#ffb3d0", color: "#4b2e73", fontWeight: 800, fontFamily: FONT, cursor: "pointer" }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function SheepIntro({ onClose, onShowRules }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-xs mx-4 text-center" style={{ background: "#fff", border: "3px solid #4b2e73", borderRadius: 16, padding: 24, fontFamily: FONT }}>
        <img src="/sheep.png" alt="" style={{ width: 56, height: 56, objectFit: "contain", margin: "0 auto 12px", display: "block" }} />
        <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Fence in the sheep</p>
        <p style={{ color: "#a07fc4", fontFamily: MONO, fontWeight: 700, fontSize: 12, marginBottom: 20, lineHeight: 1.5 }}>
          Drop fences to build the biggest fully-closed pen you can around the sheep. Tiles inside = your score. No timer.
        </p>
        <button type="button" onClick={onClose} className="w-full mb-2" style={{ padding: "10px 0", borderRadius: 12, border: "2.5px solid #4b2e73", background: "#ffb3d0", color: "#4b2e73", fontWeight: 800, cursor: "pointer" }}>
          Let's go
        </button>
        <button type="button" onClick={onShowRules} className="w-full" style={{ padding: "8px 0", color: "#a07fc4", fontFamily: MONO, fontSize: 11, fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>
          See full rules
        </button>
      </div>
    </div>
  );
}

// --- Play screen -------------------------------------------------------------
//
// Renders just the card; the caller supplies the page backdrop. `isDaily`
// wires up streak + local-result banking + leaderboard; the /config editor
// passes isDaily={false} and only gets "Try again" / "Back".

function SheepPlayScreen({ puzzle, dayNumber, isDaily = false, onShowResults, onExit, exitLabel = "Back" }) {
  const date = amsterdamPuzzleDateStr();
  const presetSet = useMemo(() => new Set(puzzle.walls.map((w) => key(w.x, w.y))), [puzzle]);

  const [placed, setPlaced] = useState(() => {
    if (isDaily) {
      const saved = loadSheepInProgress(date, puzzle.id);
      if (saved) return saved;
    }
    return [];
  });
  const [phase, setPhase] = useState("planning"); // planning | scoring | scored
  const [result, setResult] = useState(null); // { sealed, cells } (cells = radiate-ordered)
  const [revealCount, setRevealCount] = useState(0);
  const [streak, setStreak] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const recordedRef = useRef(false);

  // First-ever visit: pop the intro once (daily play only, not editor tests).
  useEffect(() => {
    if (!isDaily) return;
    try {
      if (!localStorage.getItem("sheep_seen_intro")) setShowIntro(true);
    } catch (e) {
      // localStorage unavailable — just skip the intro
    }
  }, [isDaily]);

  function dismissIntro() {
    setShowIntro(false);
    try {
      localStorage.setItem("sheep_seen_intro", "1");
    } catch (e) {
      // ignore write failure
    }
  }

  const wallsLeft = puzzle.budget - placed.length;

  // Live check: is the sheep fully penned in right now? Gates the submit
  // button — you can only "count the pen" once it's actually closed.
  const sealedNow = useMemo(() => {
    const all = new Set(presetSet);
    for (const w of placed) all.add(key(w.x, w.y));
    return scoreEnclosure(puzzle.sheep, all).sealed;
  }, [presetSet, placed, puzzle.sheep]);

  // reset everything when the puzzle changes (editor "test play" re-entry)
  useEffect(() => {
    setPlaced(isDaily ? loadSheepInProgress(date, puzzle.id) || [] : []);
    setPhase("planning");
    setResult(null);
    setRevealCount(0);
    setStreak(null);
    recordedRef.current = false;
  }, [puzzle]);

  useEffect(() => {
    if (isDaily && phase === "planning") saveSheepInProgress(date, puzzle.id, placed);
  }, [placed, phase, isDaily, date, puzzle.id]);

  function tapCell(x, y) {
    if (phase !== "planning") return;
    const k = key(x, y);
    if (presetSet.has(k)) return;
    if (puzzle.sheep.x === x && puzzle.sheep.y === y) return;
    setPlaced((prev) => {
      if (prev.some((w) => w.x === x && w.y === y)) return prev.filter((w) => !(w.x === x && w.y === y));
      if (prev.length >= puzzle.budget) return prev;
      return [...prev, { x, y }];
    });
  }

  function submit() {
    const all = new Set(presetSet);
    for (const w of placed) all.add(key(w.x, w.y));
    const res = scoreEnclosure(puzzle.sheep, all);
    if (!res.sealed) return; // guarded by the disabled button too
    setResult({ sealed: true, cells: radiateOrder(res.cells, puzzle.sheep) });
    setRevealCount(0);
    setPhase("scoring");
  }

  // count-up sweep
  useEffect(() => {
    if (phase !== "scoring" || !result) return;
    const total = result.cells.length;
    if (total === 0) {
      setPhase("scored");
      return;
    }
    const perTick = Math.max(1, Math.ceil(total / 45));
    const iv = setInterval(() => {
      setRevealCount((c) => {
        const n = c + perTick;
        if (n >= total) {
          clearInterval(iv);
          return total;
        }
        return n;
      });
    }, 24);
    return () => clearInterval(iv);
  }, [phase, result]);

  useEffect(() => {
    if (phase === "scoring" && result && revealCount >= result.cells.length && result.cells.length > 0) {
      setPhase("scored");
    }
  }, [phase, revealCount, result]);

  const score = result ? (result.sealed ? result.cells.length : 0) : 0;

  // bank the result + streak once, on first reaching "scored" for a daily play
  useEffect(() => {
    if (phase !== "scored" || recordedRef.current) return;
    recordedRef.current = true;
    if (!isDaily) return;
    saveSheepLastResult(date, score);
    // deliberately NOT clearing the in-progress board — so "Try for a bigger
    // pen" / a reload comes back to the fences you placed, not a blank grid
    if (score >= 1) recordSheepPlayAndGetStreak().then(setStreak);
  }, [phase]);

  const shownCount = result ? Math.min(revealCount, result.cells.length) : 0;

  return (
    <div style={cardStyle}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, color: "#a07fc4", fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> {exitLabel}
            </button>
          )}
          {dayNumber != null && (
            <span style={{ color: "#a07fc4", fontFamily: MONO, fontWeight: 700, fontSize: 12, letterSpacing: ".08em" }}>
              PUZZLE #{dayNumber}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowRules(true)}
          aria-label="How to play"
          style={{ flex: "none", width: 30, height: 30, borderRadius: "50%", border: "2.5px solid #4b2e73", background: "#fff", color: "#4b2e73", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      <h2 style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>{puzzle.name}</h2>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          margin: "0 0 10px",
          padding: "8px 12px",
          borderRadius: 10,
          border: "2px solid #4b2e73",
          background: wallsLeft === 0 ? "#ffe3e3" : "#fff5b8",
        }}
      >
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#4b2e73" }}>
          Fences left
        </span>
        <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 24, lineHeight: 1, color: wallsLeft === 0 ? "#dc2626" : "#4b2e73", fontVariantNumeric: "tabular-nums" }}>
          {wallsLeft}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: "#a07fc4" }}>of {puzzle.budget}</span>
      </div>

      <SheepBoard
        walls={puzzle.walls}
        placed={placed}
        sheep={puzzle.sheep}
        highlight={phase === "planning" ? null : result ? result.cells.slice(0, revealCount) : null}
        onTapCell={phase === "planning" ? tapCell : undefined}
      />

      {phase === "planning" && (
        <>
          <p
            style={{
              color: sealedNow ? "#0d9488" : "#dc2626",
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 700,
              margin: "10px 0 8px",
            }}
          >
            {sealedNow ? "✓ pen closed" : "pen still open — the sheep can escape the field"}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setPlaced([])}
              disabled={placed.length === 0}
              style={{ ...ghostBtn, opacity: placed.length === 0 ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "11px 14px" }}
            >
              <RotateCcw className="w-4 h-4" /> Start over
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!sealedNow}
              style={{ ...primaryBtn, flex: 1, opacity: sealedNow ? 1 : 0.45, cursor: sealedNow ? "pointer" : "not-allowed" }}
            >
              Count the pen ▸
            </button>
          </div>
        </>
      )}

      {phase !== "planning" && (
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <div style={{ fontSize: 44, fontWeight: 800, color: "#4b2e73", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {shownCount}
          </div>
          <div style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 12, marginTop: 4 }}>
            {phase === "scoring"
              ? "counting the pen…"
              : result && result.sealed
              ? "tiles penned in 🐑"
              : "the sheep got out! — nothing sealed"}
          </div>

          {phase === "scored" && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setRevealCount(0);
                  setStreak(null);
                  setPhase("planning");
                }}
                style={{ ...ghostBtn, flex: 1 }}
              >
                Adjust the pen
              </button>
              {isDaily && onShowResults ? (
                <button type="button" onClick={onShowResults} style={{ ...primaryBtn, flex: 1 }}>
                  See leaderboard
                </button>
              ) : (
                onExit && (
                  <button type="button" onClick={onExit} style={{ ...primaryBtn, flex: 1 }}>
                    {exitLabel}
                  </button>
                )
              )}
            </div>
          )}
          {phase === "scored" && streak != null && (
            <p style={{ color: "#4b2e73", fontFamily: MONO, fontSize: 12, fontWeight: 700, marginTop: 10 }}>
              🔥 {streak} day streak
            </p>
          )}
        </div>
      )}

      {showRules && <SheepRulesModal onClose={() => setShowRules(false)} />}
      {showIntro && (
        <SheepIntro
          onClose={dismissIntro}
          onShowRules={() => {
            dismissIntro();
            setShowRules(true);
          }}
        />
      )}
    </div>
  );
}

// --- Results / leaderboard (clone of DailyPuzzle's ResultsScreen) -----------

function SheepResultsScreen({ date, onBack, onReplay }) {
  const [nickname, setNickname] = useState(() => getNickname());
  const [entries, setEntries] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const myResult = getSheepLastResult(date);

  useEffect(() => {
    if (!nickname) return;
    let cancelled = false;
    (async () => {
      if (myResult) await submitSheepScore(date, myResult.score);
      const list = await fetchSheepLeaderboard(date);
      if (cancelled) return;
      if (list === null) setLoadFailed(true);
      else setEntries(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [nickname, date]);

  return (
    <div style={cardStyle}>
      {!nickname && (
        <NicknamePrompt
          onSave={(name) => {
            saveNickname(name);
            setNickname(name);
          }}
        />
      )}

      <h2 style={{ color: "#4b2e73", fontWeight: 800, fontSize: 24, textAlign: "center", marginBottom: 4 }}>
        Today's leaderboard
      </h2>
      {myResult && (
        <p style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 12, textAlign: "center", marginBottom: 18 }}>
          {myResult.score >= 1 ? `You penned in ${myResult.score} tiles` : "You didn't seal a pen today"}
        </p>
      )}

      {entries === null && !loadFailed && (
        <p style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Loading…</p>
      )}
      {loadFailed && (
        <p style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 13, textAlign: "center", padding: "20px 0" }}>
          Couldn't reach the leaderboard — your score is saved locally and your streak still counts.
        </p>
      )}
      {entries !== null && entries.length === 0 && (
        <p style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 13, textAlign: "center", padding: "20px 0" }}>
          No pens submitted yet today — check back soon.
        </p>
      )}
      {entries !== null && entries.length > 0 && (
        <div className="flex flex-col gap-2" style={{ marginBottom: 8 }}>
          {entries.map((e) => (
            <div
              key={e.rank}
              className="flex items-center gap-3"
              style={{
                padding: "9px 12px",
                borderRadius: 12,
                border: `2px solid ${e.isYou ? "#4b2e73" : "#e2c7d8"}`,
                background: e.isYou ? "#fff5b8" : "#fff8fb",
              }}
            >
              <span style={{ width: 22, textAlign: "center", color: "#4b2e73", fontWeight: 800, fontFamily: MONO, fontSize: 13 }}>
                {e.rank}
              </span>
              <span className="flex-1 truncate" style={{ color: "#4b2e73", fontWeight: 700, fontSize: 14 }}>
                {e.name}
                {e.isYou ? " (you)" : ""}
              </span>
              <span style={{ color: "#4b2e73", fontFamily: MONO, fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                {e.score} tiles
              </span>
            </div>
          ))}
        </div>
      )}

      {onReplay && (
        <button type="button" onClick={onReplay} className="w-full mt-2" style={{ ...primaryBtn, width: "100%" }}>
          Try for a bigger pen ▸
        </button>
      )}
      <button type="button" onClick={onBack} className="w-full mt-2" style={{ ...ghostBtn, width: "100%" }}>
        Back to home
      </button>
    </div>
  );
}

// --- /sheep route ----------------------------------------------------------
//
// Clone of DefenderApp: fetch published puzzles first, merge over the
// built-ins, and if the backend can't be reached, bounce to the menu rather
// than serve a wrong puzzle.

export default function SheepApp() {
  const locked = amsterdamPuzzleDateStr() < SHEEP_LAUNCH_DATE;
  const [phase, setPhase] = useState({ status: "loading", levels: null });

  useEffect(() => {
    if (locked) return;
    let cancelled = false;
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500));
    Promise.race([fetchPublishedPuzzles("sheep"), timeout])
      .then((published) => {
        if (cancelled) return;
        setPhase({ status: "ready", levels: mergeLevels(SHEEP_LEVELS, (published || []).filter(isSheepLevel)) });
      })
      .catch(() => {
        if (cancelled) return;
        setPhase({ status: "error", levels: null });
        setTimeout(() => {
          window.location.href = "/";
        }, 1600);
      });
    return () => {
      cancelled = true;
    };
  }, [locked]);

  if (locked) {
    return (
      <div style={backdropStyle(false)}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <img src="/sheep.png" alt="" style={{ width: 64, height: 64, objectFit: "contain", margin: "0 auto 12px", display: "block" }} />
          <h2 style={{ color: "#4b2e73", fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Sheep opens tomorrow</h2>
          <p style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 12, marginBottom: 18 }}>
            The first puzzle unlocks at 9am (Amsterdam) on {SHEEP_LAUNCH_DATE}.
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            style={{ ...primaryBtn, width: "100%" }}
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (phase.status !== "ready") {
    return (
      <div style={backdropStyle(false)}>
        <p style={{ color: "#a07fc4", fontFamily: MONO, fontWeight: 700, fontSize: 13 }}>
          {phase.status === "loading" ? "loading today's puzzle…" : "couldn't load today's puzzle — back to menu…"}
        </p>
      </div>
    );
  }

  return <SheepDaily levels={phase.levels} />;
}

function SheepDaily({ levels }) {
  const { level, dayNumber } = pickDailyLevel(levels, SHEEP_LAUNCH_DATE);
  const [showResults, setShowResults] = useState(sheepHasPlayedToday());
  const home = () => {
    window.location.href = "/";
  };
  return (
    <div style={backdropStyle(true)}>
      {showResults ? (
        <SheepResultsScreen
          date={amsterdamPuzzleDateStr()}
          onBack={home}
          onReplay={() => setShowResults(false)}
        />
      ) : (
        <SheepPlayScreen
          puzzle={level}
          dayNumber={dayNumber}
          isDaily
          onShowResults={() => setShowResults(true)}
          onExit={home}
          exitLabel="Home"
        />
      )}
    </div>
  );
}

// ===========================================================================
// /config — Sheep puzzle lab. Self-contained list / editor / test-play, the
// same shape ConfigApp uses for Defender.
// ===========================================================================

export function SheepConfigApp({ onBackToGames }) {
  const [screen, setScreen] = useState("list");
  const [editorInitial, setEditorInitial] = useState(null);
  const [activeLevel, setActiveLevel] = useState(null);
  const [fromEdit, setFromEdit] = useState(false);

  if (screen === "play" && activeLevel) {
    return (
      <SheepPlayScreen
        puzzle={activeLevel}
        isDaily={false}
        onExit={() => setScreen(fromEdit ? "edit" : "list")}
        exitLabel={fromEdit ? "Back to editor" : "Back to list"}
      />
    );
  }

  if (screen === "edit" && editorInitial) {
    return (
      <SheepEditorScreen
        initialLevel={editorInitial}
        onBack={() => setScreen("list")}
        onTest={(draft) => {
          setEditorInitial(draft);
          setActiveLevel(draft);
          setFromEdit(true);
          setScreen("play");
        }}
      />
    );
  }

  return (
    <SheepPuzzleListScreen
      onBackToGames={onBackToGames}
      onEdit={(lvl) => {
        setEditorInitial(clone(lvl));
        setFromEdit(false);
        setScreen("edit");
      }}
      onNew={(dateStr) => {
        setEditorInitial({ ...blankSheepLevel(), date: dateStr });
        setFromEdit(false);
        setScreen("edit");
      }}
      onPlay={(lvl) => {
        setActiveLevel(lvl);
        setFromEdit(false);
        setScreen("play");
      }}
    />
  );
}

function SheepPuzzleListScreen({ onEdit, onNew, onPlay, onBackToGames }) {
  const today = amsterdamPuzzleDateStr();
  const [published, setPublished] = useState([]);
  const [pubError, setPubError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPubError(false);
    fetchPublishedPuzzles("sheep")
      .then((list) => {
        if (!cancelled) setPublished((list || []).filter(isSheepLevel));
      })
      .catch(() => {
        if (!cancelled) setPubError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const dated = SHEEP_LEVELS.filter((l) => l.date).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const undated = SHEEP_LEVELS.filter((l) => !l.date);
  const builtInDates = new Set(dated.map((l) => l.date));
  const liveDates = new Set(published.map((p) => p.date));
  const remoteOnly = published
    .filter((p) => !builtInDates.has(p.date))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const allDated = [...dated.map((l) => l.date), ...published.map((p) => p.date)];
  const maxDated = allDated.length ? allDated.reduce((a, b) => (a > b ? a : b)) : null;
  let nextNeeded = maxDated ? shiftDateStr(maxDated, 1) : today;
  if (nextNeeded < today) nextNeeded = today;

  async function handleUnpublish(lvl) {
    if (!window.confirm(`Unpublish the live puzzle for ${lvl.date}? Players fall back to the built-in rotation that day.`)) return;
    try {
      await unpublishPuzzle(lvl.date, getConfigPassword(), "sheep");
      setReloadKey((k) => k + 1);
    } catch (e) {
      alert(`Unpublish failed: ${e.message || e}`);
    }
  }

  return (
    <div style={{ ...cardStyle, maxWidth: 480 }}>
      {onBackToGames && (
        <button
          type="button"
          onClick={onBackToGames}
          className="flex items-center gap-1 mb-3"
          style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 11, fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All games
        </button>
      )}
      <h2 style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Sheep puzzle lab</h2>
      <p style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 12, marginBottom: 4 }}>
        {SHEEP_LEVELS.length} built-in · {published.length} published live
      </p>
      {pubError && (
        <p style={{ color: "#dc2626", fontFamily: MONO, fontSize: 11, fontWeight: 700, marginBottom: 12 }}>
          Couldn't reach the backend — LIVE status may be stale.
        </p>
      )}
      {!pubError && <div style={{ marginBottom: 12 }} />}

      <div className="mb-5 p-3 rounded-lg" style={{ border: "2px solid #4b2e73", background: "#fff5b8" }}>
        <p style={{ color: "#4b2e73", fontFamily: MONO, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>
          Next puzzle needed
        </p>
        <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 18 }}>{nextNeeded}</p>
        <button
          type="button"
          onClick={() => onNew(nextNeeded)}
          className="mt-2 w-full py-2 rounded-lg text-sm flex items-center justify-center gap-1"
          style={{ background: "#ffb3d0", border: "2px solid #4b2e73", color: "#4b2e73", fontWeight: 800, cursor: "pointer" }}
        >
          <Plus className="w-4 h-4" /> New puzzle for {nextNeeded}
        </button>
      </div>

      {remoteOnly.length > 0 && (
        <>
          <p style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
            Live puzzles not in this build
          </p>
          <div className="space-y-2 mb-5">
            {remoteOnly.map((lvl) => (
              <SheepPuzzleRow key={lvl.id || lvl.date} level={lvl} live highlight={lvl.date === today} onEdit={onEdit} onPlay={onPlay} onUnpublish={handleUnpublish} />
            ))}
          </div>
        </>
      )}

      {dated.length > 0 && (
        <>
          <p style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Dated puzzles</p>
          <div className="space-y-2 mb-5">
            {dated.map((lvl) => (
              <SheepPuzzleRow
                key={lvl.id}
                level={lvl}
                highlight={lvl.date === today}
                live={liveDates.has(lvl.date)}
                onEdit={onEdit}
                onPlay={onPlay}
                onUnpublish={liveDates.has(lvl.date) ? handleUnpublish : null}
              />
            ))}
          </div>
        </>
      )}

      <p style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
        Undated (rotation) puzzles
      </p>
      <div className="space-y-2">
        {undated.map((lvl) => (
          <SheepPuzzleRow key={lvl.id} level={lvl} onEdit={onEdit} onPlay={onPlay} />
        ))}
      </div>
    </div>
  );
}

function SheepPuzzleRow({ level, highlight, live, onEdit, onPlay, onUnpublish }) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md px-3 py-2"
      style={{ border: highlight ? "2px solid #4b2e73" : "1.5px solid #e2c7d8", background: highlight ? "#fff5b8" : "#fff8fb" }}
    >
      <div className="min-w-0">
        <p className="text-sm truncate" style={{ color: "#4b2e73", fontWeight: 800 }}>
          {level.name}
          {level.date && (
            <span className="ml-2" style={{ color: "#0d9488", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
              {level.date}
            </span>
          )}
          {live && (
            <span className="ml-2 px-1.5 rounded" style={{ background: "#0d9488", color: "#fff", fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: ".06em" }}>
              LIVE
            </span>
          )}
        </p>
        <p className="text-xs truncate" style={{ color: "#a07fc4", fontFamily: MONO }}>
          budget {level.budget} · {level.walls.length} preset
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={() => onPlay(level)} className="px-2 py-1 rounded text-xs" style={{ background: "#8ad7d2", border: "1.5px solid #4b2e73", color: "#4b2e73", fontWeight: 800, cursor: "pointer" }}>
          Play
        </button>
        {onEdit && (
          <button type="button" onClick={() => onEdit(level)} className="p-1.5 rounded" style={{ border: "1.5px solid #4b2e73", color: "#4b2e73", cursor: "pointer" }}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {onUnpublish && (
          <button type="button" onClick={() => onUnpublish(level)} className="px-2 py-1 rounded text-xs" style={{ background: "#ffd9d9", border: "1.5px solid #4b2e73", color: "#4b2e73", fontWeight: 800, cursor: "pointer" }}>
            Unpublish
          </button>
        )}
      </div>
    </div>
  );
}

function SheepEditorScreen({ initialLevel, onBack, onTest }) {
  const [draft, setDraft] = useState(() => {
    const lvl = clone(initialLevel);
    if (!lvl.walls) lvl.walls = [];
    if (!lvl.sheep) lvl.sheep = { x: 6, y: 6 };
    if (!lvl.budget) lvl.budget = 12;
    return lvl;
  });
  const [tool, setTool] = useState("wall"); // wall | sheep | eraser
  const [copyStatus, setCopyStatus] = useState("idle");
  const [publishStatus, setPublishStatus] = useState("idle");
  const [publishError, setPublishError] = useState("");

  function tapCell(x, y) {
    setDraft((prev) => {
      const next = clone(prev);
      const atSheep = next.sheep.x === x && next.sheep.y === y;
      if (tool === "sheep") {
        next.sheep = { x, y };
        next.walls = next.walls.filter((w) => !(w.x === x && w.y === y));
        return next;
      }
      if (tool === "eraser") {
        next.walls = next.walls.filter((w) => !(w.x === x && w.y === y));
        return next;
      }
      // wall
      if (atSheep) return prev;
      if (next.walls.some((w) => w.x === x && w.y === y)) {
        next.walls = next.walls.filter((w) => !(w.x === x && w.y === y));
      } else {
        next.walls.push({ x, y });
      }
      return next;
    });
  }

  async function handleCopyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
      setCopyStatus("copied");
    } catch (e) {
      setCopyStatus("error");
    }
    setTimeout(() => setCopyStatus("idle"), 2000);
  }

  async function handlePublish() {
    if (!draft.date) return;
    if (!window.confirm(`Publish "${draft.name || "Untitled"}" as the live Sheep puzzle for ${draft.date}? Publishing again overwrites it.`)) return;
    setPublishStatus("publishing");
    setPublishError("");
    try {
      await publishPuzzle(draft, getConfigPassword(), "sheep");
      setPublishStatus("done");
      setTimeout(() => setPublishStatus("idle"), 2500);
    } catch (e) {
      setPublishStatus("error");
      setPublishError(e.message || "publish failed");
      setTimeout(() => setPublishStatus("idle"), 4000);
    }
  }

  const toolBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setTool(id)}
      style={{
        padding: "7px 12px",
        borderRadius: 10,
        border: tool === id ? "2.5px solid #4b2e73" : "2px solid #e2c7d8",
        background: tool === id ? "#fff5b8" : "#ffffff",
        color: "#4b2e73",
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  const fieldStyle = {
    border: "2px solid #e2c7d8",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 13,
    color: "#4b2e73",
    fontWeight: 700,
    background: "#fff8fb",
    fontFamily: FONT,
  };

  return (
    <div style={{ ...cardStyle, maxWidth: 480 }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <input
          value={draft.name}
          onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
          className="bg-transparent focus:outline-none flex-1"
          style={{ fontSize: 22, fontWeight: 800, color: "#4b2e73", borderBottom: "2px solid #e2c7d8", paddingBottom: 2, fontFamily: FONT }}
          placeholder="Puzzle name"
        />
        <button type="button" onClick={onBack} className="shrink-0 flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 10, border: "2.5px solid #4b2e73", background: "#fff", color: "#4b2e73", cursor: "pointer" }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#a07fc4", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
          Date
          <input type="date" value={draft.date || ""} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} style={fieldStyle} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#a07fc4", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
          Wall budget
          <input
            type="number"
            min={1}
            max={64}
            value={draft.budget}
            onChange={(e) => setDraft((p) => ({ ...p, budget: Math.max(1, Math.min(64, Number(e.target.value) || 1)) }))}
            style={{ ...fieldStyle, width: 70 }}
          />
        </label>
      </div>

      <div className="flex gap-2 mb-2">
        {toolBtn("wall", "🧱 Wall")}
        {toolBtn("sheep", "🐑 Sheep")}
        {toolBtn("eraser", "Eraser")}
      </div>
      <p className="mb-2" style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 11 }}>
        {draft.walls.length} preset walls placed.
      </p>

      <SheepBoard walls={draft.walls} placed={[]} sheep={draft.sheep} onTapCell={tapCell} />

      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => onTest(draft)} className="flex-1" style={primaryBtn}>
          Test play
        </button>
        <button type="button" onClick={handleCopyJson} style={{ ...ghostBtn, padding: "11px 16px" }}>
          {copyStatus === "copied" ? "Copied!" : copyStatus === "error" ? "Copy failed" : "Copy JSON"}
        </button>
      </div>

      <button
        type="button"
        onClick={handlePublish}
        disabled={!draft.date || publishStatus === "publishing"}
        className="w-full mt-2"
        style={{
          ...primaryBtn,
          width: "100%",
          background: !draft.date ? "#f1e6ef" : publishStatus === "error" ? "#ffd9d9" : "#8ad7d2",
          opacity: !draft.date ? 0.6 : 1,
          cursor: !draft.date ? "not-allowed" : "pointer",
        }}
      >
        {publishStatus === "publishing"
          ? "Publishing…"
          : publishStatus === "done"
          ? "Published! ✓"
          : publishStatus === "error"
          ? "Publish failed"
          : draft.date
          ? `Publish live for ${draft.date}`
          : "Publish live (set a date first)"}
      </button>
      {publishStatus === "error" && publishError && (
        <p className="mt-1" style={{ color: "#dc2626", fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
          {publishError}
        </p>
      )}
      <p className="mt-3" style={{ color: "#a07fc4", fontFamily: MONO, fontSize: 11 }}>
        <strong>Publish live</strong> pushes straight to the backend for its date — no code deploy. Test-play first to check it's sealable within budget.
      </p>
    </div>
  );
}
