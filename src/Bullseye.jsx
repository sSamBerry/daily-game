import { useState, useMemo, useRef } from "react";
import { ArrowLeft, Info, Target as TargetIcon, Undo2 } from "lucide-react";
import { amsterdamPuzzleDateStr, shiftDateStr, dayIndexSince } from "./DailyPuzzle.jsx";

// ---------------------------------------------------------------------------
// Bullseye — a Countdown "numbers round" spin. Lives at /bullseye, linked
// from the "game 03" card on the ecosystem hub (/home). Same daily-rollover
// convention as the rest of the site (9am Amsterdam, see amsterdamPuzzleDateStr
// in DailyPuzzle.jsx) but its own streak, reached via its own localStorage key
// so it doesn't interfere with Defender's or Murdle's.
//
// Rules: 6 tiles (at least one of 25/50/75/100, at least one of 1-9) and a
// 3-digit target. Combine tiles two at a time with + - x / — every result
// must land on a positive whole number — until one tile reads the target.
// ---------------------------------------------------------------------------

export const BULLSEYE_LAUNCH_DATE = "2026-08-22";
const BULLSEYE_STREAK_KEY = "bullseye_streak";
const BULLSEYE_INTRO_KEY = "bullseye_seen_intro";
const LARGE_TILES = [25, 50, 75, 100];

// Deterministic PRNG (mulberry32) seeded off the day index, so every player
// gets the exact same six tiles and target on a given calendar day without
// needing a server.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Exhaustive Countdown-style solver: finds every value reachable from some
// subset of the tiles using + - x / with positive whole-number results at
// every step. Branches on unordered pairs (six tiles keeps this well under
// a second) so the daily puzzle can be generated and verified solvable
// client-side, with no hardcoded puzzle bank.
function solveNumbers(numbers) {
  const found = new Map();
  numbers.forEach((v) => {
    if (!found.has(v)) found.set(v, String(v));
  });
  function recurse(list) {
    if (list.length < 2) return;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const rest = list.filter((_, k) => k !== i && k !== j);
        const candidates = [[a.value + b.value, `(${a.expr} + ${b.expr})`]];
        if (a.value !== b.value) {
          const hi = a.value > b.value ? a : b;
          const lo = a.value > b.value ? b : a;
          candidates.push([hi.value - lo.value, `(${hi.expr} - ${lo.expr})`]);
        }
        // *1 and /1 are pruned here purely to shrink the search — they're
        // legal moves in the actual game, just redundant with "don't touch
        // that tile" for reachability purposes.
        if (a.value !== 1 && b.value !== 1) {
          candidates.push([a.value * b.value, `(${a.expr} * ${b.expr})`]);
        }
        if (b.value > 1 && a.value % b.value === 0) {
          candidates.push([a.value / b.value, `(${a.expr} / ${b.expr})`]);
        }
        if (a.value > 1 && b.value % a.value === 0) {
          candidates.push([b.value / a.value, `(${b.expr} / ${a.expr})`]);
        }
        for (const [value, expr] of candidates) {
          if (value <= 0) continue;
          if (!found.has(value)) found.set(value, expr);
          recurse([...rest, { value, expr }]);
        }
      }
    }
  }
  recurse(numbers.map((v) => ({ value: v, expr: String(v) })));
  return found;
}

// Generates a solvable round from a seed, retrying with a bumped seed on the
// vanishingly rare draw with no reachable target in [101, 999] (every seed
// tried in testing landed 400+ reachable targets, so this basically never
// loops more than once).
function generateRound(seed) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const rng = mulberry32(seed + attempt * 104729);
    const largeCount = 1 + Math.floor(rng() * 4);
    const large = shuffled(LARGE_TILES, rng).slice(0, largeCount);
    const smallFull = [];
    for (let n = 1; n <= 9; n++) smallFull.push(n, n);
    const small = shuffled(smallFull, rng).slice(0, 6 - largeCount);
    const numbers = shuffled([...large, ...small], rng);
    const reachable = solveNumbers(numbers);
    const inRange = [...reachable.entries()].filter(([v]) => v >= 101 && v <= 999);
    if (inRange.length === 0) continue;
    const desired = 101 + Math.floor(rng() * 899);
    inRange.sort((x, y) => Math.abs(x[0] - desired) - Math.abs(y[0] - desired));
    const [target, solutionExpr] = inRange[0];
    return { numbers, target, solutionExpr };
  }
  return { numbers: [100, 75, 50, 25, 6, 3], target: 259, solutionExpr: "(((((100 + 75) + 50) + 25) + 6) + 3)" };
}

// The Home card only needs today's round number for its "puzzle #" label —
// not the actual tiles — so it can skip the ~100ms solver entirely.
export function getBullseyeRoundNumber(launchDateStr) {
  return dayIndexSince(launchDateStr) + 1;
}

export function pickDailyRound(launchDateStr) {
  const dayIndex = dayIndexSince(launchDateStr);
  const round = generateRound(dayIndex);
  return { round, roundNumber: dayIndex + 1 };
}

export function recordBullseyeWin() {
  const today = amsterdamPuzzleDateStr();
  let streak = 1;
  try {
    const raw = localStorage.getItem(BULLSEYE_STREAK_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.lastDate === today) return data.streak;
      const yesterday = shiftDateStr(today, -1);
      streak = data.lastDate === yesterday ? data.streak + 1 : 1;
    }
  } catch (e) {
    // no streak recorded yet, or localStorage unavailable
  }
  try {
    localStorage.setItem(BULLSEYE_STREAK_KEY, JSON.stringify({ lastDate: today, streak }));
  } catch (e) {
    // ignore write failure, still return the computed streak
  }
  return streak;
}

export function getBullseyeStreak() {
  const today = amsterdamPuzzleDateStr();
  try {
    const raw = localStorage.getItem(BULLSEYE_STREAK_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    if (data.lastDate === today) return data.streak;
    const yesterday = shiftDateStr(today, -1);
    if (data.lastDate === yesterday) return data.streak;
    return 0;
  } catch (e) {
    return 0;
  }
}

export function hasWonBullseyeToday() {
  try {
    const raw = localStorage.getItem(BULLSEYE_STREAK_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data.lastDate === amsterdamPuzzleDateStr();
  } catch (e) {
    return false;
  }
}

const OPS = [
  { id: "+", symbol: "+" },
  { id: "-", symbol: "−" },
  { id: "*", symbol: "×" },
  { id: "/", symbol: "÷" },
];

function RulesModal({ onClose }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          border: "3px solid #4b2e73",
          borderRadius: 16,
          padding: 24,
          fontFamily: "'Baloo 2', system-ui, sans-serif",
          animation: "bullseyePopIn 0.2s ease-out",
        }}
      >
        <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 10, textAlign: "center" }}>How to play</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {[
            "You get 6 tiles — some big (25/50/75/100), some small (1–9) — and a 3-digit target.",
            "Tap a tile, tap an operator, then tap a second tile to combine them.",
            "Every result has to be a positive whole number — no negatives, no fractions.",
            "You don't have to use every tile. Land exactly on the target to win.",
            "Undo a step or start over any time — no penalty either way.",
          ].map((line, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ flex: "none", width: 5, height: 5, borderRadius: "50%", background: "#4b2e73", marginTop: 6 }} />
              <p style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontWeight: 500, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>{line}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full"
          style={{ padding: "10px 0", borderRadius: 12, border: "2.5px solid #4b2e73", background: "#8ad7d2", color: "#4b2e73", fontWeight: 800 }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function NumberTile({ value, selected, onClick }) {
  const isLarge = value >= 10;
  let bg = isLarge ? "#c9b6f5" : "#fff5b8";
  if (selected) bg = "#ffb3d0";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 66,
        height: 58,
        flex: "none",
        borderRadius: 12,
        border: `3px solid #4b2e73`,
        background: bg,
        color: "#4b2e73",
        fontFamily: "'Baloo 2', system-ui, sans-serif",
        fontWeight: 800,
        fontSize: 21,
        transform: selected ? "translateY(-2px)" : "none",
        transition: "transform 0.1s ease",
      }}
    >
      {value}
    </button>
  );
}

export default function BullseyeApp() {
  const { round, roundNumber } = useMemo(() => pickDailyRound(BULLSEYE_LAUNCH_DATE), []);
  const nextIdRef = useRef(round.numbers.length);

  const [solvedToday, setSolvedToday] = useState(() => hasWonBullseyeToday());
  const [streak, setStreak] = useState(() => getBullseyeStreak());
  const [showRules, setShowRules] = useState(() => {
    try {
      return !localStorage.getItem(BULLSEYE_INTRO_KEY);
    } catch (e) {
      return false;
    }
  });

  const initialPool = () => round.numbers.map((value, i) => ({ id: i, value }));
  const [pool, setPool] = useState(initialPool);
  const [history, setHistory] = useState([]);
  const [steps, setSteps] = useState([]);
  const [selId, setSelId] = useState(null);
  const [op, setOp] = useState(null);
  const [error, setError] = useState(null);
  const [won, setWon] = useState(false);

  const closeRules = () => {
    setShowRules(false);
    try {
      localStorage.setItem(BULLSEYE_INTRO_KEY, "1");
    } catch (e) {
      // ignore
    }
  };

  const flashError = (msg) => {
    setError(msg);
    setSelId(null);
    setOp(null);
    window.clearTimeout(flashError._t);
    flashError._t = window.setTimeout(() => setError(null), 1600);
  };

  const combine = (aTile, bTile) => {
    let value, expr, label;
    if (op === "+") {
      value = aTile.value + bTile.value;
      label = `${aTile.value} + ${bTile.value} = ${value}`;
    } else if (op === "-") {
      if (aTile.value === bTile.value) return flashError("That cancels out to zero");
      const hi = aTile.value > bTile.value ? aTile : bTile;
      const lo = aTile.value > bTile.value ? bTile : aTile;
      value = hi.value - lo.value;
      label = `${hi.value} − ${lo.value} = ${value}`;
    } else if (op === "*") {
      value = aTile.value * bTile.value;
      label = `${aTile.value} × ${bTile.value} = ${value}`;
    } else if (op === "/") {
      if (bTile.value !== 0 && aTile.value % bTile.value === 0) {
        value = aTile.value / bTile.value;
        label = `${aTile.value} ÷ ${bTile.value} = ${value}`;
      } else if (aTile.value !== 0 && bTile.value % aTile.value === 0) {
        value = bTile.value / aTile.value;
        label = `${bTile.value} ÷ ${aTile.value} = ${value}`;
      } else {
        return flashError("Doesn't divide evenly");
      }
    }

    const newTile = { id: nextIdRef.current++, value };
    const newPool = pool.filter((t) => t.id !== aTile.id && t.id !== bTile.id).concat(newTile);
    setHistory((h) => [...h, pool]);
    setSteps((s) => [...s, label]);
    setPool(newPool);
    setSelId(null);
    setOp(null);
    setError(null);

    if (value === round.target) {
      const newStreak = recordBullseyeWin();
      setStreak(newStreak);
      setSolvedToday(true);
      setWon(true);
    }
  };

  const tapTile = (tile) => {
    if (selId === null) {
      setSelId(tile.id);
      return;
    }
    if (tile.id === selId) {
      setSelId(null);
      setOp(null);
      return;
    }
    if (op === null) {
      setSelId(tile.id);
      return;
    }
    const aTile = pool.find((t) => t.id === selId);
    combine(aTile, tile);
  };

  const tapOp = (opId) => {
    if (selId === null) return;
    setOp(opId);
  };

  const undo = () => {
    if (history.length === 0) return;
    setPool(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setSteps((s) => s.slice(0, -1));
    setSelId(null);
    setOp(null);
    setError(null);
  };

  const startOver = () => {
    setPool(initialPool());
    setHistory([]);
    setSteps([]);
    setSelId(null);
    setOp(null);
    setError(null);
  };

  return (
    <div
      style={{
        height: "100dvh",
        overflowY: "auto",
        width: "100%",
        backgroundColor: "#ffe9f3",
        backgroundImage: "linear-gradient(#ffffff 2px, transparent 2px), linear-gradient(90deg, #ffffff 2px, transparent 2px)",
        backgroundSize: "36px 36px",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        fontFamily: "'Baloo 2', system-ui, sans-serif",
        boxSizing: "border-box",
        padding: "10px 12px",
      }}
    >
      <style>{`
        @keyframes bullseyePopIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
      <div style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            aria-label="Back to menu"
            style={{ width: 30, height: 30, borderRadius: 9, border: "2.5px solid #4b2e73", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: "#4b2e73" }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11, letterSpacing: ".08em", color: "#a07fc4" }}>
              PUZZLE #{roundNumber}
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                height: 22,
                padding: "0 8px",
                fontSize: 11.5,
                fontWeight: 800,
                color: "#4b2e73",
                borderRadius: 999,
                border: "2px solid #4b2e73",
                background: solvedToday ? "#fff5b8" : "#ffffff",
              }}
              title={solvedToday ? "Today's puzzle solved" : "Current streak"}
            >
              <span style={{ fontSize: 11, lineHeight: 1 }}>🔥</span>
              {streak}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRules(true)}
            aria-label="How to play"
            style={{ width: 30, height: 30, borderRadius: 9, border: "2.5px solid #4b2e73", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Info className="w-4 h-4" style={{ color: "#4b2e73" }} />
          </button>
        </div>

        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: "#4b2e73", letterSpacing: "-.01em", margin: 0, lineHeight: 1.15 }}>Bullseye</h1>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: "#a07fc4", margin: 0 }}>hit today's target exactly</p>
        </div>

        {solvedToday && !won ? (
          <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 22, textAlign: "center" }}>
            <TargetIcon className="w-8 h-8" style={{ color: "#4b2e73", margin: "0 auto 6px" }} strokeWidth={2.5} />
            <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Bullseye!</p>
            <p style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
              Today's target was {round.target}.
            </p>
            <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11 }}>Come back tomorrow for the next round.</p>
          </div>
        ) : won ? (
          <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 22, textAlign: "center" }}>
            <TargetIcon className="w-8 h-8" style={{ color: "#4b2e73", margin: "0 auto 6px" }} strokeWidth={2.5} />
            <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Bullseye!</p>
            <p style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              You hit {round.target} in {steps.length} step{steps.length === 1 ? "" : "s"}.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
              {steps.map((s, i) => (
                <p key={i} style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontWeight: 600, fontSize: 12, margin: 0 }}>
                  {s}
                </p>
              ))}
            </div>
            <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11, margin: 0 }}>Come back tomorrow for the next round.</p>
          </div>
        ) : (
          <>
            <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 10.5, letterSpacing: ".08em", color: "#a07fc4", textTransform: "uppercase" }}>
                Target
              </span>
              <div style={{ fontSize: 40, fontWeight: 800, color: "#4b2e73", letterSpacing: "-.01em", lineHeight: 1.1 }}>{round.target}</div>
            </div>

            <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 14, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {pool.map((t) => (
                  <NumberTile key={t.id} value={t.value} selected={t.id === selId} onClick={() => tapTile(t)} />
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {OPS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => tapOp(o.id)}
                    disabled={selId === null}
                    style={{
                      width: 48,
                      height: 44,
                      borderRadius: 12,
                      border: "3px solid #4b2e73",
                      background: op === o.id ? "#ffb3d0" : "#ffffff",
                      color: "#4b2e73",
                      fontWeight: 800,
                      fontSize: 20,
                      opacity: selId === null ? 0.45 : 1,
                    }}
                  >
                    {o.symbol}
                  </button>
                ))}
              </div>

              {error && (
                <p style={{ color: "#d9738a", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11.5, margin: 0, textAlign: "center" }}>{error}</p>
              )}

              {pool.length === 1 && pool[0].value !== round.target && !error && (
                <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11.5, margin: 0, textAlign: "center" }}>
                  {pool[0].value} is {Math.abs(pool[0].value - round.target)} away from {round.target}
                </p>
              )}

              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <button
                  type="button"
                  onClick={undo}
                  disabled={history.length === 0}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: "8px 0",
                    borderRadius: 12,
                    border: "2.5px solid #4b2e73",
                    background: "#ffffff",
                    color: "#4b2e73",
                    fontWeight: 700,
                    fontSize: 12.5,
                    opacity: history.length === 0 ? 0.45 : 1,
                  }}
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  disabled={history.length === 0}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 12,
                    border: "2.5px solid #4b2e73",
                    background: "#ffffff",
                    color: "#4b2e73",
                    fontWeight: 700,
                    fontSize: 12.5,
                    opacity: history.length === 0 ? 0.45 : 1,
                  }}
                >
                  Start over
                </button>
              </div>
            </div>

            {steps.length > 0 && (
              <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 14, overflow: "hidden" }}>
                <div style={{ padding: "4px 10px", borderBottom: "2.5px solid #4b2e73", background: "#f5eefc" }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 10.5, letterSpacing: ".06em", color: "#4b2e73", textTransform: "uppercase" }}>
                    Working
                  </span>
                </div>
                <div style={{ padding: "7px 11px", display: "flex", flexDirection: "column", gap: 4 }}>
                  {steps.map((s, i) => (
                    <p key={i} style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontSize: 12, margin: 0 }}>
                      {s}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showRules && <RulesModal onClose={closeRules} />}
    </div>
  );
}
