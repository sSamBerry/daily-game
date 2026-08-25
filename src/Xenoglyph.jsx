import { useState, useRef } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { amsterdamPuzzleDateStr, shiftDateStr, dayIndexSince } from "./DailyPuzzle.jsx";

// ---------------------------------------------------------------------------
// Xenoglyph — a daily first-contact translation puzzle. Lives at /xenoglyph,
// linked from the "game 02" card on the ecosystem hub (/home). Same
// daily-rollover convention as the rest of the site (9am Amsterdam, see
// amsterdamPuzzleDateStr in DailyPuzzle.jsx) but its own streak, reached via
// its own localStorage key so it doesn't interfere with Defender's or
// Murdle's.
//
// The glyphs are real Unicode Old North Arabian letters (U+10A80 block),
// rendered with the Noto Sans Old North Arabian Google Font — an actual
// undeciphered-feeling ancient script, bold and angular so each sign stays
// legible even at small sizes. Their real Ancient North Arabian readings are
// irrelevant here, but each signal still picks a letter whose *shape* loosely
// suggests its made-up meaning (the sun glyph is a literal sunburst, "trust"
// is two hands cupped together, "sleep" is a curled-up shape, etc.) so the
// mapping feels designed rather than random.
export const XENOGLYPH_LAUNCH_DATE = "2026-08-23";
const XENOGLYPH_STREAK_KEY = "xenoglyph_streak";
const XENOGLYPH_INTRO_KEY = "xenoglyph_seen_intro";

// Every signal is played as 5 transmissions, one at a time: the first 4 are
// the archive, each 2 glyphs long with an emoji "scene" hint instead of an
// English translation — no word is ever spelled out. They're arranged in a
// cycle (word 0 with word 1, word 1 with word 2, word 2 with word 3, word 3
// back to word 0) so every glyph appears in exactly two of the four, sharing
// exactly one meaning-emoji with each. A single card never tells you which
// of its two glyphs is which emoji — only by comparing two overlapping
// cards and spotting the one emoji they share can you pin a glyph to a
// meaning. The 5th transmission is the final signal: only 3 of the 4 words
// appear in it, so the 4th stays live as a decoy, and its meanings aren't
// given at all — the player types them in.
export const XENOGLYPH_SIGNALS = [
  {
    id: "kepler-relay",
    date: null,
    headline: "The Voyager Echo",
    premise: "An old probe drifting past the heliopause just woke up and started transmitting again. Work through its archive, then decode the final signal before it goes quiet.",
    vocabulary: [
      { id: "sun", glyph: "\u{10a8f}", meaning: "sun", emoji: "☀️" },
      { id: "cold", glyph: "\u{10a82}", meaning: "cold", emoji: "\u{1f9ca}" },
      { id: "alive", glyph: "\u{10a9b}", meaning: "alive", emoji: "\u{1f493}" },
      { id: "listen", glyph: "\u{10a8e}", meaning: "listen", emoji: "\u{1f442}" },
    ],
    log: [
      { glyphs: ["sun", "cold"] },
      { glyphs: ["cold", "alive"] },
      { glyphs: ["alive", "listen"] },
      { glyphs: ["listen", "sun"] },
    ],
    target: { glyphs: ["alive", "listen", "sun"] },
  },
  {
    id: "transmission-7x",
    date: null,
    headline: "Transmission 7x",
    premise: "A burst arrived on an unlisted frequency, labeled only 7x. Work through the archive, then decode the closing line.",
    vocabulary: [
      { id: "red", glyph: "\u{10a89}", meaning: "red", emoji: "\u{1f534}" },
      { id: "hunger", glyph: "\u{10a97}", meaning: "hunger", emoji: "\u{1f37d}\u{fe0f}" },
      { id: "sky", glyph: "\u{10a90}", meaning: "sky", emoji: "\u{2601}\u{fe0f}" },
      { id: "build", glyph: "\u{10a88}", meaning: "build", emoji: "\u{1f9f1}" },
    ],
    log: [
      { glyphs: ["red", "hunger"] },
      { glyphs: ["hunger", "sky"] },
      { glyphs: ["sky", "build"] },
      { glyphs: ["build", "red"] },
    ],
    target: { glyphs: ["hunger", "build", "red"] },
  },
  {
    id: "answer-signal",
    date: null,
    headline: "The Answer Signal",
    premise: "Something finally answered the message we sent decades ago. Work through the archive, then decode the reply's closing line.",
    vocabulary: [
      { id: "time", glyph: "\u{10a93}", meaning: "time", emoji: "\u{231b}" },
      { id: "water", glyph: "\u{10a86}", meaning: "water", emoji: "\u{1f4a7}" },
      { id: "trust", glyph: "\u{10a83}", meaning: "trust", emoji: "\u{1f91d}" },
      { id: "sleep", glyph: "\u{10a94}", meaning: "sleep", emoji: "\u{1f634}" },
    ],
    log: [
      { glyphs: ["time", "water"] },
      { glyphs: ["water", "trust"] },
      { glyphs: ["trust", "sleep"] },
      { glyphs: ["sleep", "time"] },
    ],
    target: { glyphs: ["trust", "sleep", "water"] },
  },
];

export function pickDailySignal(signals, launchDateStr) {
  const dayIndex = dayIndexSince(launchDateStr);
  const signalNumber = dayIndex + 1;
  const dated = signals.find((s) => s.date === amsterdamPuzzleDateStr());
  if (dated) return { signal: dated, signalNumber };
  const signal = signals[dayIndex % signals.length];
  return { signal, signalNumber };
}

export function recordXenoglyphWin() {
  const today = amsterdamPuzzleDateStr();
  let streak = 1;
  try {
    const raw = localStorage.getItem(XENOGLYPH_STREAK_KEY);
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
    localStorage.setItem(XENOGLYPH_STREAK_KEY, JSON.stringify({ lastDate: today, streak }));
  } catch (e) {
    // ignore write failure, still return the computed streak
  }
  return streak;
}

export function getXenoglyphStreak() {
  const today = amsterdamPuzzleDateStr();
  try {
    const raw = localStorage.getItem(XENOGLYPH_STREAK_KEY);
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

export function hasWonXenoglyphToday() {
  try {
    const raw = localStorage.getItem(XENOGLYPH_STREAK_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data.lastDate === amsterdamPuzzleDateStr();
  } catch (e) {
    return false;
  }
}

const GLYPH_FONT = "'Noto Sans Old North Arabian', 'Baloo 2', serif";

function normalizeGuess(s) {
  return s.trim().toLowerCase().replace(/[^a-z]/g, "");
}

function ProgressDots({ count, index, onJump }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 7 }}>
      {Array.from({ length: count }).map((_, i) => {
        const isLast = i === count - 1;
        const isCurrent = i === index;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onJump(i)}
            aria-label={isLast ? "Final signal" : `Transmission ${i + 1}`}
            style={{
              width: isCurrent ? 12 : isLast ? 10 : 8,
              height: isCurrent ? 12 : isLast ? 10 : 8,
              borderRadius: isLast ? 4 : "50%",
              border: `2px solid ${isLast ? "#d9738a" : "#4b2e73"}`,
              background: isCurrent ? (isLast ? "#d9738a" : "#4b2e73") : i < index ? "#c9b6f5" : "#ffffff",
              padding: 0,
              transition: "all 0.15s ease",
            }}
          />
        );
      })}
    </div>
  );
}

function ArchiveCard({ entry, byId, order }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "3px solid #4b2e73",
        borderRadius: 18,
        padding: "28px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        minHeight: 280,
      }}
    >
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 10.5, letterSpacing: ".1em", color: "#a07fc4", textTransform: "uppercase" }}>
        Transmission {order} of 4 · decoded
      </span>
      <div style={{ display: "flex", gap: 20 }}>
        {entry.glyphs.map((gid, i) => (
          <span key={i} style={{ fontFamily: GLYPH_FONT, fontSize: 72, color: "#4b2e73", lineHeight: 1 }}>
            {byId[gid].glyph}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 9.5, letterSpacing: ".08em", color: "#a07fc4", textTransform: "uppercase" }}>
          scene detected
        </span>
        <span style={{ fontSize: 34, lineHeight: 1 }}>
          {entry.glyphs.map((gid) => byId[gid].emoji).join(" ")}
        </span>
      </div>
    </div>
  );
}

function BossCard({ signal, byId, textInputs, onChange, result, onSubmit, canSubmit, attempts }) {
  return (
    <div
      style={{
        background: "#fff8fb",
        border: "3px solid #d9738a",
        borderRadius: 18,
        padding: "24px 18px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        minHeight: 280,
      }}
    >
      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 11, letterSpacing: ".1em", color: "#d9738a", textTransform: "uppercase" }}>
        Final signal — decode it
      </span>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {signal.target.glyphs.map((gid, i) => {
          let border = "#4b2e73";
          let bg = "#ffffff";
          if (result) {
            border = result.perSlot[i] ? "#3fae7d" : "#d9738a";
            bg = result.perSlot[i] ? "#e3f7ee" : "#fde7ea";
          }
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: GLYPH_FONT, fontSize: 54, color: "#4b2e73", lineHeight: 1 }}>{byId[gid].glyph}</span>
              <input
                type="text"
                value={textInputs[i] || ""}
                onChange={(e) => onChange(i, e.target.value)}
                placeholder="meaning?"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  width: 92,
                  textAlign: "center",
                  padding: "7px 4px",
                  borderRadius: 10,
                  border: `2.5px solid ${border}`,
                  background: bg,
                  color: "#4b2e73",
                  fontFamily: "'Baloo 2', system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          padding: "9px 28px",
          borderRadius: 12,
          border: "2.5px solid #4b2e73",
          background: canSubmit ? "#ffb3d0" : "#f1e9f7",
          color: "#4b2e73",
          fontWeight: 800,
          fontSize: 14,
          opacity: canSubmit ? 1 : 0.6,
        }}
      >
        Decode
      </button>
      {result && !result.allOk && (
        <p style={{ textAlign: "center", color: "#d9738a", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11, margin: 0 }}>
          Not quite — {result.perSlot.filter(Boolean).length} of {signal.target.glyphs.length} correct · {attempts} attempt{attempts === 1 ? "" : "s"}
        </p>
      )}
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
        style={{
          width: "100%",
          maxWidth: 340,
          margin: "0 16px",
          background: "#ffffff",
          border: "3px solid #4b2e73",
          borderRadius: 16,
          padding: 24,
          fontFamily: "'Baloo 2', system-ui, sans-serif",
          animation: "xenoglyphPopIn 0.2s ease-out",
        }}
      >
        <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 20, marginBottom: 10, textAlign: "center" }}>How to play</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {[
            "You'll get 5 transmissions, one at a time — swipe or use the arrows to move between them.",
            "The first 4 are archived — no English, just a pair of glyphs and an emoji scene. Every glyph shows up in exactly two transmissions.",
            "A single transmission never tells you which glyph is which emoji. Find the one emoji two overlapping transmissions share — that pins down their common glyph.",
            "The 5th is the final signal — nobody's decoded it yet. Type what you think each glyph means.",
            "Not every word from the archive shows up in the final signal, so watch for decoys.",
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

// `signal` + `onBack` are only passed from the /config puzzle lab, to play a
// specific signal on demand instead of whatever today's date picks. That
// path is a test mode: it never touches the real streak/solved-today
// localStorage, so poking around in it can't spoil or fake your actual
// streak, and solving a test signal doesn't lock you out of today's real one.
export default function XenoglyphApp({ signal: signalOverride, onBack } = {}) {
  const testMode = !!signalOverride;
  const { signal, signalNumber } = signalOverride
    ? { signal: signalOverride, signalNumber: XENOGLYPH_SIGNALS.indexOf(signalOverride) + 1 }
    : pickDailySignal(XENOGLYPH_SIGNALS, XENOGLYPH_LAUNCH_DATE);
  const byId = Object.fromEntries(signal.vocabulary.map((v) => [v.id, v]));
  const totalCards = signal.log.length + 1;
  const bossIndex = totalCards - 1;

  const [solvedToday, setSolvedToday] = useState(() => (testMode ? false : hasWonXenoglyphToday()));
  const [streak, setStreak] = useState(() => (testMode ? 0 : getXenoglyphStreak()));
  const [showRules, setShowRules] = useState(() => {
    try {
      return !localStorage.getItem(XENOGLYPH_INTRO_KEY);
    } catch (e) {
      return false;
    }
  });

  const [cardIndex, setCardIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);

  const [textInputs, setTextInputs] = useState({});
  const [attempts, setAttempts] = useState(0);
  const [result, setResult] = useState(null);

  const closeRules = () => {
    setShowRules(false);
    try {
      localStorage.setItem(XENOGLYPH_INTRO_KEY, "1");
    } catch (e) {
      // ignore
    }
  };

  const goTo = (i) => setCardIndex(Math.max(0, Math.min(totalCards - 1, i)));

  const onPointerDown = (e) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    setDragX(0);
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    setDragX(e.clientX - startXRef.current);
  };
  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragX < -50) goTo(cardIndex + 1);
    else if (dragX > 50) goTo(cardIndex - 1);
    setDragX(0);
  };

  const setInput = (i, value) => {
    setResult(null);
    setTextInputs((prev) => ({ ...prev, [i]: value }));
  };

  const targetLen = signal.target.glyphs.length;
  const canSubmit = signal.target.glyphs.every((_, i) => normalizeGuess(textInputs[i] || "").length > 0);

  const submitTranslation = () => {
    if (!canSubmit) return;
    const perSlot = signal.target.glyphs.map((gid, i) => normalizeGuess(textInputs[i] || "") === normalizeGuess(byId[gid].meaning));
    const allOk = perSlot.every(Boolean);
    setAttempts((n) => n + 1);
    setResult({ perSlot, allOk });
    if (allOk) {
      if (!testMode) {
        const newStreak = recordXenoglyphWin();
        setStreak(newStreak);
      }
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
        @keyframes xenoglyphPopIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
      <div style={{ width: "100%", maxWidth: 430, display: "flex", flexDirection: "column", gap: 10 }}>
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
              SIGNAL #{signalNumber}
            </span>
            {testMode ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 22,
                  padding: "0 8px",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#4b2e73",
                  borderRadius: 999,
                  border: "2px solid #4b2e73",
                  background: "#c9b6f5",
                  letterSpacing: ".05em",
                }}
                title="Test play — doesn't touch your real streak"
              >
                TEST
              </div>
            ) : (
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
                title={solvedToday ? "Today's signal decoded" : "Current streak"}
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
          <h1 style={{ fontSize: 19, fontWeight: 800, color: "#4b2e73", letterSpacing: "-.01em", margin: 0, lineHeight: 1.15 }}>{signal.headline}</h1>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: "#a07fc4", margin: 0, maxWidth: 380, lineHeight: 1.35 }}>{signal.premise}</p>
        </div>

        {solvedToday ? (
          <div style={{ background: "#ffffff", border: "3px solid #4b2e73", borderRadius: 16, padding: 22, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>📡</div>
            <p style={{ color: "#4b2e73", fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Signal decoded!</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 10 }}>
              {signal.target.glyphs.map((gid, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontFamily: GLYPH_FONT, fontSize: 38, color: "#4b2e73" }}>{byId[gid].glyph}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11, color: "#3fae7d", textTransform: "uppercase", letterSpacing: ".04em" }}>
                    {byId[gid].meaning}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ color: "#a07fc4", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 11 }}>
              {testMode ? "Test solve — your real streak wasn't touched." : "Come back tomorrow for the next transmission."}
            </p>
          </div>
        ) : (
          <>
            <ProgressDots count={totalCards} index={cardIndex} onJump={goTo} />

            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
              style={{
                touchAction: "pan-y",
                cursor: "grab",
                transform: `translateX(${dragX}px)`,
                transition: draggingRef.current ? "none" : "transform 0.25s ease",
              }}
            >
              {cardIndex < bossIndex ? (
                <ArchiveCard entry={signal.log[cardIndex]} byId={byId} order={cardIndex + 1} />
              ) : (
                <BossCard
                  signal={signal}
                  byId={byId}
                  textInputs={textInputs}
                  onChange={setInput}
                  result={result}
                  onSubmit={submitTranslation}
                  canSubmit={canSubmit}
                  attempts={attempts}
                />
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => goTo(cardIndex - 1)}
                disabled={cardIndex === 0}
                aria-label="Previous transmission"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: "2.5px solid #4b2e73",
                  background: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: cardIndex === 0 ? 0.35 : 1,
                }}
              >
                <ChevronLeft className="w-5 h-5" style={{ color: "#4b2e73" }} />
              </button>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10.5, color: "#a07fc4", letterSpacing: ".05em" }}>
                {cardIndex < bossIndex ? "swipe or tap →" : "type your answers above"}
              </span>
              <button
                type="button"
                onClick={() => goTo(cardIndex + 1)}
                disabled={cardIndex === bossIndex}
                aria-label="Next transmission"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: "2.5px solid #4b2e73",
                  background: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: cardIndex === bossIndex ? 0.35 : 1,
                }}
              >
                <ChevronRight className="w-5 h-5" style={{ color: "#4b2e73" }} />
              </button>
            </div>
          </>
        )}
      </div>

      {showRules && <RulesModal onClose={closeRules} />}
    </div>
  );
}
