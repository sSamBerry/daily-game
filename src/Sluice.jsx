import { useState } from "react";
import { ArrowLeft, Info, ArrowUp, ArrowDown, Check } from "lucide-react";
import { amsterdamPuzzleDateStr, shiftDateStr, dayIndexSince } from "./DailyPuzzle.jsx";

// ---------------------------------------------------------------------------
// Sluice — a daily dam-tuning deduction puzzle. Config-only for now, same
// convention as Xenoglyph: no public route, reachable
// only from /config's puzzle lab for testing. Own streak key, own 9am-
// Amsterdam daily rollover.
//
// Deliberately a different shape from Defender (no board, no placing
// pieces, no simulated resolution): you're tuning a handful of sluice
// gates, each hiding a secret setting from 0 (shut) to 9 (wide open).
// Every release tells you, gate by gate, whether that gate needs to open
// further, close back down, or is already holding exactly right — at
// which point it locks and drops out of the puzzle. It's Mastermind wearing
// a dam operator's coat: no board, just a control panel and a growing
// history of releases to reason from.
// ---------------------------------------------------------------------------

export const SLUICE_LAUNCH_DATE = "2026-08-29";
const STREAK_KEY = "sluice_streak";
const INTRO_KEY = "sluice_seen_intro";
const MAX_LEVEL = 9;

export const SLUICE_LEVELS = [
  {
    id: "warm-up-trickle",
    name: "Warm-up trickle",
    hint: "Three gates. Watch which way each arrow points and nudge it that way.",
    gates: ["Mill Gate", "East Channel", "Spillway"],
    secret: [3, 7, 1],
  },
  {
    id: "standard-flow",
    name: "Standard flow",
    hint: "Four gates now — the same trick, just more of them to hold in your head at once.",
    gates: ["North Sluice", "Old Mill", "Flood Gate", "Reservoir Feed"],
    secret: [6, 2, 9, 4],
  },
  {
    id: "the-big-dam",
    name: "The big dam",
    hint: "Five gates. A locked gate is one less thing to juggle — get the easy reads out of the way first.",
    gates: ["North Sluice", "South Sluice", "Old Mill", "Flood Gate", "Reservoir Feed"],
    secret: [1, 8, 3, 6, 5],
  },
];

export function pickDailyLevel(levels, launchDateStr) {
  const dayIndex = dayIndexSince(launchDateStr);
  const dayNumber = dayIndex + 1;
  const dated = levels.find((l) => l.date === amsterdamPuzzleDateStr());
  if (dated) return { level: dated, dayNumber };
  const level = levels[dayIndex % levels.length];
  return { level, dayNumber };
}

export function recordSluiceWin() {
  const today = amsterdamPuzzleDateStr();
  let streak = 1;
  try {
    const raw = localStorage.getItem(STREAK_KEY);
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
    localStorage.setItem(STREAK_KEY, JSON.stringify({ lastDate: today, streak }));
  } catch (e) {
    // ignore write failure, still return the computed streak
  }
  return streak;
}

export function getSluiceStreak() {
  const today = amsterdamPuzzleDateStr();
  try {
    const raw = localStorage.getItem(STREAK_KEY);
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

export function hasWonSluiceToday() {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data.lastDate === amsterdamPuzzleDateStr();
  } catch (e) {
    return false;
  }
}

function feedbackFor(guess, secret) {
  if (guess === secret) return "correct";
  return guess < secret ? "low" : "high";
}

function FeedbackIcon({ status, size = 14 }) {
  if (status === "correct") return <Check style={{ width: size, height: size }} strokeWidth={3} />;
  if (status === "low") return <ArrowUp style={{ width: size, height: size }} strokeWidth={3} />;
  return <ArrowDown style={{ width: size, height: size }} strokeWidth={3} />;
}

const STATUS_COLOR = { correct: "#3fae7d", low: "#0ea5e9", high: "#dc2626" };
const STATUS_BG = { correct: "#e3f7ee", low: "#e6f6fd", high: "#fde7ea" };
const STATUS_LINE = {
  correct: "holding steady",
  low: "still dry — open it more",
  high: "flood risk — ease it back",
};

// Ten tappable segments stacked vertically, 9 (wide open) at top down to 0
// (shut) at bottom — tapping a segment jumps straight to that level, like
// reading a gauge rather than clicking a stepper nine times. Locked gates
// render solid with a checkmark instead and stop accepting taps.
function GateDial({ value, onSet, locked, lastStatus }) {
  const color = locked ? STATUS_COLOR.correct : "#4b2e73";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column-reverse",
          gap: 2,
          padding: 4,
          borderRadius: 10,
          border: `2.5px solid ${color}`,
          background: "#ffffff",
        }}
      >
        {Array.from({ length: MAX_LEVEL + 1 }).map((_, level) => {
          const filled = level <= value;
          return (
            <button
              key={level}
              type="button"
              disabled={locked}
              onClick={() => onSet(level)}
              aria-label={`Set to ${level}`}
              style={{
                width: 30,
                height: 9,
                padding: 0,
                borderRadius: 2,
                border: "none",
                cursor: locked ? "default" : "pointer",
                background: filled ? (locked ? STATUS_COLOR.correct : "#6ec3e8") : "#f1e9f7",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {locked && <Check style={{ width: 13, height: 13, color: STATUS_COLOR.correct }} strokeWidth={3} />}
        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 15, color }}>{value}</span>
      </div>
    </div>
  );
}

function HistoryRow({ attempt, gates }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 16, flex: "none", fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#a07fc4", fontWeight: 700 }}>
        {attempt.n}
      </span>
      <div style={{ display: "flex", gap: 6, flex: 1 }}>
        {attempt.results.map((r, i) => (
          <div
            key={i}
            title={gates[i]}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              height: 26,
              borderRadius: 7,
              background: STATUS_BG[r.status],
              color: STATUS_COLOR[r.status],
              fontFamily: "'DM Mono', monospace",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            {r.value}
            <FeedbackIcon status={r.status} size={11} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RulesModal({ onClose }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 340, margin: "0 16px", background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 24, fontFamily: "'Baloo 2', system-ui, sans-serif" }}
      >
        <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 10, textAlign: "center" }}>How to play</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {[
            "Every gate has a secret setting from 0 (shut) to 9 (wide open). Tap a rung on its gauge to dial it in.",
            "Hit Release to see how each gate reads: an up arrow means it's still too dry, a down arrow means it's flooding — ease it back.",
            "A gate that reads correct locks in green and drops out of the puzzle — one less thing to juggle.",
            "Keep releasing and adjusting until every gate locks. No limit on releases.",
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
          style={{ width: "100%", padding: "10px 0", borderRadius: 12, border: "2.5px solid #4b2e73", background: "#c9b6f5", color: "#4b2e73", fontWeight: 800 }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// `level` + `onBack` are only passed from the /config puzzle lab, to play a
// specific level on demand instead of whatever today's date picks. Same
// test-mode convention as the other games: never touches the real
// streak/solved-today localStorage.
export default function SluiceApp({ level: levelOverride, onBack } = {}) {
  const testMode = !!levelOverride;
  const { level, dayNumber } = levelOverride
    ? { level: levelOverride, dayNumber: SLUICE_LEVELS.indexOf(levelOverride) + 1 }
    : pickDailyLevel(SLUICE_LEVELS, SLUICE_LAUNCH_DATE);

  const [solvedToday, setSolvedToday] = useState(() => (testMode ? false : hasWonSluiceToday()));
  const [streak, setStreak] = useState(() => (testMode ? 0 : getSluiceStreak()));
  const [showRules, setShowRules] = useState(() => {
    try {
      return !localStorage.getItem(INTRO_KEY);
    } catch (e) {
      return false;
    }
  });

  const [dial, setDial] = useState(() => level.gates.map(() => Math.floor(MAX_LEVEL / 2)));
  const [locked, setLocked] = useState(() => level.gates.map(() => false));
  const [history, setHistory] = useState([]);
  const [win, setWin] = useState(false);

  const closeRules = () => {
    setShowRules(false);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch (e) {
      // ignore
    }
  };

  function setGate(i, value) {
    setDial((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  }

  function release() {
    const results = level.secret.map((s, i) => {
      const status = locked[i] ? "correct" : feedbackFor(dial[i], s);
      return { value: locked[i] ? s : dial[i], status };
    });
    setHistory((prev) => [...prev, { n: prev.length + 1, results }]);
    setLocked((prev) => prev.map((was, i) => was || results[i].status === "correct"));
    setDial((prev) => prev.map((v, i) => (results[i].status === "correct" ? level.secret[i] : v)));

    const allCorrect = results.every((r) => r.status === "correct");
    if (allCorrect) {
      setWin(true);
      if (!testMode && !solvedToday) {
        const newStreak = recordSluiceWin();
        setStreak(newStreak);
        setSolvedToday(true);
      }
    }
  }

  const showSolvedCard = solvedToday && !testMode;

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
      <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            onClick={() => {
              if (onBack) onBack();
              else window.location.href = "/";
            }}
            aria-label="Back to menu"
            style={{ width: 30, height: 30, borderRadius: 9, border: "2.5px solid #4b2e73", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: "#4b2e73" }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11, letterSpacing: ".08em", color: "#a07fc4" }}>
              PUZZLE #{dayNumber}
            </span>
            {testMode ? (
              <div
                style={{ display: "flex", alignItems: "center", height: 22, padding: "0 8px", fontSize: 11, fontWeight: 800, color: "#4b2e73", borderRadius: 999, border: "2px solid #4b2e73", background: "#c9b6f5", letterSpacing: ".05em" }}
                title="Test play — doesn't touch your real streak"
              >
                TEST
              </div>
            ) : (
              <div
                style={{ display: "flex", alignItems: "center", gap: 4, height: 22, padding: "0 8px", fontSize: 11.5, fontWeight: 800, color: "#4b2e73", borderRadius: 999, border: "2px solid #4b2e73", background: solvedToday ? "#fff5b8" : "#ffffff" }}
                title={solvedToday ? "Today's gates are dialed in" : "Current streak"}
              >
                <span style={{ fontSize: 11, lineHeight: 1 }}>🔥</span>
                {streak}
              </div>
            )}
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
          <h1 style={{ fontSize: 19, fontWeight: 800, color: "#4b2e73", letterSpacing: "-.01em", margin: 0, lineHeight: 1.15 }}>{level.name}</h1>
          {level.hint && <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: "#a07fc4", margin: 0, maxWidth: 360, lineHeight: 1.35 }}>{level.hint}</p>}
        </div>

        {showSolvedCard ? (
          <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 22, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>🚰</div>
            <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Every gate's dialed in!</p>
            <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11 }}>Come back tomorrow for the next dam.</p>
          </div>
        ) : (
          <>
            <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 16, boxShadow: win ? "0 0 0 4px #3fae7d" : "none", transition: "box-shadow 0.3s ease" }}>
              {history.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, paddingBottom: 14, borderBottom: "2px dashed #f1e9f7" }}>
                  {history.map((a) => (
                    <HistoryRow key={a.n} attempt={a} gates={level.gates} />
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
                {level.gates.map((label, i) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 9.5, color: "#a07fc4", textAlign: "center", maxWidth: 62, lineHeight: 1.25 }}>{label}</span>
                    <GateDial value={locked[i] ? level.secret[i] : dial[i]} onSet={(v) => setGate(i, v)} locked={locked[i]} />
                  </div>
                ))}
              </div>
            </div>

            {!win && (
              <button
                type="button"
                onClick={release}
                style={{ padding: "12px 0", borderRadius: 14, border: "2.5px solid #4b2e73", background: "#ffb3d0", color: "#4b2e73", fontWeight: 800, fontSize: 15 }}
              >
                Release
              </button>
            )}

            {history.length > 0 && !win && (
              <p style={{ textAlign: "center", color: STATUS_COLOR[history[history.length - 1].results.every((r) => r.status === "correct") ? "correct" : history[history.length - 1].results.some((r) => r.status === "high") ? "high" : "low"], fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11, margin: 0 }}
              >
                {locked.filter(Boolean).length} of {level.gates.length} gates locked.
              </p>
            )}
            {win && (
              <p style={{ textAlign: "center", color: "#3fae7d", fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 12, margin: 0 }}>
                {testMode
                  ? `Solved in ${history.length} release${history.length === 1 ? "" : "s"}! (test solve — your real streak wasn't touched)`
                  : `Solved in ${history.length} release${history.length === 1 ? "" : "s"}!`}
              </p>
            )}
          </>
        )}
      </div>

      {showRules && <RulesModal onClose={closeRules} />}
    </div>
  );
}
