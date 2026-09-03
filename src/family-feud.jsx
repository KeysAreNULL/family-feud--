import { useState, useRef, useEffect, useCallback } from "react";
import { sortAnswersByPoints, getWinningTeamIndex } from "./gameLogic.js";
import { supabase, supabaseConfigured } from "./supabase.js";

/* ══════════════════════════════════════════
   FUZZY MATCHING
══════════════════════════════════════════ */
function norm(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
}
function lev(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++)
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}
function fuzzy(inp, ans) {
  const a = norm(inp), b = norm(ans);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aw = a.split(" "), bw = b.split(" ");
  if (aw.some(w => w.length > 2 && bw.includes(w)) || bw.some(w => w.length > 2 && aw.includes(w))) return 0.9;
  if (a.includes(b) || b.includes(a)) return 0.85;
  return 1 - lev(a, b) / Math.max(a.length, b.length, 1);
}
const THRESHOLD = 0.62;
const PRESETS_KEY = "family-feud-presets";

function readPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/* ══════════════════════════════════════════
   STYLE CONSTANTS
══════════════════════════════════════════ */
const C = {
  bg:        "#070e1d",
  surface:   "#0b1629",
  panel:     "#0d1e3a",
  blue:      "#0f2650",
  blueMid:   "#163370",
  blueLight: "#1e4490",
  gold:      "#f5c842",
  goldDark:  "#c99a1a",
  goldGlow:  "rgba(245,200,66,0.25)",
  red:       "#e63946",
  redGlow:   "rgba(230,57,70,0.3)",
  green:     "#22c55e",
  white:     "#f0f6ff",
  muted:     "#4a6a9a",
  dim:       "#1e3060",
};

const ANIM = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Open+Sans:wght@400;600&display=swap');
  * { box-sizing: border-box; }
  @keyframes revealTile {
    0%   { transform: rotateX(-90deg) scale(0.9); opacity: 0; }
    60%  { transform: rotateX(8deg) scale(1.03); }
    100% { transform: rotateX(0deg) scale(1); opacity: 1; }
  }
  @keyframes strikeIn {
    0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
    60%  { transform: scale(1.3) rotate(5deg); }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes glow {
    0%,100% { box-shadow: 0 0 20px ${C.goldGlow}; }
    50%      { box-shadow: 0 0 40px rgba(245,200,66,0.45), 0 0 80px rgba(245,200,66,0.2); }
  }
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-8px); }
    40%     { transform: translateX(8px); }
    60%     { transform: translateX(-5px); }
    80%     { transform: translateX(5px); }
  }
  @keyframes wrongFlash {
    0%,100% { background: transparent; }
    50%     { background: rgba(230,57,70,0.18); }
  }
  .tile-hidden  { background: linear-gradient(160deg, #0f2650 0%, #163370 100%); }
  .tile-revealed { animation: revealTile 0.55s cubic-bezier(.36,.07,.19,.97) forwards; }
  .strike-new { animation: strikeIn 0.4s cubic-bezier(.36,.07,.19,.97) forwards; }
  .host-input:focus { border-color: ${C.gold} !important; box-shadow: 0 0 0 3px ${C.goldGlow}; }
  .btn-check:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
  .btn-check:active:not(:disabled) { transform: translateY(0); }
  .team-active { animation: glow 2.2s ease-in-out infinite; }
  .feedback-correct { animation: slideUp 0.3s ease-out; }
  .feedback-wrong { animation: shake 0.45s ease-out, wrongFlash 0.45s ease-out; }
  input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
  select option { background: #0f2650; color: #f0f6ff; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0b1629; }
  ::-webkit-scrollbar-thumb { background: #1e4490; border-radius: 3px; }
`;

/* ══════════════════════════════════════════
   SUBCOMPONENTS
══════════════════════════════════════════ */
function StrikeBoxes({ count }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className={i < count ? "strike-new" : ""}
          style={{
            width: 38, height: 38,
            border: `2.5px solid ${i < count ? C.red : C.dim}`,
            borderRadius: 7,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: i < count ? "rgba(230,57,70,0.18)" : "transparent",
            fontSize: 22, fontWeight: 900, color: C.red,
            fontFamily: "'Oswald', sans-serif",
            boxShadow: i < count ? `0 0 12px ${C.redGlow}` : "none",
            transition: "border-color 0.3s, background 0.3s",
          }}
        >
          {i < count ? "✕" : ""}
        </div>
      ))}
    </div>
  );
}

function TeamPanel({ name, team, isActive, side, onActivate, roundDone }) {
  return (
    <div
      onClick={!roundDone ? onActivate : undefined}
      className={isActive ? "team-active" : ""}
      style={{
        width: 152,
        flexShrink: 0,
        background: isActive
          ? `linear-gradient(170deg, #112d70 0%, #1a3f90 100%)`
          : C.panel,
        border: `2.5px solid ${isActive ? C.gold : C.dim}`,
        borderRadius: 16,
        padding: "18px 12px 16px",
        display: "flex", flexDirection: "column",
        alignItems: "center", gap: 8,
        cursor: roundDone ? "default" : "pointer",
        transition: "border-color 0.4s, background 0.4s",
        userSelect: "none",
      }}
    >
      <div style={{
        fontSize: 10,
        fontFamily: "'Oswald', sans-serif",
        letterSpacing: 2,
        color: isActive ? C.gold : C.muted,
        textTransform: "uppercase",
        minHeight: 14,
      }}>
        {isActive ? "▶  ACTIVE  ◀" : "click to activate"}
      </div>

      <div style={{
        fontSize: 17, fontWeight: 700,
        fontFamily: "'Oswald', sans-serif",
        color: isActive ? C.gold : C.white,
        textAlign: "center", lineHeight: 1.2,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}>
        {name}
      </div>

      <div style={{
        fontSize: 56, fontWeight: 700,
        fontFamily: "'Oswald', sans-serif",
        color: C.white, lineHeight: 1,
        textShadow: "0 2px 12px rgba(0,0,0,0.6)",
      }}>
        {team.score}
      </div>

      <div style={{
        fontSize: 10, color: C.muted,
        fontFamily: "'Oswald', sans-serif",
        letterSpacing: 3, textTransform: "uppercase",
      }}>POINTS</div>

      <StrikeBoxes count={team.strikes} />

      <div style={{
        fontSize: 9.5, color: C.muted, marginTop: 2,
        fontFamily: "'Open Sans', sans-serif",
      }}>
        {team.strikes}/3 strikes
      </div>
    </div>
  );
}

function AnswerTile({ answer, isRevealed, rank }) {
  return (
    <div
      className={isRevealed ? "tile-revealed" : "tile-hidden"}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        border: `2px solid ${isRevealed ? C.gold : C.dim}`,
        borderRadius: 10,
        padding: "11px 14px",
        minHeight: 54,
        transition: "border-color 0.5s",
        boxShadow: isRevealed ? `0 0 18px ${C.goldGlow}` : "none",
      }}
    >
      {/* Rank badge */}
      <div style={{
        width: 30, height: 30, flexShrink: 0,
        borderRadius: 6,
        background: isRevealed ? C.gold : C.dim,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 700,
        fontFamily: "'Oswald', sans-serif",
        color: isRevealed ? C.bg : C.muted,
        transition: "background 0.5s, color 0.5s",
      }}>
        {rank}
      </div>

      {isRevealed ? (
        <>
          <div style={{
            flex: 1, fontSize: 16, fontWeight: 600,
            fontFamily: "'Oswald', sans-serif",
            color: C.white, textTransform: "uppercase", letterSpacing: 1.2,
          }}>
            {answer.text}
          </div>
          <div style={{
            fontSize: 24, fontWeight: 700,
            fontFamily: "'Oswald', sans-serif",
            color: C.gold, minWidth: 38, textAlign: "right",
          }}>
            {answer.count}
          </div>
        </>
      ) : (
        <div style={{
          flex: 1, height: 11, borderRadius: 5,
          background: `linear-gradient(90deg, ${C.dim} 0%, ${C.blue} 100%)`,
        }} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
export default function FamilyFeud() {
  const [phase, setPhase] = useState("setup");

  /* ── Persistent across rounds ── */
  const [title, setTitle]       = useState("FAMILY FEUD");
  const [teamNames, setTeamNames] = useState(["Team 1", "Team 2"]);
  const [totalScores, setTotalScores] = useState([0, 0]);

  /* ── Setup form ── */
  const [question, setQuestion]       = useState("");
  const [category, setCategory]       = useState("");
  const [drafts, setDrafts]           = useState([{ id: 1, text: "", count: "" }]);
  const [presetName, setPresetName]   = useState("");
  const [presets, setPresets]         = useState(readPresets);

  /* ── Active game ── */
  const [answers, setAnswers]         = useState([]);
  const [revealed, setRevealed]       = useState(new Set());
  const [teams, setTeams]             = useState([{ score: 0, strikes: 0 }, { score: 0, strikes: 0 }]);
  const [activeTeam, setActiveTeam]   = useState(0);
  const [hostInput, setHostInput]     = useState("");
  const [overrideId, setOverrideId]   = useState("");
  const [feedback, setFeedback]       = useState(null); // { type, msg }
  const [roundDone, setRoundDone]     = useState(false);
  const [roundWinner, setRoundWinner] = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    supabase
      .from("presets")
      .select("id, name, title, category, team_names, question, drafts")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setFeedback({ type: "wrong", msg: `Could not load online presets: ${error.message}` });
          return;
        }
        setPresets((data || []).map(preset => ({
          id: preset.id,
          name: preset.name,
          title: preset.title,
          category: preset.category,
          teamNames: preset.team_names,
          question: preset.question,
          drafts: preset.drafts,
        })));
      });
    return () => { cancelled = true; };
  }, []);

  /* ── Setup handlers ── */
  const addDraft = () => setDrafts(p => [...p, { id: Date.now(), text: "", count: "" }]);
  const updDraft = (id, k, v) => setDrafts(p => p.map(a => a.id === id ? { ...a, [k]: v } : a));
  const delDraft = id => setDrafts(p => p.filter(a => a.id !== id));

  const persistLocalPresets = next => {
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  };

  const getPresetData = () => ({
    name: presetName.trim() || title.trim() || "Untitled Game",
    title,
    category,
    team_names: teamNames,
    question,
    drafts: drafts.map(({ text, count }) => ({ text, count })),
  });

  const handleSavePreset = async () => {
    const presetData = getPresetData();
    const name = presetData.name;
    if (supabaseConfigured) {
      const { data, error } = await supabase
        .from("presets")
        .insert(presetData)
        .select("id, name, title, category, team_names, question, drafts")
        .single();
      if (error) {
        setFeedback({ type: "wrong", msg: `Could not save preset: ${error.message}` });
        return;
      }
      setPresets(p => [{
        id: data.id,
        name: data.name,
        title: data.title,
        category: data.category,
        teamNames: data.team_names,
        question: data.question,
        drafts: data.drafts,
      }, ...p]);
    } else {
      const preset = {
        id: Date.now(),
        ...presetData,
        teamNames: presetData.team_names,
      };
      delete preset.team_names;
      persistLocalPresets([preset, ...presets]);
    }
    setPresetName("");
    setFeedback({ type: "info", msg: `${supabaseConfigured ? "Saved online preset" : "Saved local preset"}: ${name}` });
  };

  const handleLoadPreset = preset => {
    setTitle(preset.title || "FAMILY FEUD");
    setCategory(preset.category || "");
    setTeamNames(preset.teamNames?.length === 2 ? preset.teamNames : ["Team 1", "Team 2"]);
    setQuestion(preset.question || "");
    const loadedDrafts = (preset.drafts || []).map((draft, index) => ({
      id: Date.now() + index,
      text: draft.text || "",
      count: draft.count ?? "",
    }));
    setDrafts(loadedDrafts.length ? loadedDrafts : [{ id: 1, text: "", count: "" }]);
    setFeedback({ type: "info", msg: `Loaded preset: ${preset.name}` });
  };

  const handleDeletePreset = async id => {
    if (supabaseConfigured) {
      const { error } = await supabase.from("presets").delete().eq("id", id);
      if (error) {
        setFeedback({ type: "wrong", msg: `Could not delete preset: ${error.message}` });
        return;
      }
    }
    persistLocalPresets(presets.filter(preset => preset.id !== id));
  };

  const handleStart = () => {
    const valid = drafts
      .filter(a => a.text.trim() && Number(a.count) > 0)
      .map(a => ({ id: a.id, text: a.text.trim(), count: Number(a.count) }))
      .sort((a, b) => b.count - a.count);
    if (!question.trim() || valid.length === 0) return;

    setAnswers(sortAnswersByPoints(valid));
    setTeams([{ score: 0, strikes: 0 }, { score: 0, strikes: 0 }]);
    setRevealed(new Set());
    setActiveTeam(0);
    setHostInput("");
    setOverrideId("");
    setFeedback(null);
    setRoundDone(false);
    setRoundWinner(null);
    setPhase("game");
    setTimeout(() => inputRef.current?.focus(), 120);
  };

  /* ── Game helpers ── */
  const playSound = useCallback((type = "generic") => {
    const sounds = {
      correct: [
        "/sounds/correct-1.wav",
        //"/sounds/correct-2.wav",
        //"/sounds/correct-3.wav",
        "/sounds/custom%20sounds/dragon-studio-correct-472358.mp3",
        "/sounds/custom%20sounds/dragon-studio-game-show-correct-tick-sound-416167.mp3",
        "/sounds/custom%20sounds/freesound_community-correct-6033.mp3",
      ],
      strike: [
        "/sounds/strike-1.wav",
        //"/sounds/strike-2.wav",
        //"/sounds/strike-3.wav",
        "/sounds/custom%20sounds/freesound_community-083239_rejectedwav-85967.mp3",
        "/sounds/custom%20sounds/freesound_community-wrong-47985.mp3",
        "/sounds/custom%20sounds/u_8iuwl7zrk0-error-170796.mp3",
        "/sounds/custom%20sounds/u_aqmi5p3o2s-bouton-mauvaise-reponse-559854.mp3",
        "/sounds/custom%20sounds/u_xbsb1clc8k-idgaf-your-banned-237890.mp3",
      ],
      generic: [
        "/sounds/generic-1.wav",
        //"/sounds/custom%20sounds/dragon-studio-game-show-correct-tick-sound-416167.mp3",
      ],
    };

    const pool = sounds[type] ?? sounds.generic;
    const url = pool[Math.floor(Math.random() * pool.length)];

    const audio = new Audio();
    audio.src = url;
    audio.preload = "auto";
    audio.volume = 0.45;
    audio.play().catch(() => undefined);
  }, []);

  const finishRound = useCallback((newRev, winnerLabel) => {
    setRoundDone(true);
    setRoundWinner(winnerLabel);

    if (winnerLabel === "TIE") return;

    const idx = Number.isInteger(winnerLabel) ? winnerLabel : null;
    if (idx !== null) {
      setTotalScores(p => p.map((s, i) => i === idx ? s + teams[idx].score : s));
    }
  }, [teams]);

  /* ── Check answer ── */
  const handleCheck = () => {
    if (!hostInput.trim() || roundDone) return;

    let best = null, bestScore = 0;
    for (const a of answers) {
      if (revealed.has(a.id)) continue;
      const s = fuzzy(hostInput, a.text);
      if (s > bestScore) { bestScore = s; best = a; }
    }

    if (best && bestScore >= THRESHOLD) {
      const newRev = new Set([...revealed, best.id]);
      const nextScores = teams.map((t, i) =>
        i === activeTeam ? t.score + best.count : t.score
      );
      setRevealed(newRev);
      setTeams(p => p.map((t, i) =>
        i === activeTeam ? { ...t, score: t.score + best.count } : t
      ));
      playSound("correct");
      setFeedback({ type: "correct", msg: `✓  "${best.text.toUpperCase()}"  —  +${best.count} points!` });
      if (newRev.size === answers.length) {
        const winner = getWinningTeamIndex(nextScores);
        setTimeout(() => finishRound(newRev, winner.tie ? "TIE" : winner.winnerIndex), 200);
      }
    } else {
      setTeams(p => p.map((t, i) =>
        i === activeTeam ? { ...t, strikes: Math.min(t.strikes + 1, 3) } : t
      ));
      playSound("strike");
      const dup = answers.find(a => revealed.has(a.id) && fuzzy(hostInput, a.text) >= THRESHOLD);
      if (dup) {
        setFeedback({ type: "info", msg: `"${dup.text}" is already on the board — strike added to ${teamNames[activeTeam]}.` });
      } else {
        setFeedback({ type: "wrong", msg: `✕  No match — ${teamNames[activeTeam]} gets a strike.` });
      }
    }

    setHostInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  /* ── Strike controls ── */
  const handleAddStrike = () => {
    if (roundDone) return;
    setTeams(p => p.map((t, i) =>
      i === activeTeam ? { ...t, strikes: Math.min(t.strikes + 1, 3) } : t
    ));
    playSound("strike");
    setFeedback({ type: "strike", msg: `✕  Strike added to ${teamNames[activeTeam]}` });
  };

  const handleUndoStrike = () => {
    setTeams(p => p.map((t, i) =>
      i === activeTeam ? { ...t, strikes: Math.max(t.strikes - 1, 0) } : t
    ));
  };

  /* ── Team switch ── */
  const handleSwitchTeam = (idx) => {
    if (roundDone) return;
    setActiveTeam(idx);
    setFeedback({ type: "info", msg: `Control passed to ${teamNames[idx]}` });
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  /* ── Manual reveal ── */
  const handleManualReveal = () => {
    if (!overrideId || roundDone) return;
    const ans = answers.find(a => String(a.id) === overrideId);
    if (!ans || revealed.has(ans.id)) return;
    const newRev = new Set([...revealed, ans.id]);
    const nextScores = teams.map((t, i) =>
      i === activeTeam ? t.score + ans.count : t.score
    );
    setRevealed(newRev);
    setTeams(p => p.map((t, i) =>
      i === activeTeam ? { ...t, score: t.score + ans.count } : t
    ));
    playSound("correct");
    setFeedback({ type: "correct", msg: `✓  "${ans.text.toUpperCase()}"  —  +${ans.count} points!` });
    setOverrideId("");
    if (newRev.size === answers.length) {
      const winner = getWinningTeamIndex(nextScores);
      setTimeout(() => finishRound(newRev, winner.tie ? "TIE" : winner.winnerIndex), 200);
    }
  };

  /* ── Reveal all ── */
  const handleRevealAll = () => {
    const newRev = new Set(answers.map(a => a.id));
    setRevealed(newRev);
    const winner = getWinningTeamIndex(teams.map(t => t.score));
    finishRound(newRev, winner.tie ? "TIE" : winner.winnerIndex);
    setFeedback({ type: "info", msg: winner.tie ? "All answers revealed — tie game!" : "All answers revealed!" });
  };

  /* ── New round ── */
  const handleNewRound = () => {
    setDrafts([{ id: 1, text: "", count: "" }]);
    setQuestion("");
    setCategory("");
    setPhase("setup");
    setFeedback(null);
    setRoundDone(false);
    setRoundWinner(null);
  };

  const handleResetScores = () => setTotalScores([0, 0]);

  /* ── Computed ── */
  const sortedAnswers = sortAnswersByPoints(answers);
  const totalPts   = answers.reduce((s, a) => s + a.count, 0);
  const unrevealed = answers.filter(a => !revealed.has(a.id));
  const roundWinnerLabel = roundWinner === "TIE"
    ? "TIE"
    : roundWinner !== null
      ? teamNames[roundWinner].toUpperCase()
      : null;

  const fbStyle = {
    correct: { bg: "rgba(34,197,94,0.12)",  border: "#22c55e", color: "#4ade80" },
    strike:  { bg: "rgba(230,57,70,0.12)",  border: C.red,     color: "#f87171" },
    wrong:   { bg: "rgba(230,57,70,0.12)",  border: C.red,     color: "#f87171" },
    info:    { bg: "rgba(96,165,250,0.10)", border: "#60a5fa", color: "#93c5fd" },
    win:     { bg: "rgba(245,200,66,0.12)", border: C.gold,    color: C.gold    },
  };

  /* ══════════════════════════════════════════
     SETUP SCREEN
  ══════════════════════════════════════════ */
  if (phase === "setup") {
    return (
      <div style={{
        minHeight: "100vh", background: C.bg, color: C.white,
        fontFamily: "'Open Sans', sans-serif",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "28px 16px 48px", gap: 24,
      }}>
        <style>{ANIM}</style>

        {/* Logo */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 42, fontWeight: 700,
            fontFamily: "'Oswald', sans-serif",
            color: C.gold, letterSpacing: 6,
            textShadow: `0 0 40px ${C.goldGlow}, 0 2px 4px rgba(0,0,0,0.5)`,
          }}>
            ⭐ {title} ⭐
          </div>
          <div style={{
            fontSize: 12, color: C.muted, letterSpacing: 3,
            fontFamily: "'Oswald', sans-serif", marginTop: 4,
            textTransform: "uppercase",
          }}>
            Host Setup Panel
          </div>
        </div>

        {/* Persistent score banner */}
        {(totalScores[0] > 0 || totalScores[1] > 0) && (
          <div style={{
            background: C.panel, border: `1.5px solid ${C.dim}`,
            borderRadius: 12, padding: "12px 20px",
            display: "flex", alignItems: "center", gap: 24,
            width: "100%", maxWidth: 600,
          }}>
            <div style={{ fontSize: 12, color: C.muted, flex: 1, fontFamily: "'Oswald', sans-serif", letterSpacing: 2 }}>
              RUNNING SCORE
            </div>
            {[0, 1].map(i => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: C.muted }}>{teamNames[i]}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.gold, fontFamily: "'Oswald', sans-serif" }}>
                  {totalScores[i]}
                </div>
              </div>
            ))}
            <button onClick={handleResetScores} style={ghostBtn}>Reset</button>
          </div>
        )}

        {/* Setup card */}
        <div style={{
          width: "100%", maxWidth: 600,
          background: C.panel,
          border: `1.5px solid ${C.dim}`,
          borderRadius: 16, padding: "24px 28px",
          display: "flex", flexDirection: "column", gap: 22,
        }}>
          {/* Game title */}
          <Field label="Game Title">
            <input
              style={iStyle}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="FAMILY FEUD"
            />
          </Field>

          {/* Team names */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[0, 1].map(i => (
              <Field key={i} label={`Team ${i + 1} Name`}>
                <input
                  style={iStyle}
                  value={teamNames[i]}
                  onChange={e => setTeamNames(p => p.map((n, j) => j === i ? e.target.value : n))}
                  placeholder={`Team ${i + 1}`}
                />
              </Field>
            ))}
          </div>

          {/* Question */}
          <Field label="Survey Question">
            <input
              style={{ ...iStyle, fontSize: 15 }}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="We asked 100 people…"
            />
          </Field>

          {/* Category */}
          <Field label="Category">
            <input
              style={iStyle}
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="Movies, holidays, family…"
            />
          </Field>

          {/* Answers */}
          <div>
            <div style={labelSt}>Survey Answers</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
              Enter each answer and how many survey respondents said it (used as point value).
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {drafts.map((ans, idx) => (
                <div key={ans.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: C.muted, fontSize: 13, minWidth: 20, textAlign: "right", fontFamily: "'Oswald', sans-serif" }}>
                    {idx + 1}
                  </span>
                  <input
                    style={{ ...iStyle, flex: 1 }}
                    value={ans.text}
                    onChange={e => updDraft(ans.id, "text", e.target.value)}
                    placeholder="Answer…"
                  />
                  <input
                    style={{ ...iStyle, width: 72, textAlign: "center" }}
                    value={ans.count}
                    onChange={e => updDraft(ans.id, "count", e.target.value)}
                    placeholder="pts"
                    type="number"
                    min="1"
                  />
                  {drafts.length > 1 && (
                    <button
                      onClick={() => delDraft(ans.id)}
                      style={{ background: "none", border: "none", color: C.red, fontSize: 22, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
                    >×</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addDraft} style={{ ...ghostBtn, marginTop: 10 }}>
              + Add Answer
            </button>
          </div>

          <button
            onClick={handleStart}
            disabled={!question.trim() || drafts.filter(a => a.text.trim() && Number(a.count) > 0).length === 0}
            style={{
              background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldDark} 100%)`,
              border: "none", color: C.bg,
              padding: "15px 32px", borderRadius: 10,
              fontSize: 18, fontWeight: 700,
              fontFamily: "'Oswald', sans-serif",
              cursor: "pointer", letterSpacing: 3,
              textTransform: "uppercase",
              boxShadow: `0 4px 24px ${C.goldGlow}`,
              opacity: (!question.trim() || drafts.filter(a => a.text.trim() && Number(a.count) > 0).length === 0) ? 0.45 : 1,
              transition: "opacity 0.2s, filter 0.2s",
            }}
          >
            ▶  Start Game
          </button>

          {/* Saved presets */}
          <div style={{ borderTop: `1px solid ${C.dim}`, paddingTop: 18 }}>
            <div style={labelSt}>Saved Game Presets</div>
            {supabaseConfigured && (
              <div style={{ fontSize: 11, color: C.green, marginBottom: 10 }}>
                Connected to online preset storage
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                style={{ ...iStyle, flex: 1 }}
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                placeholder="Preset name (optional)"
              />
              <ActionBtn
                label="Save Preset"
                color={C.blueLight}
                disabled={!question.trim() && !drafts.some(a => a.text.trim())}
                onClick={handleSavePreset}
              />
            </div>
            {presets.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted }}>No saved presets yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {presets.map(preset => (
                  <div key={preset.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: C.blue, border: `1px solid ${C.dim}`,
                    borderRadius: 8, padding: "8px 10px",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.white, fontWeight: 600, fontSize: 13 }}>{preset.name}</div>
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                        {preset.category || "Uncategorized"} · {preset.drafts?.filter(a => a.text).length || 0} answers
                      </div>
                    </div>
                    <ActionBtn label="Load" color={C.green} textColor={C.bg} onClick={() => handleLoadPreset(preset)} />
                    <ActionBtn label="Delete" color={C.red} onClick={() => handleDeletePreset(preset.id)} />
                  </div>
                ))}
              </div>
            )}
            {feedback && (
              <div style={{
                marginTop: 10, padding: "9px 12px", borderRadius: 8,
                background: fbStyle[feedback.type]?.bg ?? "rgba(96,165,250,0.1)",
                border: `1.5px solid ${fbStyle[feedback.type]?.border ?? "#60a5fa"}`,
                color: fbStyle[feedback.type]?.color ?? "#93c5fd",
                fontSize: 13, textAlign: "center",
              }}>
                {feedback.msg}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════
     GAME SCREEN
  ══════════════════════════════════════════ */
  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.white,
      fontFamily: "'Open Sans', sans-serif",
      display: "flex", flexDirection: "column",
      padding: "12px 12px 16px", gap: 10,
    }}>
      <style>{ANIM}</style>

      {/* Header */}
      <div style={{ textAlign: "center", paddingBottom: 4 }}>
        <div style={{
          fontSize: 28, fontWeight: 700,
          fontFamily: "'Oswald', sans-serif",
          color: C.gold, letterSpacing: 5,
          textShadow: `0 0 30px ${C.goldGlow}`,
        }}>
          ⭐  {title}  ⭐
        </div>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 3, fontFamily: "'Oswald', sans-serif" }}>
          HOST PANEL
        </div>
      </div>

      {/* Round-over banner */}
      {roundDone && (
        <div style={{
          background: roundWinner !== null
            ? `linear-gradient(90deg, rgba(245,200,66,0.18) 0%, rgba(245,200,66,0.06) 100%)`
            : "rgba(96,165,250,0.1)",
          border: `2px solid ${roundWinner !== null ? C.gold : "#60a5fa"}`,
          borderRadius: 12, padding: "12px 20px",
          textAlign: "center",
          animation: "slideUp 0.4s ease-out",
        }}>
          {roundWinner !== null ? (
            <>
              <span style={{ fontSize: 20, marginRight: 8 }}>{roundWinner === "TIE" ? "🤝" : "🏆"}</span>
              <span style={{
                fontSize: 18, fontWeight: 700, color: roundWinner === "TIE" ? "#93c5fd" : C.gold,
                fontFamily: "'Oswald', sans-serif", letterSpacing: 2,
              }}>
                {roundWinner === "TIE" ? "TIE GAME!" : `${roundWinnerLabel} WINS THIS ROUND!`}
              </span>
              <span style={{ fontSize: 20, marginLeft: 8 }}>{roundWinner === "TIE" ? "🤝" : "🏆"}</span>
            </>
          ) : (
            <span style={{ fontSize: 16, color: "#93c5fd", fontFamily: "'Oswald', sans-serif" }}>
              Round Over — All Answers Revealed
            </span>
          )}
        </div>
      )}

      {/* 3-column layout */}
      <div style={{
        display: "flex", gap: 10, flex: 1,
        alignItems: "flex-start",
        minHeight: 0,
      }}>
        {/* Team 1 */}
        <TeamPanel
          name={teamNames[0]}
          team={teams[0]}
          isActive={activeTeam === 0}
          side="left"
          onActivate={() => handleSwitchTeam(0)}
          roundDone={roundDone}
        />

        {/* Answer board */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
          {/* Question banner */}
          <div style={{
            background: `linear-gradient(135deg, ${C.blue} 0%, ${C.blueMid} 100%)`,
            border: `2px solid ${C.gold}`,
            borderRadius: 12, padding: "12px 18px",
            textAlign: "center",
            boxShadow: `0 0 30px ${C.goldGlow}`,
          }}>
            <div style={{
              fontSize: 11, color: C.gold, letterSpacing: 3,
              fontFamily: "'Oswald', sans-serif", marginBottom: 6,
            }}>
              {category ? `${category.toUpperCase()}  ·  ` : ""}SURVEY SAYS…
            </div>
            <div style={{
              fontSize: 16, fontWeight: 600, color: C.white, lineHeight: 1.4,
            }}>
              {question}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
              {revealed.size}/{answers.length} revealed  ·  {totalPts} pts on the board
            </div>
          </div>

          {/* Tiles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {sortedAnswers.map((ans, idx) => (
              <AnswerTile
                key={ans.id}
                answer={ans}
                isRevealed={revealed.has(ans.id)}
                rank={idx + 1}
              />
            ))}
          </div>
        </div>

        {/* Team 2 */}
        <TeamPanel
          name={teamNames[1]}
          team={teams[1]}
          isActive={activeTeam === 1}
          side="right"
          onActivate={() => handleSwitchTeam(1)}
          roundDone={roundDone}
        />
      </div>

      {/* Host control panel */}
      <div style={{
        background: C.panel,
        border: `1.5px solid ${C.blueLight}`,
        borderRadius: 14, padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 11,
      }}>
        {/* Label */}
        <div style={{
          fontSize: 10, color: C.gold,
          fontFamily: "'Oswald', sans-serif",
          letterSpacing: 3, textAlign: "center",
          textTransform: "uppercase",
        }}>
          Host Controls  —  {teamNames[activeTeam]} is Active
        </div>

        {/* Answer input row */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={inputRef}
            className="host-input"
            style={{
              flex: 1, background: C.blue,
              border: `2px solid ${C.blueLight}`,
              borderRadius: 8, color: C.white,
              padding: "10px 14px", fontSize: 16,
              outline: "none", fontFamily: "'Open Sans', sans-serif",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
            value={hostInput}
            onChange={e => setHostInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCheck()}
            placeholder="Type contestant's answer, press Enter or Check…"
            disabled={roundDone}
          />
          <button
            className="btn-check"
            onClick={handleCheck}
            disabled={roundDone || !hostInput.trim()}
            style={{
              background: roundDone || !hostInput.trim()
                ? C.dim
                : `linear-gradient(135deg, #22c55e 0%, #16a34a 100%)`,
              border: "none", color: roundDone || !hostInput.trim() ? C.muted : C.white,
              padding: "10px 20px", borderRadius: 8,
              fontSize: 14, fontWeight: 700,
              fontFamily: "'Oswald', sans-serif",
              cursor: roundDone || !hostInput.trim() ? "not-allowed" : "pointer",
              letterSpacing: 1.5, whiteSpace: "nowrap",
              transition: "background 0.2s, filter 0.2s, transform 0.1s",
            }}
          >
            CHECK ✓
          </button>
        </div>

        {/* Control buttons row */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <ActionBtn
            label="✕  Add Strike"
            color={C.red}
            disabled={roundDone}
            onClick={handleAddStrike}
          />
          <ActionBtn
            label="↩  Undo Strike"
            color={C.blueLight}
            disabled={false}
            onClick={handleUndoStrike}
          />

          <div style={{ width: 1, height: 26, background: C.dim, margin: "0 2px" }} />

          <span style={{ fontSize: 11, color: C.muted, fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>
            PASS TO:
          </span>
          {[0, 1].map(i => (
            <ActionBtn
              key={i}
              label={teamNames[i]}
              color={activeTeam === i ? C.gold : C.blueLight}
              textColor={activeTeam === i ? C.bg : C.white}
              disabled={roundDone}
              onClick={() => handleSwitchTeam(i)}
            />
          ))}

          <div style={{ flex: 1 }} />

          <ActionBtn
            label="Reveal All"
            color={C.blueLight}
            disabled={roundDone}
            onClick={handleRevealAll}
          />

          {roundDone && (
            <ActionBtn
              label="▶  New Round"
              color={C.gold}
              textColor={C.bg}
              disabled={false}
              onClick={handleNewRound}
            />
          )}
        </div>

        {/* Manual reveal row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, fontFamily: "'Oswald', sans-serif", letterSpacing: 1 }}>
            OVERRIDE:
          </span>
          <select
            value={overrideId}
            onChange={e => setOverrideId(e.target.value)}
            disabled={roundDone}
            style={{
              flex: 1, background: C.blue,
              border: `1.5px solid ${C.blueLight}`,
              color: C.white, padding: "7px 10px",
              borderRadius: 8, fontSize: 13,
              fontFamily: "'Open Sans', sans-serif",
              outline: "none",
            }}
          >
            <option value="">— Manually reveal a specific answer —</option>
            {unrevealed.map(a => (
              <option key={a.id} value={String(a.id)}>
                {a.text}  ({a.count} pts)
              </option>
            ))}
          </select>
          <ActionBtn
            label="Reveal"
            color={overrideId && !roundDone ? C.blueLight : C.dim}
            disabled={!overrideId || roundDone}
            onClick={handleManualReveal}
          />
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className={feedback.type === "wrong" || feedback.type === "strike" ? "feedback-wrong" : "feedback-correct"}
            style={{
              padding: "10px 16px", borderRadius: 8,
              background: fbStyle[feedback.type]?.bg ?? "rgba(96,165,250,0.1)",
              border: `1.5px solid ${fbStyle[feedback.type]?.border ?? "#60a5fa"}`,
              color: fbStyle[feedback.type]?.color ?? "#93c5fd",
              fontSize: 15, fontWeight: 600,
              fontFamily: "'Oswald', sans-serif",
              textAlign: "center", letterSpacing: 0.5,
            }}
          >
            {feedback.msg}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function Field({ label, children }) {
  return (
    <div>
      <div style={labelSt}>{label}</div>
      {children}
    </div>
  );
}

function ActionBtn({ label, color, textColor, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? C.dim : color,
        border: "none",
        color: disabled ? C.muted : (textColor ?? C.white),
        padding: "7px 13px", borderRadius: 8,
        fontSize: 12, fontWeight: 700,
        fontFamily: "'Oswald', sans-serif",
        cursor: disabled ? "not-allowed" : "pointer",
        letterSpacing: 0.8,
        opacity: disabled ? 0.55 : 1,
        transition: "opacity 0.2s, filter 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

const labelSt = {
  fontSize: 11, color: "#4a6a9a",
  fontFamily: "'Oswald', sans-serif",
  letterSpacing: 2, textTransform: "uppercase",
  marginBottom: 7,
};

const iStyle = {
  width: "100%",
  background: "#0f2650",
  border: "1.5px solid #1e4490",
  borderRadius: 8,
  color: "#f0f6ff",
  padding: "9px 12px",
  fontSize: 14,
  outline: "none",
  fontFamily: "'Open Sans', sans-serif",
};

const ghostBtn = {
  background: "transparent",
  border: "1.5px solid #1e4490",
  color: "#4a6a9a",
  padding: "7px 14px",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "'Open Sans', sans-serif",
};
