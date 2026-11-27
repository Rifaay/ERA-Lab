import { useState, useRef, useEffect } from "react";
import { getAthletes, getRange, saveRange, saveSession, getReviews, saveReview, uid, getPlans } from "../storage";
import { dayFilled } from "../plan";
import { isoDay } from "../stats";
import { dropUpload } from "../archer";
import { putClip } from "../clipStore";
import { clipName, quickReview, shotOf, refreshShots } from "../clips";
import Recorder from "../Recorder";
import QuickTag from "../QuickTag";
import { useApp } from "../context";
import { ringOf } from "../insights";
import Icon from "../icons";
import { FACES, RING_FILL, rings, spotsOf, scoreOf, loupeAt, scoreKeys, scoreValue, newSession, record, undoLast, summary, finish } from "../range";
import Scorecard from "./Scorecard";
import { scorecardFile, scorecardPdf } from "../scorecardFile";
import EndVideo from "../EndVideo";
import { localize } from "../digits";
import SwipeRow from "../SwipeRow";

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
const copyOf = (host, lang) => { host = host.cloneNode(true); localize(host, lang); return host.innerHTML; }; // the hidden original stays as React drew it
const downloadScorecard = (host, s, lang) => {
  const title = `Scorecard ${s.session_id}`;
  host = host.cloneNode(true); localize(host, lang); // a copy: the hidden original stays as React drew it
  const url = URL.createObjectURL(new Blob([scorecardFile(host.innerHTML, { lang, title })], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${title}.html`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const PHONE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches; // a touch screen: phone or tablet
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

// "Who's shooting?": every archer, those with training planned today first. The coach's app only.
function Who({ label, selectedId, onPick }) {
  const iso = isoDay(new Date()), year = +iso.slice(0, 4);
  const today = new Set(getPlans().filter((p) => p.year === year && dayFilled(p.days?.[iso])).flatMap((p) => p.archers));
  const list = getAthletes().sort((a, b) => Number(today.has(b.id)) - Number(today.has(a.id)) || a.name.localeCompare(b.name));
  return (
    <div className="rg-who" role="radiogroup" aria-label={label}>
      {list.map((a) => (
        <button key={a.id} type="button" role="radio" aria-checked={a.id === selectedId} className={a.id === selectedId ? "on" : ""} onClick={() => onPick(a.id)}>
          <i aria-hidden="true">{a.name.split(/\s+/).map((w) => [...w][0]).slice(0, 2).join("").toUpperCase()}</i><span>{a.name.split(/\s+/)[0]}</span>
        </button>
      ))}
    </div>
  );
}

// The usual values as chips, and "Other" for any whole number from 1 to max (a 4-arrow end, a 25 m line).
function Pick({ values, value, onChange, max, other }) {
  const [typing, setTyping] = useState(() => !values.includes(value));
  return (
    <div className="rg-chips">
      {values.map((v) => (
        <button key={v} type="button" className={`chip ${!typing && value === v ? "active" : ""}`} aria-pressed={!typing && value === v} onClick={() => { setTyping(false); onChange(v); }}>{v}</button>
      ))}
      <button type="button" className={`chip ${typing ? "active" : ""}`} aria-pressed={typing} onClick={() => setTyping(true)}>{other}</button>
      {typing && <input className="rg-other" type="number" inputMode="numeric" min={1} max={max} step={1} value={value} aria-label={other}
        autoFocus onChange={(e) => onChange(e.target.value)} onBlur={() => onChange(String(Math.min(max, Math.max(1, Math.round(+value) || 1))))} />}
    </div>
  );
}

// Press, slide, lift. A fingertip covers about three rings on a phone, so the loupe shows the spot under the finger at 3x.
// Only a touch that starts on the face plots: one that starts on the white around it scrolls the page as usual.
const GAP = 220; // 3-spot: centre to centre, in the same units as a spot's radius (100)
const ON_FACE = 1.04; // a little past the edge, for a finger on the outer line
export const FACE_ZOOM = 4; // the most the face zooms in with two fingers
function Target({ face, label, zoomOut, arrows, pick, onHit }) {
  const ref = useRef(null);
  const [aim, setAim] = useState(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 }); // two-finger zoom: how far in, and the centre shown
  const fingers = useRef(new Map()), pinch = useRef(null);
  const n = rings(face), spots = spotsOf(face), g = 1.4 / view.k;
  const Z = 15 / view.k; // the loupe always shows 3× what the screen shows, however far the face is zoomed
  const top = -(spots - 1) * GAP / 2; // centre of the first spot
  const spotY = (k) => top + k * GAP;
  const W = 220, H = 220 + (spots - 1) * GAP, bx = -110, by = top - 110; // the whole face, in drawing units
  const vb = (v) => { const w = W / v.k, h = H / v.k; return [v.x - w / 2, v.y - h / 2, w, h]; };
  const fit = (v) => { const k = Math.min(FACE_ZOOM, Math.max(1, v.k)), w = W / k / 2, h = H / k / 2;
    return { k, x: Math.min(bx + W - w, Math.max(bx + w, v.x)), y: Math.min(by + H - h, Math.max(by + h, v.y)) }; };

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
    const stop = (e) => { const t = e.touches[0]; if (e.touches.length > 1 || (t && onFace(t.clientX, t.clientY))) e.preventDefault(); }; // two fingers: our zoom, not the page's
    svg.addEventListener("touchstart", stop, { passive: false });
    return () => svg.removeEventListener("touchstart", stop);
  });

  // Where a screen point falls in the drawing, as a share of the box (0–1) and in drawing units.
  const share = (cx, cy) => { const b = ref.current.getBoundingClientRect(); return [(cx - b.left) / b.width, (cy - b.top) / b.height]; };
  const down = (ev) => {
    const fs = fingers.current;
    fs.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (fs.size === 2) { // a second finger: zoom instead of plotting
      setAim(null);
      const [a, b] = [...fs.values()], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [fx, fy] = share(...m), [x0, y0, w, h] = vb(view);
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k, p: [x0 + fx * w, y0 + fy * h] };
      return;
    }
    if (fs.size > 2 || !onFace(ev.clientX, ev.clientY)) return;
    ev.preventDefault(); try { ref.current.setPointerCapture(ev.pointerId); } catch { /* a pointer the browser no longer knows */ } setAim(at(ev));
  };
  const move = (ev) => {
    const fs = fingers.current;
    if (fs.has(ev.pointerId)) fs.set(ev.pointerId, [ev.clientX, ev.clientY]);
    const p = pinch.current;
    if (p && fs.size >= 2) { // keep the spot first pinched under the fingers' middle
      const [a, b] = [...fs.values()], [fx, fy] = share((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      const k = Math.min(FACE_ZOOM, Math.max(1, p.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / p.d)), w = W / k, h = H / k;
      setView(fit({ k, x: p.p[0] - fx * w + w / 2, y: p.p[1] - fy * h + h / 2 }));
      return;
    }
    if (aim) setAim(at(ev));
  };
  const lift = (ev) => { fingers.current.delete(ev.pointerId); if (fingers.current.size < 2) pinch.current = null; };
  const up = (ev) => {
    lift(ev);
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
          <circle cx={a.x * 100} cy={rest(a) - a.y * 100} r={(i === pick ? 4.5 : 3.4) / Math.sqrt(view.k)} fill={i === pick ? "#00e0c6" : "#00b8a3"} stroke="#000" strokeWidth={1 / Math.sqrt(view.k)} />
          <text x={a.x * 100 + 5 / view.k} y={rest(a) - a.y * 100 - 5 / view.k} fontSize={8 / Math.sqrt(view.k)} fill="#000" fontFamily="monospace">{a.arrow}</text>
        </g>
      )))}
      {aim && <><circle cx={aim.x * 100} cy={spotY(aim.k) - aim.y * 100} r={2.2 / view.k} fill="none" stroke="#f2c40c" strokeWidth={1.1 / view.k} /><circle cx={aim.x * 100} cy={spotY(aim.k) - aim.y * 100} r={3.3 / view.k} fill="none" stroke="#000" strokeWidth={0.6 / view.k} /></>}
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
      <svg ref={ref} viewBox={view.k === 1 ? `${bx} ${by} ${W} ${H}` : vb(view).join(" ")} role="img" aria-label={label} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={(ev) => { lift(ev); setAim(null); }}>{drawing}</svg>
      {view.k > 1 && <button type="button" className="rg-zoom" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label={zoomOut}>{view.k.toFixed(1).replace(/\.0$/, "")}×</button>}
      {aim && (
        <svg className="rg-loupe" style={{ left: aim.lx, top: aim.ly, width: aim.size }} viewBox={`${cx - Z} ${cy - Z} ${2 * Z} ${2 * Z}`} aria-hidden="true">
          {drawing}{cross(0.7 / view.k, "#000")}{cross(0.3 / view.k, "#fff")}
          <text x={cx} y={cy + Z - 3 / view.k} fontSize={5.5 / view.k} fontWeight="700" textAnchor="middle" fill="#f2c40c" stroke="#000" strokeWidth={0.5 / view.k} paintOrder="stroke" fontFamily="monospace">{scoreOf(face, aim.x, aim.y)}</text>
        </svg>
      )}
    </div>
  );
}

export default function Range({ tr, lang, selectedId }) {
  const r = tr.range;
  const { setSelectedId, archer } = useApp(); // archer: this is the archer's own app
  const athlete = getAthletes().find((a) => a.id === selectedId) || null;

  const [live, setLive] = useState(() => getRange().live || null);
  const [step, setStep] = useState(() => (getRange().live ? "range" : "setup"));
  const [setup, setSetup] = useState(() => ({ ...BLANK, ...(getRange().setups?.[selectedId] || {}) }));
  const [view, setView] = useState(() => Math.max(0, (getRange().live?.ends.length || 1) - 1));
  const [pick, setPick] = useState(null);
  const [pad, setPad] = useState(false);
  const [note, setNote] = useState(null); // { text, at }: "at" gives each message its own key, so its fade-out restarts
  const [savedEntry, setSavedEntry] = useState(null);
  const noteTimer = useRef(0);
  const cardRef = useRef(null);
  const [filming, setFilming] = useState(false);
  const [tagId, setTagId] = useState(null); // the clip just linked, offered for a quick tag
  const [pdfBusy, setPdfBusy] = useState(false);
  const savePdf = async () => {
    setPdfBusy(true);
    try { await scorecardPdf(copyOf(cardRef.current, lang), { lang, title: `Scorecard ${savedEntry.range.session_id}` }); }
    catch (e) { console.warn("PDF failed", e); window.alert(r.pdfFailed); }
    setPdfBusy(false);
  };

  const say = (text) => { setNote({ text, at: Date.now() }); clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNote(null), 1800); };
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
    if (archer && live) dropUpload(live.session_id).catch(() => {}); // off the coach's board too; offline, it drops off in 30 minutes
    saveRange({ ...getRange(), live: null }); setLive(null); setStep("setup");
  };

  if (live && live.athlete_id !== selectedId) return (
    <div className="screen" key={step}>
      <div className="card">
        <p style={{ marginBottom: 10 }}>{archer ? r.otherOnPhone : fill(r.otherAthlete, { name: live.athlete })}</p>
        <div className="btn-row">
          {/* The archer's app has one archer: an open session left on this phone (from before it was linked) becomes theirs */}
          <button className="btn-primary" onClick={() => archer ? change((s) => { s.athlete_id = selectedId; s.athlete = athlete?.name || s.athlete; }) : setSelectedId(live.athlete_id)}>{archer ? r.keepMine : r.resume}</button>
          <button className="btn-ghost danger" onClick={discard}>{r.discard}</button>
        </div>
      </div>
    </div>
  );
  if (!athlete) return archer ? (
    <div className="screen" key={step}><div className="no-athlete"><div className="no-athlete-icon"><Icon name="target" size={56} /></div><div className="no-athlete-text">{r.noAthlete}</div></div></div>
  ) : (
    <div className="screen" key={step}><h2>{r.newSessionTitle}</h2><label className="rg-who-label">{r.who}</label><Who label={r.who} selectedId="" onPick={setSelectedId} />{!getAthletes().length && <p className="muted">{r.noAthlete}</p>}</div>
  );

  const stepIndex = { setup: 0, range: 1, review: 2, done: 2 }[step];
  const header = (
    <>
      <h2>{r.title}</h2>
      <ol className="rg-steps">
        {r.steps.map((label, i) => <li key={label} className={i === stepIndex ? "on" : i < stepIndex ? "done" : ""} aria-current={i === stepIndex ? "step" : undefined}>{i + 1} · {label}</li>)}
      </ol>
    </>
  );

  if (step === "setup") return (
    <div className="screen" key={step}>
      {header}
      {!archer && <div className="rg-who-wrap"><label className="rg-who-label">{r.who}</label><Who label={r.who} selectedId={selectedId} onPick={setSelectedId} /></div>}
      <div className="card">
        <div className="form">
          <div><label>{r.distance}</label><Pick values={["18", "30", "50", "70", "90"]} value={setup.distance} onChange={(v) => set("distance", v)} max={150} other={r.other} /></div>
          <div><label>{r.face}</label><Choice values={FACES} labels={FACES.map((f) => r.faces[f])} value={setup.face} onChange={(v) => v && set("face", v)} /></div>
          <div><label>{r.perEnd}</label><Pick values={["3", "6"]} value={setup.perEnd} onChange={(v) => set("perEnd", v)} max={12} other={r.other} /></div>
          <div><label>{r.type}</label><Choice values={TYPES} labels={tr.session.types} value={setup.type} onChange={(v) => v && set("type", v)} /></div>
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
        <p style={{ margin: "10px 0" }}>{archer || PHONE ? r.pdfNote : r.fileNote}</p>
        <div className="btn-row">
          <button className="btn-primary" onClick={savePdf} disabled={pdfBusy}><Icon name="download" size={18} />{pdfBusy ? r.pdfMaking : r.pdf}</button>
          {/* a phone opens the downloaded web file in viewers that drop its design (and print it plain): there, the PDF only */}
          {!archer && !PHONE && <button className="btn-ghost" onClick={() => downloadScorecard(cardRef.current, savedEntry.range, lang)}>{r.file}</button>}
          <button className="btn-ghost" onClick={() => setStep("setup")}>{r.newSession}</button>
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
          <div className="rg-ends" style={{ "--per": per }}>
            <div className="rg-end head"><span>{r.end}</span>{Array.from({ length: per }, (_, i) => <span key={i}>{i + 1}</span>)}<span>{r.sum}</span></div>
            {live.ends.filter((x) => x.arrows.length).map((x) => (
              // An end is cleared, not removed: the ends after it keep their numbers, so linked clips stay right
              <SwipeRow key={x.end} label={tr.results.del} onDelete={() => { if (!window.confirm(fill(r.confirmEnd, { n: x.end }))) return false; change((s) => { s.ends.find((y) => y.end === x.end).arrows = []; }); }}>
                <div className="rg-end"><span>{x.end}</span>{Array.from({ length: per }, (_, i) => <span key={i}>{x.arrows[i]?.score ?? ""}</span>)}<b>{endSum(x)}</b></div>
              </SwipeRow>
            ))}
          </div>
          <p className="muted swipe-hint">{r.swipeEnd}</p>
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
      <Target face={face} label={r.faces[face] || face} zoomOut={r.zoomOut} arrows={e.arrows} pick={pick} onHit={hit} />
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
          {!archer && <EndVideo tr={tr} athlete={athlete} sessionId={live.session_id} end={e.end} />}
        </div>
      </div>
      <button className="btn-primary rg-wide" onClick={() => setStep("review")}>{r.finish}</button>
      <button className="btn-ghost danger rg-wide" onClick={discard}>{r.discard}</button>
      {note && <div key={note.at} className="rg-toast" role="status">{note.text}</div>}
    </div>
  );
}
