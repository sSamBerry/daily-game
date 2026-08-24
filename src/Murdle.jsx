import { useState } from "react";
import { ArrowLeft, Info, X, Check } from "lucide-react";
import { amsterdamPuzzleDateStr, shiftDateStr, dayIndexSince } from "./DailyPuzzle.jsx";

// ---------------------------------------------------------------------------
// Whodunit — a Murdle-style daily deduction game. Lives at /murdle, linked
// from the "game 02" card on the ecosystem hub (/home). Same daily-rollover
// convention as the rest of the site (9am Amsterdam, see amsterdamPuzzleDateStr
// in DailyPuzzle.jsx) but its own streak, reached via its own localStorage key
// so it doesn't interfere with Defender's.

export const MURDLE_LAUNCH_DATE = "2026-08-22";
const MURDLE_STREAK_KEY = "murdle_streak";
const MURDLE_INTRO_KEY = "murdle_seen_intro";

// Each case gives every suspect exactly one tool and one location (two
// bijections). The clues let you pin those down by elimination, and one
// final clue identifies which suspect is actually guilty — that suspect's
// tool + location is the accusation you submit. The notes grids are pure
// scratch space; only the three picks at the bottom are graded.
export const MURDLE_CASES = [
  {
    id: "cupcake-heist",
    date: null,
    headline: "The Great Cupcake Heist",
    premise: "The last red-velvet cupcake vanished from the bakery case overnight.",
    suspects: [
      { id: "mochi", name: "Mochi", emoji: "🐰" },
      { id: "biscuit", name: "Biscuit", emoji: "🐶" },
      { id: "waffle", name: "Waffle", emoji: "🦆" },
    ],
    weapons: [
      { id: "duster", name: "Feather Duster", emoji: "🪶" },
      { id: "mitt", name: "Oven Mitt", emoji: "🧤" },
      { id: "ladder", name: "Step Ladder", emoji: "🪜" },
    ],
    rooms: [
      { id: "kitchen", name: "Kitchen", emoji: "🍳" },
      { id: "counter", name: "Front Counter", emoji: "🛎️" },
      { id: "pantry", name: "Pantry", emoji: "📦" },
    ],
    clues: [
      "Biscuit never touched the duster.",
      "The radio played jazz all night.",
      "Mochi stayed clear of the ovens.",
      "Mochi never touched the duster either.",
      "Biscuit stayed clear of the ovens too.",
      "Mochi won't wear an oven mitt.",
      "Biscuit avoids the front counter.",
      "Feathers turned up by the ovens.",
    ],
    solution: { suspect: "waffle", weapon: "duster", room: "kitchen" },
  },
  {
    id: "arcade-trophy",
    date: null,
    headline: "The Mystery of the Missing Trophy",
    premise: "The high-score trophy is gone from its case, and the arcade closed hours ago.",
    suspects: [
      { id: "pixel", name: "Pixel", emoji: "🕹️" },
      { id: "nova", name: "Nova", emoji: "⭐" },
      { id: "juniper", name: "Juniper", emoji: "🍃" },
    ],
    weapons: [
      { id: "skateboard", name: "Skateboard", emoji: "🛹" },
      { id: "umbrella", name: "Umbrella", emoji: "☂️" },
      { id: "backpack", name: "Backpack", emoji: "🎒" },
    ],
    rooms: [
      { id: "floor", name: "Arcade Floor", emoji: "🎮" },
      { id: "counter", name: "Prize Counter", emoji: "🎟️" },
      { id: "breakroom", name: "Break Room", emoji: "🚪" },
    ],
    clues: [
      "Juniper never carries a backpack.",
      "Pixel avoids the break room.",
      "The neon sign flickered all night.",
      "Nova won't touch a backpack either.",
      "Nova avoids the break room too.",
      "Nova's knees can't handle a skateboard.",
      "Pixel skips the prize counter.",
      "Skateboard tracks led to the break room.",
    ],
    solution: { suspect: "juniper", weapon: "skateboard", room: "breakroom" },
  },
  {
    id: "greenhouse-wreck",
    date: null,
    headline: "Who Wrecked the Greenhouse",
    premise: "Someone left the greenhouse in ruins, and the culprit left the hose running.",
    suspects: [
      { id: "clover", name: "Clover", emoji: "🍀" },
      { id: "bramble", name: "Bramble", emoji: "🌿" },
      { id: "sable", name: "Sable", emoji: "🦔" },
    ],
    weapons: [
      { id: "bucket", name: "Watering Bucket", emoji: "🪣" },
      { id: "shears", name: "Pruning Shears", emoji: "✂️" },
      { id: "hose", name: "Garden Hose", emoji: "🚰" },
    ],
    rooms: [
      { id: "greenhouse", name: "Greenhouse", emoji: "🌱" },
      { id: "toolshed", name: "Toolshed", emoji: "🧰" },
      { id: "compost", name: "Compost Pile", emoji: "🍂" },
    ],
    clues: [
      "Clover's never held the hose.",
      "Clover avoids the toolshed.",
      "Light rain fell outside all night.",
      "Bramble won't touch the hose either.",
      "Bramble avoids the toolshed too.",
      "Clover's never held the shears.",
      "Bramble avoids the greenhouse.",
      "Muddy tracks led to the toolshed.",
    ],
    solution: { suspect: "sable", weapon: "hose", room: "toolshed" },
  },
];

export function pickDailyCase(cases, launchDateStr) {
  const dayIndex = dayIndexSince(launchDateStr);
  const caseNumber = dayIndex + 1;
  const dated = cases.find((c) => c.date === amsterdamPuzzleDateStr());
  if (dated) return { kase: dated, caseNumber };
  const kase = cases[dayIndex % cases.length];
  return { kase, caseNumber };
}

export function recordMurdleWin() {
  const today = amsterdamPuzzleDateStr();
  let streak = 1;
  try {
    const raw = localStorage.getItem(MURDLE_STREAK_KEY);
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
    localStorage.setItem(MURDLE_STREAK_KEY, JSON.stringify({ lastDate: today, streak }));
  } catch (e) {
    // ignore write failure, still return the computed streak
  }
  return streak;
}

export function getMurdleStreak() {
  const today = amsterdamPuzzleDateStr();
  try {
    const raw = localStorage.getItem(MURDLE_STREAK_KEY);
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

export function hasWonMurdleToday() {
  try {
    const raw = localStorage.getItem(MURDLE_STREAK_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data.lastDate === amsterdamPuzzleDateStr();
  } catch (e) {
    return false;
  }
}

function GridMark({ value, size = 16 }) {
  if (value === 1) return <Check style={{ width: size, height: size, color: "#3fae7d" }} strokeWidth={3} />;
  if (value === 2) return <X style={{ width: size, height: size, color: "#d9738a" }} strokeWidth={3} />;
  return null;
}

// One combined grid (rows = suspects, two column groups = tools / locations)
// instead of two stacked cards — halves the chrome overhead and keeps a
// suspect's full row of notes in view at once.
function CaseGrid({ suspects, weapons, rooms, weaponMarks, roomMarks, onToggleWeapon, onToggleRoom }) {
  const cell = 25;
  const cellStyle = (v) => ({
    width: cell,
    height: cell,
    borderRadius: 7,
    border: "2px solid #4b2e73",
    background: v === 1 ? "#e3f7ee" : v === 2 ? "#fde7ea" : "#fffdf8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });
  return (
    <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "4px 10px", borderBottom: "2.5px solid #4b2e73", background: "#f5eefc" }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 10.5, letterSpacing: ".06em", color: "#4b2e73", textTransform: "uppercase" }}>
          Notes — tool &amp; location
        </span>
      </div>
      <div style={{ padding: "6px 10px", overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", margin: "0 auto" }}>
          <thead>
            <tr>
              <th />
              {weapons.map((c) => (
                <th key={c.id} style={{ padding: "0 2px 4px" }}>
                  <div style={{ fontSize: 14 }} title={c.name}>
                    {c.emoji}
                  </div>
                </th>
              ))}
              <th style={{ width: 10 }} />
              {rooms.map((c) => (
                <th key={c.id} style={{ padding: "0 2px 4px" }}>
                  <div style={{ fontSize: 14 }} title={c.name}>
                    {c.emoji}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suspects.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: "1px 4px 1px 0" }}>
                  <div style={{ fontSize: 15 }} title={r.name}>
                    {r.emoji}
                  </div>
                </td>
                {weapons.map((c) => {
                  const k = `${r.id}:${c.id}`;
                  const v = weaponMarks[k] || 0;
                  return (
                    <td key={c.id} style={{ padding: 1.5 }}>
                      <button type="button" onClick={() => onToggleWeapon(k)} aria-label={`${r.name} / ${c.name}`} style={cellStyle(v)}>
                        <GridMark value={v} size={13} />
                      </button>
                    </td>
                  );
                })}
                <td />
                {rooms.map((c) => {
                  const k = `${r.id}:${c.id}`;
                  const v = roomMarks[k] || 0;
                  return (
                    <td key={c.id} style={{ padding: 1.5 }}>
                      <button type="button" onClick={() => onToggleRoom(k)} aria-label={`${r.name} / ${c.name}`} style={cellStyle(v)}>
                        <GridMark value={v} size={13} />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChoiceGroup({ title, options, selected, onSelect, correctness }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: ".06em",
          color: "#a07fc4",
          textTransform: "uppercase",
        }}
      >
        {title}
      </span>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {options.map((o) => {
          const isSel = selected === o.id;
          let border = "#4b2e73";
          let bg = isSel ? "#fff5b8" : "#ffffff";
          if (isSel && correctness === "correct") {
            border = "#3fae7d";
            bg = "#e3f7ee";
          } else if (isSel && correctness === "wrong") {
            border = "#d9738a";
            bg = "#fde7ea";
          }
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                borderRadius: 999,
                border: `2px solid ${border}`,
                background: bg,
                fontFamily: "'Baloo 2', system-ui, sans-serif",
                fontWeight: 700,
                fontSize: 12.5,
                color: "#4b2e73",
              }}
            >
              <span>{o.emoji}</span>
              {o.name}
            </button>
          );
        })}
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
        className="w-full max-w-xs mx-4"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          border: "3px solid #4b2e73",
          borderRadius: 16,
          padding: 24,
          fontFamily: "'Baloo 2', system-ui, sans-serif",
          animation: "murdlePopIn 0.2s ease-out",
        }}
      >
        <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 10, textAlign: "center" }}>How to play</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {[
            "Every suspect used exactly one tool, in exactly one place.",
            "No clue hands you the answer — work it out by elimination, and use the grid to rule pairs in (✓) or out (✗).",
            "Not every clue is useful. Some are just color.",
            "Figure out who's actually guilty, then make your accusation below.",
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
          style={{ padding: "10px 0", borderRadius: 12, border: "2.5px solid #4b2e73", background: "#c9b6f5", color: "#4b2e73", fontWeight: 800 }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

export default function MurdleApp() {
  const { kase, caseNumber } = pickDailyCase(MURDLE_CASES, MURDLE_LAUNCH_DATE);
  const [solvedToday, setSolvedToday] = useState(() => hasWonMurdleToday());
  const [streak, setStreak] = useState(() => getMurdleStreak());
  const [showRules, setShowRules] = useState(() => {
    try {
      return !localStorage.getItem(MURDLE_INTRO_KEY);
    } catch (e) {
      return false;
    }
  });

  const [weaponMarks, setWeaponMarks] = useState({});
  const [roomMarks, setRoomMarks] = useState({});
  const [selSuspect, setSelSuspect] = useState(null);
  const [selWeapon, setSelWeapon] = useState(null);
  const [selRoom, setSelRoom] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState(null);

  const closeRules = () => {
    setShowRules(false);
    try {
      localStorage.setItem(MURDLE_INTRO_KEY, "1");
    } catch (e) {
      // ignore
    }
  };

  const toggleMark = (setter) => (k) => {
    setter((prev) => ({ ...prev, [k]: ((prev[k] || 0) + 1) % 3 }));
  };

  const canSubmit = selSuspect && selWeapon && selRoom;

  const submitAccusation = () => {
    if (!canSubmit) return;
    const suspectOk = selSuspect === kase.solution.suspect;
    const weaponOk = selWeapon === kase.solution.weapon;
    const roomOk = selRoom === kase.solution.room;
    const allOk = suspectOk && weaponOk && roomOk;
    setAttempts((n) => n + 1);
    setResult({ suspectOk, weaponOk, roomOk, allOk });
    if (allOk) {
      const newStreak = recordMurdleWin();
      setStreak(newStreak);
      setSolvedToday(true);
    }
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
        @keyframes murdlePopIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
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
              CASE #{caseNumber}
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
              title={solvedToday ? "Today's case closed" : "Current streak"}
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
          <h1 style={{ fontSize: 19, fontWeight: 800, color: "#4b2e73", letterSpacing: "-.01em", margin: 0, lineHeight: 1.15 }}>{kase.headline}</h1>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: "#a07fc4", margin: 0, maxWidth: 360, lineHeight: 1.35 }}>{kase.premise}</p>
        </div>

        {solvedToday ? (
          <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 22, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>🔍</div>
            <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Case closed!</p>
            <p style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
              It was {kase.suspects.find((s) => s.id === kase.solution.suspect)?.name}, with the{" "}
              {kase.weapons.find((w) => w.id === kase.solution.weapon)?.name}, in the{" "}
              {kase.rooms.find((r) => r.id === kase.solution.room)?.name}.
            </p>
            <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11 }}>Come back tomorrow for the next case.</p>
          </div>
        ) : (
          <>
            <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "4px 10px", borderBottom: "2.5px solid #4b2e73", background: "#f5eefc" }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 10.5, letterSpacing: ".06em", color: "#4b2e73", textTransform: "uppercase" }}>
                  Clues
                </span>
              </div>
              <div style={{ padding: "7px 11px 7px", display: "flex", flexDirection: "column", gap: 4 }}>
                {kase.clues.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                    <span
                      style={{
                        flex: "none",
                        width: 15,
                        height: 15,
                        borderRadius: "50%",
                        border: "2px solid #4b2e73",
                        background: "#fff5b8",
                        color: "#4b2e73",
                        fontFamily: "'DM Mono', monospace",
                        fontWeight: 700,
                        fontSize: 9,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1,
                      }}
                    >
                      {i + 1}
                    </span>
                    <p style={{ color: "#4b2e73", fontFamily: "'DM Mono', monospace", fontSize: 11, lineHeight: 1.35, margin: 0 }}>{c}</p>
                  </div>
                ))}
              </div>
            </div>

            <CaseGrid
              suspects={kase.suspects}
              weapons={kase.weapons}
              rooms={kase.rooms}
              weaponMarks={weaponMarks}
              roomMarks={roomMarks}
              onToggleWeapon={toggleMark(setWeaponMarks)}
              onToggleRoom={toggleMark(setRoomMarks)}
            />

            <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 14, padding: 10, display: "flex", flexDirection: "column", gap: 7 }}>
              <ChoiceGroup
                title="Who did it"
                options={kase.suspects}
                selected={selSuspect}
                onSelect={setSelSuspect}
                correctness={result ? (result.suspectOk ? "correct" : "wrong") : null}
              />
              <ChoiceGroup
                title="With what"
                options={kase.weapons}
                selected={selWeapon}
                onSelect={setSelWeapon}
                correctness={result ? (result.weaponOk ? "correct" : "wrong") : null}
              />
              <ChoiceGroup
                title="Where"
                options={kase.rooms}
                selected={selRoom}
                onSelect={setSelRoom}
                correctness={result ? (result.roomOk ? "correct" : "wrong") : null}
              />
              <button
                type="button"
                onClick={submitAccusation}
                disabled={!canSubmit}
                style={{
                  padding: "8px 0",
                  borderRadius: 12,
                  border: "2.5px solid #4b2e73",
                  background: canSubmit ? "#ffb3d0" : "#f1e9f7",
                  color: "#4b2e73",
                  fontWeight: 800,
                  fontSize: 14,
                  opacity: canSubmit ? 1 : 0.6,
                }}
              >
                Make the call
              </button>
              {result && !result.allOk && (
                <p style={{ textAlign: "center", color: "#d9738a", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11, margin: 0 }}>
                  Not quite — {[result.suspectOk, result.weaponOk, result.roomOk].filter(Boolean).length} of 3 correct · {attempts} attempt{attempts === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {showRules && <RulesModal onClose={closeRules} />}
    </div>
  );
}
