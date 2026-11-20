import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { angleOf } from "./draw";
import { STARTS, getStart, setStart, notice } from "./learn";
import { getReviews, uid } from "../storage";
import { putClip } from "../clipStore";
import { FAULTS } from "../clips";

const COLORS = ["#f2c40c", "#ff3b30", "#00e0c6", "#ffffff"];
const TOOLS = [["line", "╱"], ["arrow", "➚"], ["circle", "◯"], ["angle", "∠"], ["pen", "✎"]];
const KEY = "racm_drawings";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saveAll = (all) => { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage full: drawings stay for this visit */ } };

// The picture inside the letterboxed <video>, relative to the viewer (the same sum the Labeller uses for its points).
const pictureRect = (viewer, vid) => {
  const r = vid.getBoundingClientRect(), p = viewer.getBoundingClientRect(), vw = vid.videoWidth || r.width || 1, vh = vid.videoHeight || r.height || 1;
  const k = Math.min(r.width / vw, r.height / vh), w = vw * k, h = vh * k;
  return { x: r.left - p.left - viewer.clientLeft + (r.width - w) / 2, y: r.top - p.top - viewer.clientTop + (r.height - h) / 2, w, h };
};
// Zoomed in, the picture is bigger than the viewer: the canvas covers only the part on screen (as the Labeller's does).
const shown = (R, viewer) => {
  const x = Math.max(0, R.x), y = Math.max(0, R.y);
  return { x, y, w: Math.max(1, Math.min(viewer.clientWidth, R.x + R.w) - x), h: Math.max(1, Math.min(viewer.clientHeight, R.y + R.h) - y) };
};

// Draws shapes (points in 0–1 of the picture) onto a 2D context of size w × h. `ar` is the video's width / height.
const paint = (c, shapes, w, h, ar, scale = 1) => {
  for (const s of shapes) {
    const P = s.p.map(([x, y]) => [x * w, y * h]);
    c.strokeStyle = c.fillStyle = s.c; c.lineWidth = 3 * scale; c.lineCap = c.lineJoin = "round";
    c.shadowColor = "rgba(0,0,0,.7)"; c.shadowBlur = 3 * scale;
    c.beginPath();
    if (s.t === "circle" && P[1]) { c.arc(P[0][0], P[0][1], Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), 0, 7); }
    else { P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); }
    c.stroke();
    if (s.t === "arrow" && P[1]) {
      const [a, b] = P, ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 16 * scale;
      c.beginPath(); c.moveTo(b[0], b[1]);
      c.lineTo(b[0] - L * Math.cos(ang - 0.45), b[1] - L * Math.sin(ang - 0.45));
      c.lineTo(b[0] - L * Math.cos(ang + 0.45), b[1] - L * Math.sin(ang + 0.45)); c.closePath(); c.fill();
    }
    if (s.t === "angle") {
      for (const [x, y] of P) { c.beginPath(); c.arc(x, y, 4 * scale, 0, 7); c.fill(); }
      if (s.p.length === 3) {
        const deg = angleOf(s.p[0], s.p[1], s.p[2], ar);
        c.font = `700 ${18 * scale}px system-ui, sans-serif`; c.shadowBlur = 0;
        const label = `${deg.toFixed(0)}°`, tx = P[1][0] + 10 * scale, ty = P[1][1] - 10 * scale, tw = c.measureText(label).width;
        c.fillStyle = "rgba(0,0,0,.75)"; c.fillRect(tx - 4 * scale, ty - 18 * scale, tw + 8 * scale, 24 * scale);
        c.fillStyle = s.c; c.fillText(label, tx, ty);
      }
    }
    c.shadowBlur = 0;
  }
};

// Tools on top of the Labeller's video, so the coach marks body points and draws without changing tabs.
// Points: the Labeller's own points, placed with its own logic (its "Place points" button and point list, clicked
// for the coach). Drawings: lines, arrows, circles, angles and freehand, kept per clip on this device.
export default function LabTools({ host, tr, clip: openClip, archerId, phases }) {
  const l = tr.lab;
  const [slot, setSlot] = useState(null);
  const [tool, setTool] = useState(null); // null | "points" | a drawing tool
  const [color, setColor] = useState(COLORS[0]);
  const [shapes, setShapes] = useState([]);
  const [pointName, setPointName] = useState("");
  const [start, setStartState] = useState("stance");
  const [snap, setSnap] = useState(null); // { blob, url } while the coach chooses what to do with it
  const [snapMsg, setSnapMsg] = useState("");
  const [open, setOpen] = useState(false); // ERA Lab notices, folded by default
  const [, setTick] = useState(0);
  const cv = useRef(null), draft = useRef(null), clip = useRef("");
  const $ = (id) => host.querySelector("#" + id);

  // A row above the video controls, and a canvas over the picture.
  useEffect(() => {
    const transport = host.querySelector(".transport"), viewer = $("viewer");
    if (!transport || !viewer) return;
    const bar = document.createElement("div"); bar.className = "lab-tools";
    transport.before(bar);
    const canvas = document.createElement("canvas"); canvas.className = "lab-draw";
    viewer.appendChild(canvas); cv.current = canvas;
    setSlot(bar); // eslint-disable-line react-hooks/set-state-in-effect -- the portal target only exists once the Labeller is mounted
    return () => { bar.remove(); canvas.remove(); };
  }, [host]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the Labeller: which clip is open, which point comes next, whether its point mode is on.
  useEffect(() => {
    if (!slot) return;
    const list = $("ptList"), vid = $("vid");
    const read = () => {
      setPointName(list.querySelector(".pt.on span:nth-child(2)")?.textContent || "");
      setTick((n) => n + 1);
    };
    const seen = new MutationObserver(read);
    seen.observe(list, { childList: true, subtree: true });
    seen.observe($("ptMode"), { childList: true, characterData: true, subtree: true });
    vid.addEventListener("loadedmetadata", read);
    read();
    return () => { seen.disconnect(); vid.removeEventListener("loadedmetadata", read); };
  }, [slot]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new clip: its own drawings and start, and nothing left over from the last one.
  useEffect(() => {
    clip.current = openClip;
    setShapes(load()[openClip] || []); setStartState(getStart(openClip)); setSnap(null); setSnapMsg(""); // eslint-disable-line react-hooks/set-state-in-effect -- reset per clip
  }, [openClip]);

  const pointsOn = () => $("ptMode")?.classList.contains("on");
  const setPoints = (on) => { if (pointsOn() !== on) $("ptMode").click(); };

  // Redraw on every change of size, shapes or draft.
  const redraw = () => {
    const canvas = cv.current, viewer = $("viewer"), vid = $("vid");
    if (!canvas || !viewer || !vid) return;
    const R = pictureRect(viewer, vid), V = shown(R, viewer), dpr = devicePixelRatio || 1;
    Object.assign(canvas.style, { left: V.x + "px", top: V.y + "px", width: V.w + "px", height: V.h + "px", pointerEvents: tool && tool !== "points" ? "auto" : "none" });
    canvas.width = V.w * dpr; canvas.height = V.h * dpr;
    const c = canvas.getContext("2d"); c.scale(dpr, dpr); c.translate(R.x - V.x, R.y - V.y);
    const ar = (vid.videoWidth || 16) / (vid.videoHeight || 9);
    paint(c, draft.current ? [...shapes, draft.current] : shapes, R.w, R.h, ar);
  };
  useEffect(() => {
    if (!slot) return;
    redraw();
    const ro = new ResizeObserver(redraw); ro.observe($("viewer"));
    const vid = $("vid"); vid.addEventListener("loadedmetadata", redraw); window.addEventListener("racm-zoom", redraw);
    return () => { ro.disconnect(); vid.removeEventListener("loadedmetadata", redraw); window.removeEventListener("racm-zoom", redraw); };
  });

  const keep = (next) => {
    setShapes(next);
    if (!clip.current) return;
    const all = load();
    if (next.length) all[clip.current] = next; else delete all[clip.current];
    saveAll(all);
  };

  // Drawing on the canvas: press, drag, lift. An angle takes three taps: one end, the corner, the other end.
  useEffect(() => {
    const canvas = cv.current;
    if (!canvas || !tool || tool === "points") return;
    const at = (e) => { // relative to the whole picture, which may reach past the canvas when zoomed in
      const viewer = $("viewer"), R = pictureRect(viewer, $("vid")), p = viewer.getBoundingClientRect();
      const x = e.clientX - p.left - viewer.clientLeft - R.x, y = e.clientY - p.top - viewer.clientTop - R.y;
      return [+(x / R.w).toFixed(4), +(y / R.h).toFixed(4)];
    };
    const down = (e) => {
      if (!e.isPrimary) { draft.current = null; redraw(); return; } // a second finger: that's a pinch, not a drawing
      e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); $("vid").pause();
      const p = at(e);
      if (tool === "angle") {
        const d = draft.current?.t === "angle" ? draft.current : { t: "angle", c: color, p: [] };
        d.p = [...d.p, p];
        if (d.p.length === 3) { draft.current = null; keep([...shapes, d]); } else { draft.current = d; redraw(); }
        return;
      }
      draft.current = { t: tool, c: color, p: [p, p] }; redraw();
    };
    const move = (e) => {
      const d = draft.current;
      if (!d || d.t === "angle" || !e.buttons) return;
      const p = at(e);
      d.p = d.t === "pen" ? [...d.p, p] : [d.p[0], p]; redraw();
    };
    const up = () => {
      const d = draft.current;
      if (!d || d.t === "angle") return;
      draft.current = null;
      const [a, b] = [d.p[0], d.p[d.p.length - 1]];
      if (d.t === "pen" ? d.p.length > 2 : Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.01) keep([...shapes, d]); else redraw();
    };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    return () => { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); };
  }, [tool, color, shapes]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (t) => {
    draft.current = null;
    const next = tool === t ? null : t;
    setPoints(next === "points");
    setTool(next);
  };
  const nextPoint = () => {
    const items = [...$("ptList").children], i = items.findIndex((x) => x.classList.contains("on"));
    items[(i + 1) % items.length]?.click();
  };

  // A still of the current frame with the drawings and the Labeller's points, at the video's own size.
  const takeSnapshot = () => {
    const vid = $("vid"), ov = $("ov");
    if (!vid.videoWidth) return;
    // Zoomed in, the still is the part on screen, cut from the clip at its own resolution; whole picture otherwise.
    const W = vid.videoWidth, H = vid.videoHeight, viewer = $("viewer"), R = pictureRect(viewer, vid), V = shown(R, viewer);
    const sx = (V.x - R.x) / R.w * W, sy = (V.y - R.y) / R.h * H, sw = Math.round(V.w / R.w * W), sh = Math.round(V.h / R.h * H);
    const c = document.createElement("canvas");
    c.width = sw; c.height = sh;
    const g = c.getContext("2d");
    g.drawImage(vid, sx, sy, sw, sh, 0, 0, sw, sh);
    if (ov?.width) g.drawImage(ov, 0, 0, sw, sh); // the points layer covers exactly the part on screen
    g.translate(-sx, -sy);
    paint(g, shapes, W, H, W / H, sw / 640);
    vid.pause();
    c.toBlob((b) => { if (b) { setSnapMsg(""); setSnap({ blob: b, url: URL.createObjectURL(b), at: vid.currentTime }); } }, "image/jpeg", 0.88);
  };
  const closeSnap = () => { if (snap) URL.revokeObjectURL(snap.url); setSnap(null); };
  const downloadSnap = () => {
    const a = document.createElement("a");
    a.href = snap.url; a.download = `${(clip.current || "clip").replace(/\.[^.]+$/, "")}_${snap.at.toFixed(2)}s.jpg`; a.click();
  };
  const reportSnap = async () => {
    try {
      await putClip({ id: "snap-" + uid(), kind: "snap", athleteId: archerId || "", clipId: clip.current, blob: snap.blob, mime: "image/jpeg", size: snap.blob.size, takenAt: Date.now(), inReport: true });
      closeSnap(); setSnapMsg(l.snapAdded);
    } catch { setSnapMsg(l.snapFull); }
  };
  const chooseStart = (k) => { setStartState(k); if (clip.current) setStart(clip.current, k); };
  const seen = phases ? notice(getReviews(), archerId, phases, openClip) : null;
  const hints = seen ? seen.faults.length + seen.similar.length : 0;

  if (!slot) return null;
  const on = tool === "points" && pointsOn();
  return createPortal(
    <>
      <div className="lt-row" role="toolbar" aria-label={l.tools}>
        <button type="button" className={`lt-btn ${on ? "on" : ""}`} aria-pressed={on} onClick={() => choose("points")}>{l.points}</button>
        {on && <button type="button" className="lt-btn lt-next" onClick={nextPoint} title={l.nextPoint}>{pointName || "—"} ›</button>}
        {TOOLS.map(([t, icon]) => (
          <button key={t} type="button" className={`lt-btn lt-ico ${tool === t ? "on" : ""}`} aria-pressed={tool === t} aria-label={l[t]} title={l[t]} onClick={() => choose(t)}>{icon}</button>
        ))}
      </div>
      <div className="lt-row">
        {COLORS.map((c) => (
          <button key={c} type="button" className={`lt-color ${color === c ? "on" : ""}`} style={{ background: c }} aria-label={l.colour} aria-pressed={color === c} onClick={() => setColor(c)} />
        ))}
        <button type="button" className="lt-btn" disabled={!shapes.length} onClick={() => keep(shapes.slice(0, -1))}>{l.undo}</button>
        <button type="button" className="lt-btn" disabled={!shapes.length} onClick={() => window.confirm(l.confirmClear) && keep([])}>{l.clear}</button>
        <button type="button" className="lt-btn" onClick={takeSnapshot}>{l.snapshot}</button>
      </div>
      {tool && <p className="lt-hint" role="status">{l.hints[tool]}</p>}
      {snap && (
        <div className="lt-snap" role="dialog" aria-label={l.snapshot}>
          <img src={snap.url} alt="" />
          <div className="lt-row">
            <button type="button" className="lt-btn on" onClick={downloadSnap}>{l.download}</button>
            <button type="button" className="lt-btn" onClick={reportSnap} disabled={!archerId}>{l.toReport}</button>
            <button type="button" className="lt-btn" onClick={closeSnap}>{l.close}</button>
          </div>
          {!archerId && <p className="lt-hint">{l.noArcher}</p>}
        </div>
      )}
      {snapMsg && <p className="lt-hint" role="status">{snapMsg}</p>}
      <div className="lt-row">
        <label className="lt-start">{l.startsAt}
          <select value={start} onChange={(e) => chooseStart(e.target.value)}>
            {STARTS.map((k) => <option key={k} value={k}>{l.starts[k]}</option>)}
          </select>
        </label>
      </div>
      {seen && (seen.n >= 3 || hints > 0) && (
        <div className="lt-notice">
          <button type="button" className="lt-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{l.notices.replace("{n}", hints)}</button>
          {open && <>
            <p className="lt-hint">{l.learned.replace("{n}", seen.n)}</p>
            {seen.hold != null && seen.usualHold != null && <p>{l.holdVs.replace("{now}", seen.hold.toFixed(2)).replace("{usual}", seen.usualHold.toFixed(2))}</p>}
            {seen.faults.map((f) => <p key={f.fault}>⚑ {l.faultHint.replace("{fault}", tr.quick.faults[FAULTS.indexOf(f.fault)] || f.fault).replace("{times}", f.times).replace("{of}", f.of)}</p>)}
            {seen.similar.map((x) => <p key={x.id} className="lt-note">“{x.notes}” <small>{x.date}</small></p>)}
            {!hints && <p className="lt-hint">{l.nothing}</p>}
          </>}
        </div>
      )}
    </>,
    slot,
  );
}
