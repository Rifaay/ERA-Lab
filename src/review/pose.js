// AI body tracking for the Labeller, on this device: the video never leaves it. The work runs in a background thread
// (pose.worker.js) on exact frames read one after another, so the screen stays smooth. Two free engines:
// "mediapipe", Google's Pose Landmarker heavy model (Apache-2.0, about 30 MB, fetched from Google once), and "rtm",
// OpenMMLab's RTMPose-m (Apache-2.0, 54 MB, served with the app), sharper on elbows and wrists but without a hand point.
// The points come back in the Labeller's own form, so placing, correcting and saving work as before.
import { frames as readFrames } from "./frames.js";

const SURE = 0.5, UNSURE = 0.2; // sure points are drawn solid; unsure ones are kept but faded; below that, left out
// (short holes are drawn in between their neighbours by the Labeller's ptAt, so they aren't filled here)

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

// Side-on, the far arm and leg are hidden and pose models swap left and right for a frame or two. Each left/right
// pair is swapped back when that makes it move less from the frame before. frames: [landmarks[] | null], new copies.
const PAIRS = [7, ...Object.values(LEFT)]; // ears, then each limb joint; the right side is the next number
export function unswap(frames) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let prev = null;
  return frames.map((p) => {
    if (!p) return null;
    const q = p.slice();
    if (prev) for (const l of PAIRS) {
      const r = l + 1, ok = (i) => (q[i].visibility ?? 1) >= UNSURE && (prev[i].visibility ?? 1) >= UNSURE;
      if (!ok(l) || !ok(r)) continue;
      if (d(q[l], prev[r]) + d(q[r], prev[l]) < 0.7 * (d(q[l], prev[l]) + d(q[r], prev[r]))) [q[l], q[r]] = [q[r], q[l]];
    }
    prev = q;
    return q;
  });
}

// A point that leaps away for one frame and comes straight back is a wrong guess, not movement: it becomes a hole,
// which the Labeller fills from the frames around it. lim: the leap, as a fraction of the picture.
export function despike(list, lim) {
  return list.map((q, i) => {
    const a = list[i - 1], b = list[i + 1];
    if (!q || !a || !b || Math.hypot(a.x - b.x, a.y - b.y) > lim / 2) return q;
    return Math.hypot(q.x - (a.x + b.x) / 2, q.y - (a.y + b.y) / 2) > lim ? null : q;
  });
}
// How tall the archer stands in the picture (median over the clip of the sure points' spread), for despike's limit.
const bodyHeight = (frames) => {
  const hs = frames.filter(Boolean).map((p) => { const ys = p.filter((q) => (q.visibility ?? 1) >= SURE).map((q) => q.y); return ys.length >= 4 ? Math.max(...ys) - Math.min(...ys) : null; })
    .filter((h) => h != null).sort((a, b) => a - b);
  return hs.length ? hs[hs.length >> 1] : 0.5;
};

// The model's frames → the Labeller's points: { key: { frame: [x, y, "t"] } }, x and y as fractions of the picture.
// full: the whole skeleton (hips, knees, ankles) as well as the head and arms.
export function toPoints(frames, rate, full = true) {
  frames = unswap(frames);
  const bow = bowSide(frames), lim = Math.max(0.02, 0.08 * bodyHeight(frames));
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
    // Only sure points steer the smoothing; an unsure guess is shown faded where it is, unless it leaps off the body.
    const sure = despike(raw.map((q) => (q && (q.visibility ?? 1) >= SURE ? q : null)), lim), unsure = despike(raw, lim);
    const xs = smooth(sure.map((q) => q?.x ?? null), rate), ys = smooth(sure.map((q) => q?.y ?? null), rate), m = {};
    raw.forEach((q, f) => {
      if (sure[f]) m[f] = [+xs[f].toFixed(5), +ys[f].toFixed(5), "t"];
      else if (q && unsure[f]) m[f] = [+q.x.toFixed(5), +q.y.toFixed(5), "i"];
    });
    if (Object.keys(m).length) out[k] = m;
  }
  return out;
}

// Tracks the whole clip. Returns { stop(), done: Promise<points> }. Two frames are in flight at once: the next one
// is being read while the worker reads the body in this one.
export function trackPose({ vid, fps, frames, full = true, engine = "mediapipe", onProgress, onReady }) {
  const ctl = { stopped: false };
  let worker = null;
  const done = (async () => {
    // A hidden copy of the clip: the coach can play, step and scrub the one on screen while this reads frames.
    const copy = document.createElement("video");
    copy.muted = true; copy.preload = "auto"; copy.src = vid.currentSrc || vid.src;
    await new Promise((res, rej) => { copy.addEventListener("loadeddata", res, { once: true }); copy.addEventListener("error", () => rej(new Error("The clip could not be read for tracking")), { once: true }); });
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
    for await (const { f, bmp } of readFrames(copy, fps, 0, frames, ctl)) {
      const p = new Promise((res, rej) => waiting.set(f, { res, rej }));
      p.catch(() => {}); // a failure is reported once, by the frame awaited first; the others mustn't surface as unhandled
      pending.push(p);
      worker.postMessage({ type: "frame", f, bmp }, [bmp]);
      if (pending.length >= 2) await pending.shift();
      if (f % 5 === 0) onProgress?.(f, frames);
    }
    await Promise.all(pending);
    return toPoints(seen, fps, full);
  })().finally(() => worker?.terminate());
  return { stop: () => { ctl.stopped = true; }, done };
}
