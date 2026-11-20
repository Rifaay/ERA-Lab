import { useState, useRef, useEffect } from "react";
import { getAthletes, getRange, saveRange, saveSession, getReviews, saveReview, uid } from "../storage";
import { putClip } from "../clipStore";
import { clipName, quickReview, shotOf, refreshShots } from "../clips";
import Recorder from "../Recorder";
import QuickTag from "../QuickTag";
import { useApp } from "../context";
import { ringOf } from "../insights";
import Icon from "../icons";
import { FACES, RING_FILL, rings, spotsOf, scoreOf, loupeAt, scoreKeys, scoreValue, newSession, record, undoLast, summary, finish } from "../range";
import Scorecard from "./Scorecard";
import { scorecardFile } from "../scorecardFile";
import { localize } from "../digits";

// Stored values stay in English whatever the screen language; labels come from the translations by position.
const WINDS = ["Calm", "Light", "Moderate", "Strong", "Gusty"];
const WIND_DIRS = ["Head", "Tail", "From left", "From right", "Variable"];
const LIGHTS = ["Sunny", "Cloudy", "Indoor", "Floodlights"];
const ROUTINES = ["Yes", "Partly", "No"];
const TYPES = ["Technical", "Physical", "Mental", "Competition", "Mixed"];
const KEPT = ["distance", "face", "perEnd", "type", "place", "light", "bow", "drawWeight", "arrows", "drawLength", "eqNotes"]; // rarely change between sessions
const BLANK = { distance: "70", face: "122", perEnd: "6", type: "Technical", place: "", wind: "Calm", windFrom: "", temp: "", light: "Sunny",
  bow: "", drawWeight: "", arrows: "", drawLength: "", eqNotes: "", readiness: null, confidence: null, focus: null, energy: null, sleep: "", goal: "" };

// Saves the scorecard rendered (hidden) on the done screen as one standalone, interactive web file.
const downloadScorecard = (host, s, lang) => {
  const title = `Scorecard ${s.session_id}`;
  host = host.cloneNode(true); localize(host, lang); // a copy: the hidden original stays as React drew it
  const url = URL.createObjectURL(new Blob([scorecardFile(host.innerHTML, { lang, title })], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${title}.html`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

function Scale({ n, value, onChange }) {
  return (
    <div className="rg-scale">
      {Array.from({ length: n }, (_, i) => i + 1).map((i) => (
        <button key={i} type="button" className={`chip ${value === i ? "active" : ""}`} aria-pressed={value === i} onClick={() => onChange(value === i ? null : i)}>{i}</button>
      ))}
    </div>
  );
}

function Choice({ values, labels, value, onChange }) {
  return (
    <div className="rg-chips">
      {values.map((v, i) => (
        <button key={v} type="button" className={`chip ${value === v ? "active" : ""}`} aria-pressed={value === v} onClick={() => onChange(value === v ? "" : v)}>{labels[i]}</button>
      ))}
    </div>
  );
}

// Press, slide, lift. A fingertip covers about three rings on a phone, so the loupe shows the spot under the finger at 3x.
// Only a touch that starts on the face plots: one that starts on the white around it scrolls the page as usual.
const GAP = 220; // 3-spot: centre to centre, in the same units as a spot's radius (100)
const ON_FACE = 1.04; // a little past the edge, for a finger on the outer line
function Target({ face, label, arrows, pick, onHit }) {
  const ref = useRef(null);
  const [aim, setAim] = useState(null);
  const n = rings(face), spots = spotsOf(face), Z = 15, g = 1.4;
  const top = -(spots - 1) * GAP / 2; // centre of the first spot
  const spotY = (k) => top + k * GAP;

  // Screen point → the nearest spot and the position on it, in spot radii (y up).
  const local = (clientX, clientY) => {
    const svg = ref.current, pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const k = Math.max(0, Math.min(spots - 1, Math.round((p.y - top) / GAP)));
    return { k, x: p.x / 100, y: -(p.y - spotY(k)) / 100 };
  };
  const onFace = (clientX, clientY) => { const q = local(clientX, clientY); return Math.hypot(q.x, q.y) <= ON_FACE; };
  const at = (ev) => {
    const q = local(ev.clientX, ev.clientY), box = ref.current.getBoundingClientRect();
    const clamp = (v) => Math.max(-1.08, Math.min(1.08, v)); // a miss off the face stays visible on the edge
    return { k: q.k, x: clamp(q.x), y: clamp(q.y), ...loupeAt(ev.clientX - box.left, ev.clientY - box.top, box.width, box.top) };
  };

  // The page may scroll (touch-action: pan-y), so a touch that starts on the face cancels scrolling for that touch.
  useEffect(() => {
    const svg = ref.current;
    const stop = (e) => { const t = e.touches[0]; if (t && onFace(t.clientX, t.clientY)) e.preventDefault(); };
    svg.addEventListener("touchstart", stop, { passive: false });
    return () => svg.removeEventListener("touchstart", stop);
  });

  const down = (ev) => {
    if (!onFace(ev.clientX, ev.clientY)) return;
    ev.preventDefault(); ref.current.setPointerCapture(ev.pointerId); setAim(at(ev));
  };
  const move = (ev) => { if (aim) setAim(at(ev)); };
  const up = (ev) => {
    if (!aim) return;
    const p = at(ev), x = +p.x.toFixed(4), y = +p.y.toFixed(4);
    setAim(null); onHit({ x, y, score: scoreOf(face, x, y), ...(spots > 1 && { spot: p.k }) });
  };

  const rest = (a) => spotY(spots > 1 ? (a.spot ?? 1) : 0); // older 3-spot arrows have no spot: the middle one
  const drawing = (
    <>
      {Array.from({ length: spots }, (_, k) => (
        <g key={k} transform={`translate(0 ${spotY(k)})`}>
          {Array.from({ length: n }, (_, i) => <circle key={i} r={(100 * (n - i)) / n} fill={RING_FILL[10 - n + i]} stroke={10 - n + i < 2 ? "#222" : 10 - n + i < 4 ? "#bbb" : "#111"} strokeWidth=".6" />)}
          <circle r={50 / n} fill="none" stroke="#111" strokeWidth=".4" />
          <line x1="-3" x2="3" stroke="#111" strokeWidth=".5" /><line y1="-3" y2="3" stroke="#111" strokeWidth=".5" />
        </g>
      ))}
      {arrows.map((a, i) => (a.x == null || (aim && i === pick) ? null : (
        <g key={i}>
          <circle cx={a.x * 100} cy={rest(a) - a.y * 100} r={i === pick ? 4.5 : 3.4} fill={i === pick ? "#00e0c6" : "#00b8a3"} stroke="#000" strokeWidth="1" />
          <text x={a.x * 100 + 5} y={rest(a) - a.y * 100 - 5} fontSize="8" fill="#000" fontFamily="monospace">{a.arrow}</text>
        </g>
      )))}
      {aim && <><circle cx={aim.x * 100} cy={spotY(aim.k) - aim.y * 100} r="2.2" fill="none" stroke="#f2c40c" strokeWidth="1.1" /><circle cx={aim.x * 100} cy={spotY(aim.k) - aim.y * 100} r="3.3" fill="none" stroke="#000" strokeWidth=".6" /></>}
    </>
  );
  const cx = aim ? aim.x * 100 : 0, cy = aim ? spotY(aim.k) - aim.y * 100 : 0;
  const cross = (w, c) => (
    <g stroke={c} strokeWidth={w}>
      <line x1={cx - Z} x2={cx - g} y1={cy} y2={cy} /><line x1={cx + g} x2={cx + Z} y1={cy} y2={cy} />
      <line x1={cx} x2={cx} y1={cy - Z} y2={cy - g} /><line x1={cx} x2={cx} y1={cy + g} y2={cy + Z} />
    </g>
  );

  return (
    <div className={`rg-target ${spots > 1 ? "spots" : ""}`} dir="ltr">
      <p className="rg-face">{label}</p>
      <svg ref={ref} viewBox={`-110 ${top - 110} 220 ${220 + (spots - 1) * GAP}`} role="img" aria-label={label} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setAim(null)}>{drawing}</svg>
      {aim && (
        <svg className="rg-loupe" style={{ left: aim.lx, top: aim.ly, width: aim.size }} viewBox={`${cx - Z} ${cy - Z} ${2 * Z} ${2 * Z}`} aria-hidden="true">
          {drawing}{cross(0.7, "#000")}{cross(0.3, "#fff")}
          <text x={cx} y={cy + Z - 3} fontSize="5.5" fontWeight="700" textAnchor="middle" fill="#f2c40c" stroke="#000" strokeWidth=".5" paintOrder="stroke" fontFamily="monospace">{scoreOf(face, aim.x, aim.y)}</text>
        </svg>
      )}
    </div>
  );
}

export default function Range({ tr, lang, selectedId }) {
  const r = tr.range;
  const { setSelectedId } = useApp();
  const athlete = getAthletes().find((a) => a.id === selectedId) || null;

  const [live, setLive] = useState(() => getRange().live || null);
  const [step, setStep] = useState(() => (getRange().live ? "range" : "setup"));
  const [setup, setSetup] = useState(() => ({ ...BLANK, ...(getRange().setups?.[selectedId] || {}) }));
  const [view, setView] = useState(() => Math.max(0, (getRange().live?.ends.length || 1) - 1));
  const [pick, setPick] = useState(null);
  const [pad, setPad] = useState(false);
  const [note, setNote] = useState("");
  const [savedEntry, setSavedEntry] = useState(null);
  const noteTimer = useRef(0);
  const cardRef = useRef(null);
  const [filming, setFilming] = useState(false);
  const [tagId, setTagId] = useState(null); // the clip just linked, offered for a quick tag

  const say = (text) => { setNote(text); clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNote(""), 1800); };
  const set = (k, v) => setSetup((f) => ({ ...f, [k]: v }));
  // Every change goes to storage at once: a refresh or a phone call must not cost the session.
  // Reads the stored session, not this render's copy: a clip can finish saving after newer arrows were plotted.
  const change = (fn) => { const s = structuredClone(getRange().live); const out = fn(s); setLive(s); saveRange({ ...getRange(), live: s }); return out; };

  // A finished clip is stored on the phone at once, then waits for the next arrow plotted (or re-scored).
  const clipDone = async ({ blob, mime, recordedAt, durationS }) => {
    setFilming(false);
    const id = clipName(athlete.name, recordedAt, mime);
    try {
      await putClip({ id, athleteId: athlete.id, blob, mime, size: blob.size, durationS, recordedAt, savedOut: false });
    } catch (e) { window.alert(`${r.clipFailed}\n${e.message}`); return; }
    navigator.storage?.persist?.(); // ask the browser not to clear ERA Lab's storage when the phone runs low
    saveReview(quickReview({ id, athlete, at: recordedAt }));
    change((s) => { s.pendingClip = id; });
    say(r.clipWaiting);
  };
  const linkClip = (s, endIndex, arrowIndex) => {
    if (!s.pendingClip) return null;
    const id = s.pendingClip, shot = shotOf(s, endIndex, arrowIndex);
    delete s.pendingClip;
    const rv = getReviews().find((x) => x.id === id);
    if (rv && shot) saveReview({ ...rv, shot });
    return id;
  };

  const start = () => {
    const s = newSession({ athlete, setup });
    const store = getRange();
    saveRange({ live: s, setups: { ...store.setups, [athlete.id]: Object.fromEntries(KEPT.map((k) => [k, setup[k]])) } });
    setLive(s); setView(0); setPick(null); setSavedEntry(null); setStep("range");
  };
  const hit = (h) => {
    const out = change((s) => {
      const o = record(s, view, pick, h);
      if (!o.refused) o.linked = linkClip(s, o.view, pick != null ? pick : s.ends[o.view].arrows.length - 1);
      return o;
    });
    if (out.refused) { say(out.refused === "double" ? r.refusedDouble : r.refusedFull); return; }
    setView(out.view); setPick(null); navigator.vibrate?.(30);
    if (out.linked) { setTagId(out.linked); say(r.clipLinked); }
  };
  const undo = () => {
    const v = change((s) => undoLast(s));
    if (v == null) { say(r.nothingToUndo); return; }
    setView(v); setPick(null); say(r.removed);
  };
  const nextEnd = () => {
    if (view < live.ends.length - 1) setView(view + 1);
    else if (live.ends[view].arrows.length) { change((s) => { s.ends.push({ end: s.ends.length + 1, focus: null, routine: null, notes: "", arrows: [] }); }); setView(view + 1); }
    setPick(null);
  };
  const save = () => {
    const entry = finish(structuredClone(live), uid());
    delete entry.range.pendingClip; // a clip still waiting stays in the library without an arrow
    saveSession(entry);
    const reviews = getReviews(), fresh = refreshShots(reviews, entry.range); // clips take their arrows' final scores
    fresh.forEach((x, i) => { if (x !== reviews[i]) saveReview(x); });
    setTagId(null);
    saveRange({ ...getRange(), live: null });
    setLive(null); setSavedEntry(entry); setStep("done");
  };
  const discard = () => {
    if (!window.confirm(r.confirmDiscard)) return;
    saveRange({ ...getRange(), live: null }); setLive(null); setStep("setup");
  };

  if (live && live.athlete_id !== selectedId) return (
    <div className="screen" key={step}>
      <div className="card">
        <p style={{ marginBottom: 10 }}>{fill(r.otherAthlete, { name: live.athlete })}</p>
        <button className="btn-primary" onClick={() => setSelectedId(live.athlete_id)}>{r.resume}</button>
      </div>
    </div>
  );
  if (!athlete) return (
    <div className="screen" key={step}><div className="no-athlete"><div className="no-athlete-icon"><Icon name="target" size={56} /></div><div className="no-athlete-text">{r.noAthlete}</div></div></div>
  );

  const stepIndex = { setup: 0, range: 1, review: 2, done: 2 }[step];
  const header = (
    <>
      <h2>{r.title} — {athlete.name}</h2>
      <ol className="rg-steps">
        {r.steps.map((label, i) => <li key={label} className={i === stepIndex ? "on" : i < stepIndex ? "done" : ""} aria-current={i === stepIndex ? "step" : undefined}>{i + 1} · {label}</li>)}
      </ol>
    </>
  );

  if (step === "setup") return (
    <div className="screen" key={step}>
      {header}
      <div className="card">
        <div className="form">
          <div className="form-row">
            <label>{r.distance}
              <select value={setup.distance} onChange={(e) => set("distance", e.target.value)}>{[18, 30, 50, 70, 10, 20, 40, 60, 90].map((d) => <option key={d}>{d}</option>)}</select>
            </label>
            <label>{r.face}
              <select value={setup.face} onChange={(e) => set("face", e.target.value)}>{FACES.map((f) => <option key={f} value={f}>{r.faces[f]}</option>)}</select>
            </label>
            <label>{r.perEnd}
              <select value={setup.perEnd} onChange={(e) => set("perEnd", e.target.value)}>{[6, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}</select>
            </label>
            <label>{r.type}
              <select value={setup.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map((t, i) => <option key={t} value={t}>{tr.session.types[i]}</option>)}</select>
            </label>
          </div>
        </div>
      </div>

      <details className="card rg-fold">
        <summary>{r.checkIn}</summary>
        <div className="form">
          {["readiness", "confidence", "focus", "energy"].map((k) => (
            <div key={k}><label>{r[k]}</label><Scale n={10} value={setup[k]} onChange={(v) => set(k, v)} /></div>
          ))}
          <div className="form-row">
            <label>{r.sleep}<input inputMode="decimal" value={setup.sleep} onChange={(e) => set("sleep", e.target.value)} /></label>
            <label>{r.goal}<input value={setup.goal} onChange={(e) => set("goal", e.target.value)} placeholder={r.goalPh} /></label>
          </div>
        </div>
      </details>

      <details className="card rg-fold">
        <summary>{r.more}</summary>
        <div className="form">
          <p>{r.remembered}</p>
          <div><label>{r.wind}</label><Choice values={WINDS} labels={r.winds} value={setup.wind} onChange={(v) => set("wind", v)} /></div>
          <div><label>{r.windFrom}</label><Choice values={WIND_DIRS} labels={r.windDirs} value={setup.windFrom} onChange={(v) => set("windFrom", v)} /></div>
          <div className="form-row">
            <label>{r.temp}<input inputMode="decimal" value={setup.temp} onChange={(e) => set("temp", e.target.value)} /></label>
            <label>{r.light}
              <select value={setup.light} onChange={(e) => set("light", e.target.value)}>{LIGHTS.map((l, i) => <option key={l} value={l}>{r.lights[i]}</option>)}</select>
            </label>
            <label>{r.place}<input value={setup.place} onChange={(e) => set("place", e.target.value)} /></label>
          </div>
          <div className="form-row">
            <label>{r.bow}<input value={setup.bow} onChange={(e) => set("bow", e.target.value)} /></label>
            <label>{r.drawWeight}<input inputMode="decimal" value={setup.drawWeight} onChange={(e) => set("drawWeight", e.target.value)} /></label>
            <label>{r.arrowsEq}<input value={setup.arrows} onChange={(e) => set("arrows", e.target.value)} /></label>
            <label>{r.drawLength}<input inputMode="decimal" value={setup.drawLength} onChange={(e) => set("drawLength", e.target.value)} /></label>
          </div>
          <label>{r.eqNotes}<input value={setup.eqNotes} onChange={(e) => set("eqNotes", e.target.value)} /></label>
        </div>
      </details>

      <button className="btn-primary rg-wide" onClick={start}>{r.start}</button>
    </div>
  );

  if (step === "done") return (
    <div className="screen" key={step}>
      {header}
      <div className="card">
        <p className="success-msg">{r.saved}</p>
        <p style={{ margin: "10px 0" }}>{r.fileNote}</p>
        <div className="btn-row">
          <button className="btn-ghost" onClick={() => downloadScorecard(cardRef.current, savedEntry.range, lang)}>{r.file}</button>
          <button className="btn-primary" onClick={() => setStep("setup")}>{r.newSession}</button>
        </div>
      </div>
      <div hidden ref={cardRef}><Scorecard s={savedEntry.range} tr={tr} lang={lang} /></div>
    </div>
  );

  const e = live.ends[view], per = live.context.arrows_per_end, face = live.context.face;
  const endSum = (x) => x.arrows.reduce((t, a) => t + scoreValue(a.score), 0);
  const shown = pick != null ? e.arrows[pick] : e.arrows[e.arrows.length - 1]; // the arrow the feel and note apply to
  const shownIndex = shown ? e.arrows.indexOf(shown) : -1;

  if (step === "review") {
    const sum = summary(live);
    return (
      <div className="screen" key={step}>
        {header}
        <div className="card">
          <h3>{r.summary}</h3>
          <div className="rg-total">{sum.total}<span> / {sum.outOf} · {sum.arrows} {r.arrowsWord} · {r.avg} {sum.avg == null ? "–" : sum.avg.toFixed(2)}</span></div>
          <p>{r.tens}: {sum.tens} · {r.misses}: {sum.misses}
            {sum.cx != null && ` · ${r.centre} ${sum.cx > 0 ? r.right : r.left} ${Math.abs(sum.cx * 100).toFixed(0)}%, ${sum.cy > 0 ? r.high : r.low} ${Math.abs(sum.cy * 100).toFixed(0)}%`}</p>
        </div>
        <div className="card rg-scroll">
          <h3>{r.ends}</h3>
          <table className="rg-table">
            <thead><tr><th>{r.end}</th>{Array.from({ length: per }, (_, i) => <th key={i}>{i + 1}</th>)}<th>{r.sum}</th><th>{r.focus}</th></tr></thead>
            <tbody>
              {live.ends.filter((x) => x.arrows.length).map((x) => (
                <tr key={x.end}><td>{x.end}</td>{Array.from({ length: per }, (_, i) => <td key={i}>{x.arrows[i]?.score ?? ""}</td>)}<td><b>{endSum(x)}</b></td><td>{x.focus ?? ""}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>{r.after}</h3>
          <div className="form">
            <div><label>{r.rating}</label><Scale n={10} value={live.post.rating ?? null} onChange={(v) => change((s) => { s.post.rating = v; })} /></div>
            <div><label>{r.effort}</label><Scale n={10} value={live.post.effort ?? null} onChange={(v) => change((s) => { s.post.effort = v; })} /></div>
            <label>{r.coachNotes}<textarea rows={3} value={live.coach_notes} onChange={(ev) => change((s) => { s.coach_notes = ev.target.value; })} /></label>
          </div>
        </div>
        <button className="btn-primary rg-wide" onClick={save} disabled={!sum.arrows}>{r.save}</button>
        <div className="btn-row">
          <button className="btn-ghost" onClick={() => setStep("range")}>{r.back}</button>
          <button className="btn-ghost danger" onClick={discard}>{r.discard}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen" key={step}>
      {header}
      <div className="rg-endbar">
        <button aria-label={r.prevEnd} disabled={view === 0} onClick={() => { setView(view - 1); setPick(null); }}><Icon name="prev" /></button>
        <b>{r.end} {e.end}</b>
        <button aria-label={r.nextEnd} onClick={nextEnd}><Icon name="next" /></button>
        <span className="rg-tot">{endSum(e)}<small>{r.total} {live.ends.reduce((t, x) => t + endSum(x), 0)}</small></span>
      </div>
      <div className="rg-arrows">
        {e.arrows.map((a, i) => (
          <button key={i} type="button" className={`rg-arrow ${a.score == null ? "ring-none" : `ring-${ringOf(a.score)}`} ${i === pick ? "on" : ""}`} aria-pressed={i === pick} aria-label={`${r.end} ${e.end}, A${a.arrow}: ${a.score ?? ""}`} onClick={() => setPick(pick === i ? null : i)}>{a.score ?? "·"}</button>
        ))}
      </div>
      <p className="rg-hint" role="status">
        {pick != null ? fill(r.hintPicked, { n: e.arrows[pick].arrow })
          : e.arrows.length >= per ? fill(r.hintFull, { n: e.end, m: e.end + 1 })
          : fill(r.hintPlot, { n: e.arrows.length + 1, per })}
      </p>
      <div className="rg-film">
        <button className="btn-ghost rg-rec" onClick={() => setFilming(true)}><span className="dot" />{live.pendingClip ? r.recordAgain : r.record}</button>
        {live.pendingClip && (
          <p className="rg-pending" role="status">{r.clipWaitingLong}
            <button className="link-btn" onClick={() => change((s) => { delete s.pendingClip; })}>{r.dontLink}</button></p>
        )}
      </div>
      <Target face={face} label={r.faces[face] || face} arrows={e.arrows} pick={pick} onHit={hit} />
      {tagId && <QuickTag key={tagId} id={tagId} tr={tr} onClose={() => setTagId(null)} />}
      {filming && <Recorder tr={tr} onDone={clipDone} onClose={() => setFilming(false)} />}
      <div className="rg-row3">
        <button className="btn-ghost" onClick={() => hit({ score: "M" })}>{r.miss}</button>
        <button className="btn-ghost" onClick={undo}>{r.undo}</button>
        <button className={`btn-ghost ${pad ? "active" : ""}`} aria-expanded={pad} onClick={() => setPad(!pad)}>{r.scoreOnly}</button>
      </div>
      {pad && <div className="rg-pad">{scoreKeys(face).map((k) => <button key={k} className="btn-ghost" onClick={() => hit({ score: k })}>{k}</button>)}</div>}

      <div className="card">
        <h3>{!shown ? r.lastArrow : pick != null ? fill(r.pickedArrow, { n: shown.arrow }) : `${r.lastArrow} (A${shown.arrow})`}</h3>
        <div className="form">
          <div><label>{r.feel}</label><Scale n={5} value={shown?.feel ?? null} onChange={(v) => shown && change((s) => { s.ends[view].arrows[shownIndex].feel = v; })} /></div>
          <label>{r.arrowNote}<input value={shown?.notes ?? ""} disabled={!shown} placeholder={r.arrowNotePh} onChange={(ev) => change((s) => { s.ends[view].arrows[shownIndex].notes = ev.target.value; })} /></label>
        </div>
      </div>
      <div className="card">
        <h3>{r.thisEnd}</h3>
        <div className="form">
          <div><label>{r.endFocus}</label><Scale n={5} value={e.focus} onChange={(v) => change((s) => { s.ends[view].focus = v; })} /></div>
          <div><label>{r.routine}</label><Choice values={ROUTINES} labels={r.routines} value={e.routine || ""} onChange={(v) => change((s) => { s.ends[view].routine = v || null; })} /></div>
          <label>{r.endNote}<input value={e.notes} onChange={(ev) => change((s) => { s.ends[view].notes = ev.target.value; })} /></label>
        </div>
      </div>
      <button className="btn-primary rg-wide" onClick={() => setStep("review")}>{r.finish}</button>
      {note && <div className="rg-toast" role="status">{note}</div>}
    </div>
  );
}
