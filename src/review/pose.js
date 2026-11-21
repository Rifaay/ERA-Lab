// AI body tracking for the Labeller, on this device: the video never leaves it. The work runs in a background thread
// (pose.worker.js) on exact frames read one after another, so the screen stays smooth. Two free engines:
// "mediapipe", Google's Pose Landmarker heavy model (Apache-2.0, about 30 MB, fetched from Google once), and "rtm",
// OpenMMLab's RTMPose-m (Apache-2.0, 54 MB, served with the app), sharper on elbows and wrists but without a hand point.
// The points come back in the Labeller's own form, so placing, correcting and saving work as before.
import { frames as readFrames } from "./frames.js";

const SURE = 0.5, UNSURE = 0.2; // sure points are drawn solid; unsure ones are kept but faded; below that, left out
const GAP = 6; // a point missing for up to this many frames is filled in between its neighbours (faded)

// MediaPipe's numbers for the person's left side; the right side is the next number.
const LEFT = { shoulder: 11, elbow: 13, wrist: 15, hand: 19, hip: 23, knee: 25, ankle: 27 };
const NOSE = 0, EARS = [7, 8];

// The bow arm reaches away from the face; the draw hand comes back to it. Over the clip, the wrist that stays farther
// from the nose is the bow wrist. Works for left- and right-handed archers alike. frames: [landmarks[] | null].
export function bowSide(frames) {
  let l = 0, r = 0;
  for (const p of frames) if (p) {
    const n = p[NOSE], d = (i) => Math.hypot(p[i].x - n.x, p[i].y - n.y);
    l += d(LEFT.wrist); r += d(LEFT.wrist + 1);
  }
  return l >= r ? "left" : "right";
}

// One Euro filter (Casiez et al. 2012), run forwards and backwards and averaged: steady points stop shaking, quick
// moves (the release) keep their timing. Holes (null) split the run. xs: numbers or null, sampled at `rate` per second.
export function smooth(xs, rate, { minCutoff = 1.2, beta = 0.8, dCutoff = 1 } = {}) {
  const alpha = (fc) => 1 / (1 + rate / (2 * Math.PI * fc));
  const pass = (arr) => {
    const out = Array(arr.length).fill(null);
    let prev = null, dx = 0;
    for (let i = 0; i < arr.length; i++) {
      const x = arr[i];
      if (x == null) { prev = null; dx = 0; continue; }
      if (prev == null) { out[i] = prev = x; continue; }
      const a = alpha(dCutoff); dx = a * (x - prev) * rate + (1 - a) * dx;
      const b = alpha(minCutoff + beta * Math.abs(dx));
      out[i] = prev = b * x + (1 - b) * prev;
    }
    return out;
  };
  const f = pass(xs), b = pass([...xs].reverse()).reverse();
  return xs.map((x, i) => (x == null ? null : (f[i] + b[i]) / 2));
}

// The model's frames → the Labeller's points: { key: { frame: [x, y, "t"] } }, x and y as fractions of the picture.
// full: the whole skeleton (hips, knees, ankles) as well as the head and arms.
export function toPoints(frames, rate, full = true) {
  const bow = bowSide(frames);
  const at = (i, arm) => i + ((arm === "bow") === (bow === "left") ? 0 : 1); // person's left side, or the next number for the right
  const map = {
    bow_shoulder: at(LEFT.shoulder, "bow"), bow_elbow: at(LEFT.elbow, "bow"), bow_wrist: at(LEFT.wrist, "bow"),
    draw_shoulder: at(LEFT.shoulder, "draw"), draw_elbow: at(LEFT.elbow, "draw"), draw_wrist: at(LEFT.wrist, "draw"), draw_hand: at(LEFT.hand, "draw"),
    ...(full && { bow_hip: at(LEFT.hip, "bow"), draw_hip: at(LEFT.hip, "draw"), bow_knee: at(LEFT.knee, "bow"), draw_knee: at(LEFT.knee, "draw"),
      bow_ankle: at(LEFT.ankle, "bow"), draw_ankle: at(LEFT.ankle, "draw") }),
  };
  const series = { head: frames.map((p) => { // the ear the camera sees best: the Labeller's head mark is the temple
    if (!p) return null;
    const e = EARS.map((i) => p[i]).sort((a, b) => (b.visibility ?? 1) - (a.visibility ?? 1))[0];
    return (e.visibility ?? 1) >= UNSURE ? e : null;
  }) };
  for (const [k, i] of Object.entries(map)) series[k] = frames.map((p) => (p && (p[i].visibility ?? 1) >= UNSURE ? p[i] : null));
  const out = {};
  for (const [k, raw] of Object.entries(series)) {
    const list = fillGaps(raw), xs = smooth(list.map((q) => q?.x ?? null), rate), ys = smooth(list.map((q) => q?.y ?? null), rate), m = {};
    list.forEach((q, f) => { if (q) m[f] = [+xs[f].toFixed(5), +ys[f].toFixed(5), q.filled || (q.visibility ?? 1) < SURE ? "i" : "t"]; });
    if (Object.keys(m).length) out[k] = m;
  }
  return out;
}

// Short holes (a point hidden behind the bow for a few frames) are filled on the line between their neighbours.
export function fillGaps(list, max = GAP) {
  const out = [...list];
  let last = -1;
  for (let i = 0; i < list.length; i++) {
    if (!list[i]) continue;
    if (last >= 0 && i - last > 1 && i - last - 1 <= max) {
      const a = list[last], b = list[i];
      for (let g = last + 1; g < i; g++) { const t = (g - last) / (i - last); out[g] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, filled: true }; }
    }
    last = i;
  }
  return out;
}

// Tracks the whole clip. Returns { stop(), done: Promise<points> }. Two frames are in flight at once: the next one
// is being read while the worker reads the body in this one.
export function trackPose({ vid, fps, frames, full = true, engine = "mediapipe", onProgress, onReady }) {
  const ctl = { stopped: false };
  let worker = null;
  const done = (async () => {
    worker = new Worker(new URL("./pose.worker.js", import.meta.url), { type: "module" });
    const waiting = new Map(), seen = Array(frames).fill(null);
    let ready, failed;
    const started = new Promise((res, rej) => { ready = res; failed = rej; });
    worker.onmessage = ({ data: m }) => {
      if (m.type === "ready") ready();
      else if (m.type === "error") { failed(new Error(m.message)); for (const w of waiting.values()) w.rej(new Error(m.message)); }
      else if (m.type === "pose") { seen[m.f] = m.pts && m.pts.map((p) => ({ x: p.x, y: p.y, visibility: p.s })); waiting.get(m.f)?.res(); waiting.delete(m.f); }
    };
    worker.postMessage({ type: "init", engine, base: new URL("./", document.baseURI).href });
    await started;
    onReady?.();
    const pending = [];
    for await (const { f, bmp } of readFrames(vid, fps, 0, frames, ctl)) {
      pending.push(new Promise((res, rej) => waiting.set(f, { res, rej })));
      worker.postMessage({ type: "frame", f, bmp }, [bmp]);
      if (pending.length >= 2) await pending.shift();
      if (f % 5 === 0) onProgress?.(f, frames);
    }
    await Promise.all(pending);
    return toPoints(seen, fps, full);
  })().finally(() => worker?.terminate());
  return { stop: () => { ctl.stopped = true; }, done };
}
