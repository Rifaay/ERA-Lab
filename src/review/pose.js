// AI body tracking for the Labeller. Google's MediaPipe Pose Landmarker (free, Apache-2.0) finds 33 body points on
// every frame, on this device: the video never leaves it. Only the model is downloaded, once (about 9 MB), then the
// browser keeps it. The points come back in the Labeller's own form, so placing, correcting and saving work as before.

const VER = "0.10.14";
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`;
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const MIN_VIS = 0.5; // a point the model can't see well is left out; the Labeller fills short gaps between frames

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
    return (e.visibility ?? 1) >= MIN_VIS ? e : null;
  }) };
  for (const [k, i] of Object.entries(map)) series[k] = frames.map((p) => (p && (p[i].visibility ?? 1) >= MIN_VIS ? p[i] : null));
  const out = {};
  for (const [k, list] of Object.entries(series)) {
    const xs = smooth(list.map((q) => q?.x ?? null), rate), ys = smooth(list.map((q) => q?.y ?? null), rate), m = {};
    list.forEach((q, f) => { if (q) m[f] = [+xs[f].toFixed(5), +ys[f].toFixed(5), "t"]; });
    if (Object.keys(m).length) out[k] = m;
  }
  return out;
}

let model = null, clock = 0; // one model for the whole visit; VIDEO mode needs times that only go up
const load = async () => {
  if (model) return model;
  const { FilesetResolver, PoseLandmarker } = await import(/* @vite-ignore */ `${CDN}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  const make = (delegate) => PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  model = await make("GPU").catch(() => make("CPU")); // a phone or PC without WebGL falls back to the processor
  return model;
};

// Tracks the whole clip, frame by frame. Returns { stop(), done: Promise<points> }.
export function trackPose({ vid, fps, frames, full = true, onProgress }) {
  let stopped = false;
  const done = (async () => {
    const lm = await load(), seen = [];
    const seek = (t) => new Promise((r) => { vid.addEventListener("seeked", r, { once: true }); vid.currentTime = t; });
    for (let f = 0; f < frames && !stopped; f++) {
      await seek((f + 0.5) / fps);
      clock = Math.max(clock + 1, performance.now());
      seen.push(lm.detectForVideo(vid, clock).landmarks?.[0] || null);
      if (f % 5 === 0) onProgress?.(f, frames);
    }
    return toPoints(seen, fps, full);
  })();
  return { stop: () => { stopped = true; }, done };
}
