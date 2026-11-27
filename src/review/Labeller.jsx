import { useEffect, useRef, useState } from "react";
import { getClip, updateClip, putClip } from "../clipStore";
import { getAthletes, getSessions, getReviews, saveReview, getRange, uid } from "../storage";
import { reviewFromLabels, mergeReview } from "../review";
import { FAULTS, arrowChoices } from "../clips";
import { PHASES, POINTS, BONES, blank, ptAt, phaseAt, enforceOrder, motionScore, finishMotion, suggestPhases, HOLD_MS, SLOP, isSwipeDown, hitPoint, hitShape, moveShape } from "./labels";
import { adjust, timing, getStart, setStart, STARTS, notice } from "./learn";
import { blendCorrection, template, search } from "./markers";
import { frames as readFrames } from "./frames";
import { trackPose } from "./pose";
import { angleOf } from "./draw";
import { isoDay } from "../stats";
import Icon from "../icons";
import "./labeller.css";

const COLORS = ["#ffff00", "#ff3b30", "#00e0c6", "#ffffff"];
const ic = (d) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const TOOLS = [
  ["line", ic(<path d="M5 19L19 5" />)], ["arrow", ic(<><path d="M5 19L19 5" /><path d="M10 5h9v9" /></>)],
  ["circle", ic(<circle cx="12" cy="12" r="7.5" />)], ["angle", ic(<><path d="M19 19H5L15 5" /><path d="M9.5 19a5 5 0 0 0-1.6-4" /></>)],
  ["pen", ic(<><path d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z" /><path d="M14 7l3 3" /></>)],
];
const DOCK = [
  ["play", ic(<path d="M8 5.5v13l10-6.5z" />)], ["phases", ic(<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>)],
  ["points", ic(<><circle cx="7" cy="7" r="2" /><circle cx="17" cy="9" r="2" /><circle cx="10" cy="17" r="2" /><path d="M8.6 8.4l1 6.7M15.1 9.6l-3.4 5.8" /></>)],
  ["draw", ic(<><path d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z" /><path d="M14 7l3 3" /></>)],
  ["more", ic(<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>)],
];
const ZMAX = 5, LOUPE = 128;
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const seekTo = (v, t) => new Promise((r) => { v.addEventListener("seeked", r, { once: true }); v.currentTime = t; });

// Frames per second, from the gaps between the first frames the browser shows. Common rates only.
const measureFps = (v) => new Promise((res) => {
  if (!("requestVideoFrameCallback" in v)) return res(30);
  const times = [], was = v.currentTime; let over = false;
  const finish = (f) => { if (over) return; over = true; v.pause(); v.currentTime = was; res(f); };
  const cb = (now, m) => {
    if (over) return;
    times.push(m.mediaTime);
    if (times.length < 8) { v.requestVideoFrameCallback(cb); return; }
    const d = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)[3], f = d > 0 ? 1 / d : 30;
    finish([24, 25, 29.97, 30, 50, 59.94, 60, 120, 240].reduce((a, b) => (Math.abs(b - f) < Math.abs(a - f) ? b : a)));
  };
  v.requestVideoFrameCallback(cb); v.playbackRate = 1; v.play().catch(() => finish(30));
  setTimeout(() => finish(30), 3000);
});

// Lines, arrows, circles, angles and freehand, in 0–1 of the picture, drawn at w × h; s keeps strokes the same on screen.
function paintShapes(c, shapes, w, h, ar, s) {
  for (const sh of shapes) {
    const P = sh.p.map(([x, y]) => [x * w, y * h]);
    c.strokeStyle = c.fillStyle = sh.c; c.lineWidth = 3 * s; c.lineCap = c.lineJoin = "round";
    c.beginPath();
    if (sh.t === "circle" && P[1]) c.arc(P[0][0], P[0][1], Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), 0, 7);
    else P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
    if (sh.t === "arrow" && P[1]) {
      const [a, b] = P, ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 16 * s;
      c.beginPath(); c.moveTo(b[0], b[1]);
      c.lineTo(b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45));
      c.lineTo(b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)); c.closePath(); c.fill();
    }
    if (sh.t === "angle") {
      for (const [x, y] of P) { c.beginPath(); c.arc(x, y, 4 * s, 0, 7); c.fill(); }
      if (sh.p.length === 3) {
        const label = `${angleOf(sh.p[0], sh.p[1], sh.p[2], ar).toFixed(0)}°`, tx = P[1][0] + 10 * s, ty = P[1][1] - 10 * s;
        c.font = `700 ${18 * s}px system-ui, sans-serif`;
        const tw = c.measureText(label).width;
        c.fillStyle = "rgba(0,0,0,.75)"; c.fillRect(tx - 4 * s, ty - 18 * s, tw + 8 * s, 24 * s);
        c.fillStyle = sh.c; c.fillText(label, tx, ty);
      }
    }
  }
}

// Video analysis of one clip from this device: phases, body points, drawings, verdict and notes. Built for a phone in
// one hand: the picture takes the screen, one tray of tools at a time, and anything on the picture is moved by
// pressing and holding it and removed by flicking it down. Every change is kept on this device as it is made.
// Speed: playing only moves the playhead and redraws one overlay; nothing in React changes frame by frame.
export default function Labeller({ clipId, tr, selectedId, onBack }) {
  const l = tr.lab;
  const vid = useRef(null), viewer = useRef(null), stage = useRef(null), cv = useRef(null), tlBox = useRef(null), tlc = useRef(null);
  const head = useRef(null), hud = useRef(null), zoomLbl = useRef(null), wristLbl = useRef(null), loupe = useRef(null);
  const L = useRef(null), fps = useRef(30), size = useRef({ w: 1, h: 1 }), Z = useRef({ k: 1, x: 0, y: 0 });
  const G = useRef(null), fingers = useRef(new Map()), pinch = useRef(null), fall = useRef(null), angleDraft = useRef(null);
  const marks = useRef([]), stopRun = useRef(null), saveTimer = useRef(0), msgTimer = useRef(0), wheelTimer = useRef(0), S = useRef({});
  const [clip, setClip] = useState(null);
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [, setVer] = useState(0);
  const [tray, setTray] = useState("play");
  const [tool, setTool] = useState("line");
  const [color, setColor] = useState(COLORS[0]);
  const [selPt, setSelPt] = useState(0);
  const [selPhase, setSelPhase] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(null); // "analyse" | "track" | "ai", with { d, t } progress in msg
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(0.25);
  const [snap, setSnap] = useState(null);
  const [engine, setEngine] = useState(() => { try { return localStorage.getItem("racm_ai_engine") || "mediapipe"; } catch { return "mediapipe"; } });
  const [start, setStartS] = useState(() => getStart(clipId));
  useEffect(() => { S.current = { tray, tool, color, selPt }; });

  const athleteId = clip?.athleteId || selectedId;
  const athlete = getAthletes().find((a) => a.id === athleteId);
  const frameNow = () => Math.round((vid.current?.currentTime || 0) * fps.current);
  const gap = () => Math.max(2, Math.round(fps.current / 4)); // fill a hole between two marks only if it lasts a quarter second or less
  const say = (t) => { setMsg(t); clearTimeout(msgTimer.current); msgTimer.current = setTimeout(() => setMsg(""), 2600); };

  // ---- the clip ----
  useEffect(() => {
    let alive = true, u = null;
    getClip(clipId).then((c) => {
      if (!alive) return;
      if (!c) { setErr(l.missing); return; }
      u = URL.createObjectURL(c.blob); setClip(c); setUrl(u);
    }).catch(() => alive && setErr(l.missing));
    return () => { alive = false; if (u) URL.revokeObjectURL(u); clearTimeout(saveTimer.current); stopRun.current?.(); };
  }, [clipId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMeta = async () => {
    const v = vid.current;
    if (!v.videoWidth) { setErr(l.wontPlay); return; }
    if (!Number.isFinite(v.duration)) { await seekTo(v, 1e7); await seekTo(v, 0); } // recorded in a browser: its length is known once the end has been read
    fps.current = await measureFps(v);
    const base = blank(clipId, fps.current, +v.duration.toFixed(3)), saved = clip.labels;
    const x = saved ? { ...base, ...saved, hints: { ...base.hints, ...saved.hints } } : base;
    if (!x.drawings?.length) { try { x.drawings = JSON.parse(localStorage.getItem("racm_drawings"))?.[clipId] || []; } catch { x.drawings = []; } } // drawings from before they moved into the labels
    if (!saved) {
      const rv = getReviews().find((r) => r.id === clipId);
      if (rv) { x.verdict = rv.verdict; x.faults = [...(rv.faults || [])]; x.notes = rv.notes || ""; if (rv.shot) x.shot = { ...rv.shot }; }
    }
    x.athlete = athlete?.name || x.athlete; x.date ||= isoDay(new Date(clip.recordedAt || Date.now()));
    L.current = x;
    setSelPhase(Math.max(0, x.phases.findIndex((p) => p.start_s == null)));
    v.playbackRate = rate;
    layout(); setReady(true); setVer((n) => n + 1);
  };

  // Every edit is kept on this device a moment later: the full labels on the clip, the short review for the rest of the app.
  const keep = async () => {
    const x = L.current;
    if (!x) return;
    x.labelled_at = new Date().toISOString(); x.clip = clipId; x.playback_fps = fps.current;
    try {
      await updateClip(clipId, { labels: JSON.parse(JSON.stringify(x)) });
      const next = reviewFromLabels(x, { sessions: getSessions(), athletes: getAthletes(), selectedId: athleteId, clipStart: getStart(clipId) });
      saveReview(mergeReview(getReviews().find((r) => r.id === clipId), next));
    } catch { say(l.saveFail); }
  };
  const edited = () => {
    setVer((n) => n + 1); drawTimeline(); paint();
    clearTimeout(saveTimer.current); saveTimer.current = setTimeout(keep, 700);
  };

  // ---- layout, overlay, timeline ----
  const sizeCanvas = () => {
    const c = cv.current, { w, h } = size.current, r = (devicePixelRatio || 1) * Math.min(3, Z.current.k);
    c.width = Math.round(w * r); c.height = Math.round(h * r);
  };
  const layout = () => {
    const v = vid.current, box = viewer.current;
    if (!v?.videoWidth || !box) return;
    const W = box.clientWidth, H = box.clientHeight, k = Math.min(W / v.videoWidth, H / v.videoHeight), w = v.videoWidth * k, h = v.videoHeight * k;
    Object.assign(stage.current.style, { width: w + "px", height: h + "px", left: (W - w) / 2 + "px", top: (H - h) / 2 + "px" });
    size.current = { w, h };
    applyZoom(); sizeCanvas(); paint(); drawTimeline();
  };
  useEffect(() => {
    if (!ready) return;
    let f = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(f); f = requestAnimationFrame(layout); });
    ro.observe(viewer.current); ro.observe(tlBox.current);
    return () => { ro.disconnect(); cancelAnimationFrame(f); };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Points, bones and drawings for frame f onto a context of w × h; s scales strokes and dots.
  const drawScene = (c, w, h, s, f) => {
    const x = L.current, g = G.current, P = {}, ar = (vid.current.videoWidth || 16) / (vid.current.videoHeight || 9);
    for (const p of POINTS) {
      if (fall.current?.kind === "pt" && fall.current.k === p.k) continue;
      if (g?.mode === "lift" && g.hit.kind === "pt" && g.hit.k === p.k) { P[p.k] = [...g.pos, "m"]; continue; }
      const q = ptAt(x.points, p.k, f, gap()); if (q) P[p.k] = q;
    }
    c.lineCap = "round";
    c.strokeStyle = "rgba(100,150,255,.9)"; c.lineWidth = 2.5 * s;
    for (const [a, b] of BONES) if (P[a] && P[b]) { c.beginPath(); c.moveTo(P[a][0] * w, P[a][1] * h); c.lineTo(P[b][0] * w, P[b][1] * h); c.stroke(); }
    for (const p of POINTS) {
      const q = P[p.k]; if (!q) continue;
      const px = q[0] * w, py = q[1] * h, lifted = g?.mode === "lift" && g.hit.kind === "pt" && g.hit.k === p.k;
      c.globalAlpha = q[2] === "i" ? 0.55 : 1;
      c.beginPath(); c.arc(px, py, (q[2] === "m" ? 7 : 5.5) * s, 0, 7); c.fillStyle = p.c; c.fill();
      c.lineWidth = 1.5 * s; c.strokeStyle = "#000"; c.stroke(); c.globalAlpha = 1;
      if (lifted) { c.strokeStyle = "#fff"; c.lineWidth = 2 * s; c.beginPath(); c.arc(px, py, 15 * s, 0, 7); c.stroke(); }
    }
    let shapes = x.drawings.map((d, i) => (g?.mode === "lift" && g.hit.kind === "shape" && g.hit.i === i ? g.shape : d));
    if (fall.current?.kind === "shape") shapes = shapes.filter((d) => d !== fall.current.shape);
    if (g?.mode === "draw") shapes = [...shapes, g.shape];
    if (angleDraft.current) shapes = [...shapes, angleDraft.current];
    paintShapes(c, shapes, w, h, ar, s);
    return P;
  };
  // A removed point or drawing drops and fades for 220 ms (just fades with reduced motion), so the coach sees what went.
  const drawFall = (c, w, h, s) => {
    const fl = fall.current; if (!fl) return;
    const u = Math.min(1, (performance.now() - fl.t0) / 220), ar = (vid.current.videoWidth || 16) / (vid.current.videoHeight || 9);
    c.save(); c.globalAlpha = 1 - u; if (!reduced()) c.translate(0, u * u * 48 * s);
    if (fl.kind === "pt") { c.beginPath(); c.arc(fl.pos[0] * w, fl.pos[1] * h, 7 * s, 0, 7); c.fillStyle = fl.c; c.fill(); }
    else paintShapes(c, [fl.shape], w, h, ar, s);
    c.restore();
    if (u < 1) requestAnimationFrame(paint); else fall.current = null;
  };
  const paint = () => {
    const c = cv.current, x = L.current;
    if (!c || !x) return;
    const { w, h } = size.current, r = c.width / w, ctx = c.getContext("2d");
    ctx.setTransform(r, 0, 0, r, 0, 0); ctx.clearRect(0, 0, w, h);
    const P = drawScene(ctx, w, h, 1 / Z.current.k, frameNow());
    drawFall(ctx, w, h, 1 / Z.current.k);
    const a = P.draw_elbow && P.draw_wrist && P.draw_hand ? angleOf(P.draw_elbow, P.draw_wrist, P.draw_hand, (vid.current.videoWidth || 16) / (vid.current.videoHeight || 9)) : null;
    if (wristLbl.current) { wristLbl.current.hidden = a == null; if (a != null) wristLbl.current.textContent = fill(l.wrist, { a: a.toFixed(0) }); }
  };
  const tick = () => {
    const v = vid.current, x = L.current;
    if (!v || !x) return;
    const t = v.currentTime, d = v.duration || 1, f = frameNow(), k = phaseAt(x.phases, t);
    if (head.current) head.current.style.transform = `translateX(${(t / d) * (tlBox.current?.clientWidth || 0)}px)`;
    if (hud.current) hud.current.textContent = `${t.toFixed(2)} s · ${l.frame} ${f}${k >= 0 ? " · " + l.phases[PHASES[k].key] : ""}`;
    paint();
  };
  const drawTimeline = () => {
    const c = tlc.current, box = tlBox.current, x = L.current, v = vid.current;
    if (!c || !box || !x || !v?.duration) return;
    const W = box.clientWidth, H = box.clientHeight, dpr = devicePixelRatio || 1;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const D = v.duration, X = (t) => (t / D) * W;
    const set = x.phases.map((p, i) => ({ ...p, i })).filter((p) => p.start_s != null).sort((a, b) => a.start_s - b.start_s);
    g.fillStyle = "#222"; g.fillRect(0, H - 14, W, 8);
    set.forEach((p, j) => { const x0 = X(p.start_s), x1 = j + 1 < set.length ? X(set[j + 1].start_s) : W; g.fillStyle = PHASES[p.i].c; g.fillRect(x0, H - 14, x1 - x0, 8); });
    if (x.motion) {
      const m = x.motion.values, top = 4, hh = H - 22;
      g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 1; g.beginPath();
      m.forEach((y, i) => { const px = X(i / x.motion.fps), py = top + hh - y * hh; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
    }
    set.forEach((p) => {
      const px = X(p.start_s); g.fillStyle = PHASES[p.i].c; g.fillRect(px - 1, 0, 2, H - 6);
      g.beginPath(); g.arc(px, 8, 6, 0, 7); g.fill();
      g.fillStyle = "#000"; g.font = "700 9px system-ui"; g.textAlign = "center"; g.fillText(String(p.i + 1), px, 11);
    });
    tick();
  };

  // ---- playing ----
  useEffect(() => {
    const v = vid.current;
    if (!v || !ready) return;
    let alive = true;
    const loop = () => { if (!alive) return; tick(); if (!v.paused) ("requestVideoFrameCallback" in v ? v.requestVideoFrameCallback(loop) : requestAnimationFrame(loop)); };
    const play = () => { setPlaying(true); loop(); }, pause = () => { setPlaying(false); tick(); };
    v.addEventListener("play", play); v.addEventListener("pause", pause); v.addEventListener("seeked", tick);
    return () => { alive = false; v.removeEventListener("play", play); v.removeEventListener("pause", pause); v.removeEventListener("seeked", tick); };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = (n) => { const v = vid.current; v.pause(); v.currentTime = Math.min(v.duration, Math.max(0, (frameNow() + n) / fps.current + 1e-4)); };
  const toggle = () => { const v = vid.current; if (v.paused) v.play().catch(() => {}); else v.pause(); };
  const setSpeed = (r) => { setRate(r); vid.current.playbackRate = r; };

  // ---- zoom: the picture and its overlay move together, so nothing is redrawn while pinching ----
  const applyZoom = () => {
    const z = Z.current, { w, h } = size.current;
    z.k = Math.min(ZMAX, Math.max(1, z.k)); z.x = Math.min(0, Math.max(w * (1 - z.k), z.x)); z.y = Math.min(0, Math.max(h * (1 - z.k), z.y));
    stage.current.style.transform = z.k === 1 ? "" : `translate(${z.x}px,${z.y}px) scale(${z.k})`;
    if (zoomLbl.current) { zoomLbl.current.textContent = z.k.toFixed(1).replace(/\.0$/, "") + "×"; zoomLbl.current.hidden = z.k === 1; }
  };
  const zoomAt = (k, cx, cy) => { // cx, cy: a spot on screen that stays under the finger
    const r = stage.current.getBoundingClientRect(), z = Z.current, px = cx - r.left + z.x, py = cy - r.top + z.y; // in the stage's own, unzoomed box
    k = Math.min(ZMAX, Math.max(1, k)); z.x = px - (px - z.x) * k / z.k; z.y = py - (py - z.y) * k / z.k; z.k = k; applyZoom();
  };
  const zoomDone = () => { sizeCanvas(); paint(); };
  const resetZoom = () => { Z.current = { k: 1, x: 0, y: 0 }; applyZoom(); zoomDone(); };

  // ---- the finger on the picture ----
  const pic = (cx, cy) => { const r = stage.current.getBoundingClientRect(); return [(cx - r.left) / r.width, (cy - r.top) / r.height]; };
  const hitAt = (cx, cy, rad) => {
    const x = L.current, r = stage.current.getBoundingClientRect(), f = frameNow();
    const sh = hitShape(x.drawings, cx - r.left, cy - r.top, rad, r.width, r.height);
    if (sh >= 0) return { kind: "shape", i: sh };
    const P = {};
    for (const p of POINTS) { const q = ptAt(x.points, p.k, f, gap()); if (q) P[p.k] = [r.left + q[0] * r.width, r.top + q[1] * r.height]; }
    const k = hitPoint(P, cx, cy, rad);
    return k ? { kind: "pt", k } : null;
  };
  const drawLoupe = (cx, cy, pos) => {
    const c = loupe.current, v = vid.current, box = viewer.current.getBoundingClientRect();
    if (!c) return;
    c.hidden = false;
    const ly = cy - box.top - LOUPE - 40 < 0 ? cy - box.top + 40 : cy - box.top - LOUPE - 40; // above the finger, below it near the top
    c.style.transform = `translate(${Math.min(box.width - LOUPE, Math.max(0, cx - box.left - LOUPE / 2))}px,${ly}px)`;
    const g = c.getContext("2d"), span = (v.videoWidth / size.current.w) * (LOUPE / 2.5) / Z.current.k; // 2.5× what the screen shows
    g.drawImage(v, pos[0] * v.videoWidth - span / 2, pos[1] * v.videoHeight - span / 2, span, span, 0, 0, LOUPE, LOUPE);
    g.strokeStyle = "#ffff00"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(LOUPE / 2, 0); g.lineTo(LOUPE / 2, LOUPE); g.moveTo(0, LOUPE / 2); g.lineTo(LOUPE, LOUPE / 2); g.stroke();
  };
  const hideLoupe = () => { if (loupe.current) loupe.current.hidden = true; };
  const lift = () => {
    const g = G.current;
    if (!g || g.mode !== "press") return;
    g.mode = "lift"; vid.current.pause(); navigator.vibrate?.(12);
    const at = pic(g.x0, g.y0);
    if (g.hit.kind === "pt") { const q = ptAt(L.current.points, g.hit.k, frameNow(), gap()); g.pos = [q[0], q[1]]; g.off = [at[0] - q[0], at[1] - q[1]]; drawLoupe(g.x0, g.y0, g.pos); }
    else { g.orig = L.current.drawings[g.hit.i]; g.shape = g.orig; g.at = at; }
    paint();
  };
  const remove = (hit) => {
    const x = L.current, f = frameNow();
    if (hit.kind === "shape") { const shape = x.drawings[hit.i]; fall.current = { kind: "shape", shape, t0: performance.now() }; x.drawings = x.drawings.filter((_, i) => i !== hit.i); say(l.removed); }
    else {
      const m = x.points[hit.k], q = ptAt(x.points, hit.k, f, gap());
      if (!m?.[f]) { say(l.betweenMarks); return; }
      delete m[f]; fall.current = { kind: "pt", k: hit.k, pos: q, c: POINTS.find((p) => p.k === hit.k).c, t0: performance.now() }; say(l.removedFrame);
    }
    navigator.vibrate?.(8); edited();
  };
  const tap = (g) => {
    const s = S.current, x = L.current, f = frameNow(), at = pic(g.x0, g.y0);
    if (g.hit?.kind === "pt") { setSelPt(POINTS.findIndex((p) => p.k === g.hit.k)); say(l.pts[g.hit.k]); return; }
    if (at[0] < 0 || at[0] > 1 || at[1] < 0 || at[1] > 1) return;
    if (s.tray === "points") {
      const k = POINTS[s.selPt].k;
      vid.current.pause();
      blendCorrection(x.points[k] ||= {}, f, +at[0].toFixed(5), +at[1].toFixed(5));
      const next = POINTS.findIndex((p, i) => i > s.selPt && !x.points[p.k]?.[f]);
      s.selPt = next >= 0 ? next : Math.min(POINTS.length - 1, s.selPt + 1); // a second tap before the screen redraws goes to the next point too
      setSelPt(s.selPt); edited();
    } else if (s.tray === "draw" && s.tool === "angle") {
      const d = angleDraft.current || { t: "angle", c: s.color, p: [] };
      d.p = [...d.p, [+at[0].toFixed(4), +at[1].toFixed(4)]];
      if (d.p.length === 3) { angleDraft.current = null; x.drawings = [...x.drawings, d]; edited(); } else { angleDraft.current = d; paint(); }
    }
  };
  const down = (e) => {
    if (!L.current || busy) return;
    const fs = fingers.current;
    fs.set(e.pointerId, [e.clientX, e.clientY]);
    try { viewer.current.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer knows */ }
    if (fs.size === 2) {
      if (G.current) { clearTimeout(G.current.timer); G.current = null; hideLoupe(); paint(); }
      const [a, b] = [...fs.values()];
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], k: Z.current.k };
      return;
    }
    if (fs.size > 2) return;
    const hit = hitAt(e.clientX, e.clientY, e.pointerType === "mouse" ? 14 : 26);
    G.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), hit, mode: "press", timer: hit ? setTimeout(lift, HOLD_MS) : 0 };
  };
  const move = (e) => {
    const fs = fingers.current;
    if (!fs.has(e.pointerId)) return;
    fs.set(e.pointerId, [e.clientX, e.clientY]);
    const p = pinch.current;
    if (p && fs.size >= 2) {
      const [a, b] = [...fs.values()], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      Z.current.x += m[0] - p.m[0]; Z.current.y += m[1] - p.m[1]; p.m = m;
      zoomAt(p.k * Math.hypot(a[0] - b[0], a[1] - b[1]) / p.d, m[0], m[1]);
      return;
    }
    const g = G.current;
    if (!g || g.id !== e.pointerId) return;
    const s = S.current, far = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > SLOP;
    if (g.mode === "press" && far) {
      clearTimeout(g.timer);
      if (g.hit) g.mode = "flick";
      else if (s.tray === "draw" && s.tool !== "angle") { g.mode = "draw"; vid.current.pause(); const a = pic(g.x0, g.y0).map((v) => +v.toFixed(4)); g.shape = { t: s.tool, c: s.color, p: [a, a] }; }
      else if (Z.current.k > 1) { g.mode = "pan"; g.px = g.x0; g.py = g.y0; }
      else g.mode = "none";
    }
    if (g.mode === "lift") {
      const at = pic(e.clientX, e.clientY);
      if (g.hit.kind === "pt") { g.pos = [Math.min(1, Math.max(0, at[0] - g.off[0])), Math.min(1, Math.max(0, at[1] - g.off[1]))]; drawLoupe(e.clientX, e.clientY, g.pos); }
      else g.shape = moveShape(g.orig, at[0] - g.at[0], at[1] - g.at[1]);
      paint();
    } else if (g.mode === "draw") {
      const a = pic(e.clientX, e.clientY).map((v) => +v.toFixed(4));
      g.shape = { ...g.shape, p: g.shape.t === "pen" ? [...g.shape.p, a] : [g.shape.p[0], a] }; paint();
    } else if (g.mode === "pan") {
      Z.current.x += e.clientX - g.px; Z.current.y += e.clientY - g.py; g.px = e.clientX; g.py = e.clientY; applyZoom();
    }
  };
  const up = (e) => {
    const fs = fingers.current;
    fs.delete(e.pointerId);
    if (pinch.current && fs.size < 2) { pinch.current = null; zoomDone(); }
    const g = G.current;
    if (!g || g.id !== e.pointerId) return;
    clearTimeout(g.timer); G.current = null; hideLoupe();
    const x = L.current, dx = e.clientX - g.x0, dy = e.clientY - g.y0, ms = performance.now() - g.t0;
    if (e.type === "pointercancel") { paint(); return; }
    if (g.mode === "press") tap(g);
    else if (g.mode === "flick") { if (isSwipeDown({ dx, dy, ms })) remove(g.hit); }
    else if (g.mode === "lift") {
      if (g.hit.kind === "pt") { blendCorrection(x.points[g.hit.k] ||= {}, frameNow(), +g.pos[0].toFixed(5), +g.pos[1].toFixed(5)); edited(); }
      else { x.drawings = x.drawings.map((d, i) => (i === g.hit.i ? g.shape : d)); edited(); }
    } else if (g.mode === "draw") {
      const sh = g.shape, [a, b] = [sh.p[0], sh.p[sh.p.length - 1]];
      if (sh.t === "pen" ? sh.p.length > 2 : Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.01) { x.drawings = [...x.drawings, sh]; edited(); }
    }
    paint();
  };
  const wheel = (e) => { if (!ready) return; e.preventDefault(); zoomAt(Z.current.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); clearTimeout(wheelTimer.current); wheelTimer.current = setTimeout(zoomDone, 150); };
  useEffect(() => {
    const el = viewer.current;
    if (!el) return;
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });

  // ---- timeline: drag a phase marker, or scrub ----
  const tlDrag = useRef(null);
  const tlTime = (cx) => { const r = tlBox.current.getBoundingClientRect(), v = vid.current; return Math.max(0, Math.min(v.duration, ((cx - r.left) / r.width) * v.duration)); };
  const tlDown = (e) => {
    const x = L.current, v = vid.current;
    if (!x || !v.duration) return;
    try { tlBox.current.setPointerCapture(e.pointerId); } catch { /* as above */ }
    const r = tlBox.current.getBoundingClientRect(), px = e.clientX - r.left;
    let hit = -1, hd = e.pointerType === "mouse" ? 8 : 18;
    x.phases.forEach((p, i) => { if (p.start_s == null) return; const d = Math.abs((p.start_s / v.duration) * r.width - px); if (d < hd) { hd = d; hit = i; } });
    v.pause();
    if (hit >= 0 && e.clientY - r.top < r.height * 0.6) { tlDrag.current = hit; setSelPhase(hit); } else { tlDrag.current = "scrub"; v.currentTime = tlTime(e.clientX); }
  };
  const tlMove = (e) => {
    const d = tlDrag.current, x = L.current, v = vid.current;
    if (d == null) return;
    const t = tlTime(e.clientX);
    if (d === "scrub") { v.currentTime = t; return; }
    const p = x.phases[d], fr = Math.round(t * fps.current);
    Object.assign(p, { start_frame: fr, start_s: +(fr / fps.current).toFixed(4), source: "drag", confidence: 1 });
    if (p.key === "release") x.release_s = p.start_s;
    v.currentTime = p.start_s; drawTimeline();
  };
  const tlUp = () => { const d = tlDrag.current; tlDrag.current = null; if (d != null && d !== "scrub") { enforceOrder(L.current.phases, fps.current); edited(); } };

  // ---- phases ----
  const mark = () => {
    const x = L.current, k = selPhase, p = x.phases[k], fr = frameNow();
    Object.assign(p, { start_frame: fr, start_s: +(fr / fps.current).toFixed(4), source: "coach", confidence: 1 });
    if (p.key === "release") x.release_s = p.start_s;
    marks.current.push(k); enforceOrder(x.phases, fps.current);
    const next = x.phases.findIndex((q, i) => i > k && q.start_s == null);
    setSelPhase(next >= 0 ? next : Math.min(PHASES.length - 1, k + 1)); edited();
  };
  const undoMark = () => {
    const k = marks.current.pop();
    if (k == null) return;
    Object.assign(L.current.phases[k], { start_s: null, start_frame: null, source: null, confidence: null });
    setSelPhase(k); edited();
  };
  // Reads how much moves frame by frame, playing the clip through once, fast and muted.
  const analyse = async () => {
    const v = vid.current, f = fps.current;
    if (!("requestVideoFrameCallback" in v)) { say(l.noFrames); return null; }
    setBusy("analyse"); say(l.finding);
    const W = 96, H = Math.max(1, Math.round((96 * v.videoHeight) / v.videoWidth)), cx = new OffscreenCanvas(W, H).getContext("2d", { willReadFrequently: true });
    const n = Math.round(v.duration * f) + 1, raw = new Float32Array(n).fill(NaN);
    let prev = null, stopped = false;
    stopRun.current = () => { stopped = true; };
    v.pause(); await seekTo(v, 0);
    v.playbackRate = 2;
    await new Promise((done) => {
      const cb = (now, m) => {
        if (stopped) return done();
        cx.drawImage(v, 0, 0, W, H);
        const d = cx.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
        for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
        if (prev) raw[Math.min(n - 1, Math.round(m.mediaTime * f))] = motionScore(prev, g, W, H);
        prev = g;
        if (v.ended || m.mediaTime >= v.duration - 1 / f) done(); else v.requestVideoFrameCallback(cb);
      };
      v.requestVideoFrameCallback(cb); v.addEventListener("ended", done, { once: true });
      v.play().catch(() => { stopped = true; done(); });
    });
    v.pause(); v.playbackRate = rate; stopRun.current = null; setBusy(null);
    if (stopped) { say(l.stopped); return null; }
    const m = finishMotion(raw, f);
    L.current.motion = m; L.current.hints.motion_analysed = true; edited();
    return m;
  };
  const findPhases = async () => {
    const m = L.current.motion || (await analyse());
    if (!m) return;
    const r = suggestPhases(m.values, m.fps);
    if (!r) { say(l.noHold); return; }
    adjust(r.sugg, r.conf, m.fps, m.values.length, getStart(clipId), timing(getReviews(), athleteId));
    const x = L.current;
    x.phases.forEach((p) => {
      if (p.source && p.source !== "auto") return; // the coach's own marks stay
      const i = r.sugg[p.key];
      Object.assign(p, i == null ? { start_s: null, start_frame: null, source: null, confidence: null } : { start_frame: i, start_s: +(i / m.fps).toFixed(4), source: "auto", confidence: r.conf[p.key] });
    });
    enforceOrder(x.phases, m.fps); x.release_s = x.phases[6].start_s; x.hints.suggested = true;
    if (x.release_s != null) vid.current.currentTime = x.release_s;
    edited(); say(l.found);
  };

  // ---- following points ----
  const followPoints = async () => {
    const v = vid.current, x = L.current, f0 = frameNow(), pts = x.points;
    const keys = POINTS.map((p) => p.k).filter((k) => pts[k]?.[f0]);
    if (!keys.length) { say(l.placeFirst); return; }
    const W = Math.min(960, v.videoWidth), H = Math.round((W * v.videoHeight) / v.videoWidth), cx = new OffscreenCanvas(W, H).getContext("2d", { willReadFrequently: true });
    const gray = (b) => { cx.drawImage(b, 0, 0, W, H); b.close(); const d = cx.getImageData(0, 0, W, H).data, g = new Float32Array(W * H); for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; return g; };
    const R = Math.max(8, Math.round(W / 64)), SR = Math.max(12, Math.round(W / 40)), st = {}, ctl = {}, end = Math.round(v.duration * fps.current);
    setBusy("track"); stopRun.current = () => { ctl.stopped = true; };
    let first = true; // the first frame read may be one off from f0 on a phone clip; the points start from it
    for await (const { f, bmp } of readFrames(v, fps.current, f0, end, ctl)) {
      const g = gray(bmp);
      if (first) { first = false; for (const k of keys) { const q = pts[k][f0], px = q[0] * W, py = q[1] * H, tp = template(g, W, H, px, py, R); st[k] = { x: px, y: py, vx: 0, vy: 0, t: tp, t0: tp, miss: 0 }; } continue; }
      for (const k of keys) {
        const s = st[k]; if (!s) continue;
        const px = s.x + s.vx, py = s.y + s.vy;
        // The picture first placed is checked every frame: a renewed one drifts a pixel at a time, the first never does
        let a = search(g, W, H, s.t, px, py, R, SR); const b = search(g, W, H, s.t0, px, py, R, SR); if (b.score >= a.score - 0.05) a = b;
        const mk = pts[k][f];
        if (mk && mk[2] === "m") { pts[k][f] = [+(a.x / W).toFixed(5), +(a.y / H).toFixed(5), "t"]; blendCorrection(pts[k], f, mk[0], mk[1]); s.x = mk[0] * W; s.y = mk[1] * H; s.vx = s.vy = 0; s.t = s.t0 = template(g, W, H, s.x, s.y, R); s.miss = 0; continue; }
        if (a.score < 0.5) { if (++s.miss > 5) { delete st[k]; continue; } s.x = px; s.y = py; pts[k][f] = [+(px / W).toFixed(5), +(py / H).toFixed(5), "i"]; continue; }
        s.miss = 0; s.vx = (a.x - s.x) * 0.7 + s.vx * 0.3; s.vy = (a.y - s.y) * 0.7 + s.vy * 0.3; s.x = a.x; s.y = a.y;
        if (a.score > 0.85) s.t = template(g, W, H, a.x, a.y, R);
        pts[k][f] = [+(a.x / W).toFixed(5), +(a.y / H).toFixed(5), "t"];
      }
      if ((f - f0) % 10 === 0) { tick(); setMsg(fill(l.tracking, { d: f - f0, t: end - f0 })); }
      if (!Object.keys(st).length) ctl.stopped = true;
    }
    stopRun.current = null; setBusy(null); edited(); say(l.followed);
  };
  const aiTrack = async () => {
    const v = vid.current, L0 = L.current, n = Math.round(v.duration * fps.current);
    try { localStorage.setItem("racm_ai_engine", engine); } catch { /* storage full */ }
    v.pause(); setBusy("ai"); setMsg(l.aiStarting);
    const run = trackPose({ vid: v, fps: fps.current, frames: n, engine, onReady: () => setMsg(l.aiRunning), onProgress: (d, t) => setMsg(fill(l.tracking, { d, t })) });
    stopRun.current = run.stop;
    try {
      const out = await run.done;
      if (L.current === L0) {
        // A new run replaces the last one's points entirely (mixing two runs flickers); the coach's own marks stay
        for (const k in L0.points) for (const f in L0.points[k]) if (L0.points[k][f][2] !== "m") delete L0.points[k][f];
        for (const k in out) { const m = (L0.points[k] ||= {}); for (const f in out[k]) if (m[f]?.[2] !== "m") m[f] = out[k][f]; }
        edited(); say(l.aiDone);
      }
    } catch { say(location.protocol === "file:" ? l.aiOffline : l.aiFail); }
    stopRun.current = null; setBusy(null);
  };

  // ---- more ----
  const snapshot = () => {
    const v = vid.current, W = v.videoWidth, H = v.videoHeight, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d"); g.drawImage(v, 0, 0, W, H); drawScene(g, W, H, W / 640, frameNow()); v.pause();
    c.toBlob((b) => b && setSnap({ blob: b, url: URL.createObjectURL(b), at: v.currentTime }), "image/jpeg", 0.88);
  };
  const closeSnap = () => { if (snap) URL.revokeObjectURL(snap.url); setSnap(null); };
  const download = (blob, name) => { const a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 3000); };
  const snapToReport = async () => {
    try { await putClip({ id: "snap-" + uid(), kind: "snap", athleteId: athleteId || "", clipId, blob: snap.blob, mime: "image/jpeg", size: snap.blob.size, takenAt: Date.now(), inReport: true }); closeSnap(); say(l.snapAdded); }
    catch { say(l.snapFull); }
  };
  const base = clipId.replace(/\.[^.]+$/, "");

  if (err) return <div className="lb"><header className="lb-hd"><button className="lb-back" onClick={onBack}><Icon name="prev" size={20} />{l.back}</button></header><p className="lb-err" role="alert">{err}</p></div>;
  const x = L.current, f = ready ? frameNow() : 0;
  const nextPhase = x?.phases[selPhase] ? l.phases[x.phases[selPhase].key] : "";
  const shot = x?.shot;
  const sessions = getSessions(), live = getRange().live;
  const liveHere = live?.athlete_id === athleteId ? [{ athleteId, date: isoDay(new Date()), range: live }] : [];
  const choices = clip ? [...arrowChoices(sessions, athleteId, clip.recordedAt), ...arrowChoices(liveHere, athleteId, clip.recordedAt)] : [];
  const keyOf = (a) => `${a.session_id}/${a.end}/${a.arrow}`;
  const at = x ? Object.fromEntries(x.phases.filter((p) => p.start_s != null).map((p) => [p.key, p.start_s])) : null;
  const seen = x && athleteId ? notice(getReviews(), athleteId, at, clipId) : null;
  const set = (k, v) => { x[k] = v; edited(); };

  const notes = x && (
    <div className="lb-notes">
      <h3>{l.phasesTitle}</h3>
      <ol className="lb-phases">
        {x.phases.map((p, i) => (
          <li key={p.key}><button className={i === selPhase ? "on" : ""} onClick={() => { setSelPhase(i); if (p.start_s != null) { vid.current.pause(); vid.current.currentTime = p.start_s; } }}>
            <i style={{ background: PHASES[i].c }} /><span>{l.phases[p.key]}{i === selPhase && p.start_s == null ? ` · ${l.nextToMark}` : ""}</span>
            <b>{p.start_s == null ? "—" : `${p.start_s.toFixed(2)} s`}</b>
          </button></li>
        ))}
      </ol>
      <h3>{l.verdict}</h3>
      <div className="lb-chips">
        {["good", "fault"].map((k) => <button key={k} className={x.verdict === k ? "on" : ""} aria-pressed={x.verdict === k} onClick={() => set("verdict", x.verdict === k ? null : k)}>{l[k]}</button>)}
      </div>
      <h3>{l.faults}</h3>
      <div className="lb-chips">
        {FAULTS.map((t, i) => { const on = x.faults.includes(t); return <button key={t} className={on ? "on" : ""} aria-pressed={on} onClick={() => { x.faults = on ? x.faults.filter((y) => y !== t) : [...x.faults, t]; if (x.faults.length) x.verdict = "fault"; edited(); }}>{tr.quick.faults[i] || t}</button>; })}
      </div>
      <label className="lb-field">{fill(l.noteTo, { name: athlete?.name?.split(" ")[0] || l.archer })}
        <textarea rows={3} value={x.notes} placeholder={l.notesPh} onChange={(e) => set("notes", e.target.value)} />
      </label>
      <label className="lb-field">{l.arrowLink}
        <select value={shot ? keyOf(shot) : ""} onChange={(e) => { const a = choices.find((c) => keyOf(c) === e.target.value); if (a) x.shot = { session_id: a.session_id, end: a.end, arrow: a.arrow, score: a.score }; else delete x.shot; edited(); }}>
          <option value="">{l.noArrow}</option>
          {shot && !choices.some((a) => keyOf(a) === keyOf(shot)) && <option value={keyOf(shot)}>{fill(l.endArrow, { end: shot.end, n: shot.arrow })}</option>}
          {choices.map((a) => <option key={keyOf(a)} value={keyOf(a)}>{a.date} · {fill(l.endArrow, { end: a.end, n: a.arrow })} ({a.score})</option>)}
        </select>
      </label>
      <p className="lb-kept">{l.kept}</p>
    </div>
  );

  return (
    <div className={`lb ${sheet ? "sheet-open" : ""}`}>
      <header className="lb-hd">
        <button className="lb-back" onClick={onBack}><Icon name="prev" size={20} />{l.back}</button>
        <span className="lb-title">{athlete?.name || ""}{shot ? ` · ${fill(l.endArrow, { end: shot.end, n: shot.arrow })}` : ""}</span>
        <button className="lb-link" onClick={() => setSheet(!sheet)} aria-expanded={sheet}>{l.notesBtn}</button>
      </header>
      <div className="lb-body">
        <div className="lb-main">
          <div className="lb-viewer" ref={viewer} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <div className="lb-stage" ref={stage}>
              {url && <video ref={vid} src={url} playsInline muted preload="auto" onLoadedMetadata={onMeta} onError={() => setErr(l.wontPlay)} />}
              <canvas ref={cv} />
            </div>
            <canvas className="lb-loupe" ref={loupe} width={LOUPE} height={LOUPE} hidden />
            <span className="lb-hud" ref={hud} aria-live="off" />
            <span className="lb-wrist" ref={wristLbl} hidden />
            <button className="lb-zoom" ref={zoomLbl} hidden onClick={resetZoom} aria-label={l.zoomReset} />
            {!ready && !err && <span className="lb-loading">{l.loading}</span>}
            {msg && <span className="lb-msg" role="status">{msg}</span>}
          </div>
          <div className="lb-tl" ref={tlBox} dir="ltr" onPointerDown={tlDown} onPointerMove={tlMove} onPointerUp={tlUp} onPointerCancel={tlUp} aria-label={l.timeline}>
            <canvas ref={tlc} />
            <i className="lb-head" ref={head} />
          </div>

          <div className="lb-tray" key={tray}>
            {busy ? <>
              <span className="lb-busy">{msg || l.working}</span>
              <button className="lb-b y" onClick={() => stopRun.current?.()}>{l.stop}</button>
            </> : <>
              {tray === "play" && <>
                <button className="lb-b ico" onClick={() => step(-1)} aria-label={l.stepBack} disabled={!ready}><Icon name="prev" size={20} /></button>
                <button className="lb-b y wide" onClick={toggle} disabled={!ready}>{playing ? l.pause : l.play}</button>
                <button className="lb-b ico" onClick={() => step(1)} aria-label={l.stepFwd} disabled={!ready}><Icon name="next" size={20} /></button>
                <span className="lb-seg">{[0.125, 0.25, 0.5, 1].map((r) => <button key={r} className={rate === r ? "on" : ""} aria-pressed={rate === r} onClick={() => setSpeed(r)}>{{ 0.125: "⅛×", 0.25: "¼×", 0.5: "½×", 1: "1×" }[r]}</button>)}</span>
              </>}
              {tray === "phases" && <>
                <button className="lb-b y wide" onClick={mark} disabled={!ready}>{fill(l.markNext, { phase: nextPhase })}</button>
                <button className="lb-b" onClick={findPhases} disabled={!ready}>{l.findPhases}</button>
                <button className="lb-b" onClick={undoMark} disabled={!marks.current.length}>{l.undo}</button>
              </>}
              {tray === "points" && <>
                <label className="lb-pick"><span>{l.nextPoint}</span>
                  <select className="lb-next" value={selPt} onChange={(e) => setSelPt(+e.target.value)}>{POINTS.map((p, i) => <option key={p.k} value={i}>{l.pts[p.k]}{x?.points[p.k]?.[f] ? " ●" : ""}</option>)}</select>
                </label>
                <button className="lb-b" onClick={followPoints} disabled={!ready}>{l.follow}</button>
                <button className="lb-b" onClick={aiTrack} disabled={!ready}>{l.ai}</button>
                <p className="lb-hint">{l.gestures}</p>
              </>}
              {tray === "draw" && <>
                <span className="lb-tools" role="toolbar" aria-label={l.tools}>{TOOLS.map(([t, icon]) => <button key={t} className={tool === t ? "on" : ""} aria-pressed={tool === t} aria-label={l[t]} title={l[t]} onClick={() => { angleDraft.current = null; setTool(t); }}>{icon}</button>)}</span>
                <span className="lb-colors">{COLORS.map((c) => <button key={c} className={color === c ? "on" : ""} style={{ background: c }} aria-label={l.colour} aria-pressed={color === c} onClick={() => setColor(c)} />)}</span>
                <button className="lb-b" disabled={!x?.drawings.length} onClick={() => { x.drawings = x.drawings.slice(0, -1); edited(); }}>{l.undo}</button>
                <p className="lb-hint">{tool === "angle" ? l.hints.angle : l.drawGestures}</p>
              </>}
              {tray === "more" && <>
                <button className="lb-b" onClick={snapshot} disabled={!ready}>{l.snapshot}</button>
                <button className="lb-b" onClick={() => x && download(new Blob([JSON.stringify(x, null, 2)], { type: "application/json" }), `${base}.labels.json`)} disabled={!ready}>{l.downloadLabels}</button>
                <label className="lb-pick"><span>{l.engine}</span>
                  <select value={engine} onChange={(e) => setEngine(e.target.value)}><option value="mediapipe">{l.engines.mediapipe}</option><option value="rtm">{l.engines.rtm}</option></select>
                </label>
                <label className="lb-pick"><span>{l.startsAt}</span>
                  <select value={start} onChange={(e) => { setStartS(e.target.value); setStart(clipId, e.target.value); }}>{STARTS.map((k) => <option key={k} value={k}>{l.starts[k]}</option>)}</select>
                </label>
                {seen && seen.n >= 3 && <div className="lb-seen">
                  <b>{fill(l.notices, { n: seen.faults.length + seen.similar.length })}</b>
                  {seen.hold != null && seen.usualHold != null && <p>{fill(l.holdVs, { now: seen.hold.toFixed(2), usual: seen.usualHold.toFixed(2) })}</p>}
                  {seen.faults.map((q) => <p key={q.fault}>{fill(l.faultHint, { fault: tr.quick.faults[FAULTS.indexOf(q.fault)] || q.fault, times: q.times, of: q.of })}</p>)}
                  {!seen.faults.length && !seen.similar.length && <p>{l.nothing}</p>}
                </div>}
              </>}
            </>}
          </div>
          <nav className="lb-dock" aria-label={l.tools}>
            {DOCK.map(([k, icon]) => <button key={k} className={tray === k ? "on" : ""} aria-pressed={tray === k} onClick={() => { angleDraft.current = null; setTray(k); paint(); }}>{icon}<span>{l.dock[k]}</span></button>)}
          </nav>
        </div>
        <aside className="lb-side" aria-label={l.notesBtn}>
          <div className="lb-grip" onClick={() => setSheet(false)} aria-hidden="true" />
          {notes}
        </aside>
      </div>
      {snap && (
        <div className="lb-snap" role="dialog" aria-label={l.snapshot}>
          <img src={snap.url} alt="" />
          <div className="lb-row">
            <button className="lb-b y" onClick={() => download(snap.blob, `${base}_${snap.at.toFixed(2)}s.jpg`)}>{l.download}</button>
            <button className="lb-b" onClick={snapToReport} disabled={!athleteId}>{l.toReport}</button>
            <button className="lb-b" onClick={closeSnap}>{l.close}</button>
          </div>
        </div>
      )}
    </div>
  );
}
