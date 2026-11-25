// The Labeller's model, with no screen in it: phases, body points, drawings, motion and the touch gestures.
// Positions are in 0–1 of the picture (x right, y down), so they survive any screen size or zoom.

export const PHASES = [
  { key: "stance", c: "#5c6bc0" }, { key: "hook", c: "#7e57c2" }, { key: "raise", c: "#26a69a" }, { key: "draw", c: "#7cb342" },
  { key: "anchor", c: "#fbc02d" }, { key: "hold", c: "#fb8c00" }, { key: "release", c: "#e53935" }, { key: "follow", c: "#8d6e63" },
];
export const POINTS = [
  { k: "head", c: "#efe9dc" }, { k: "bow_shoulder", c: "#7a6aa8" }, { k: "bow_elbow", c: "#9b8fd0" }, { k: "bow_wrist", c: "#c9a227" },
  { k: "draw_shoulder", c: "#3f8fb0" }, { k: "draw_elbow", c: "#2bb3a3" }, { k: "draw_wrist", c: "#7fb85b" }, { k: "draw_hand", c: "#f2c40c" },
  { k: "bow_hip", c: "#8a7fb5" }, { k: "draw_hip", c: "#4aa0c0" }, { k: "bow_knee", c: "#a99fd8" }, { k: "draw_knee", c: "#5fc4b5" },
  { k: "bow_ankle", c: "#c4bce8" }, { k: "draw_ankle", c: "#8fd6cb" },
];
export const BONES = [["bow_shoulder", "bow_elbow"], ["bow_elbow", "bow_wrist"], ["bow_shoulder", "draw_shoulder"], ["draw_shoulder", "draw_elbow"],
  ["draw_elbow", "draw_wrist"], ["draw_wrist", "draw_hand"], ["bow_shoulder", "bow_hip"], ["draw_shoulder", "draw_hip"], ["bow_hip", "draw_hip"],
  ["bow_hip", "bow_knee"], ["bow_knee", "bow_ankle"], ["draw_hip", "draw_knee"], ["draw_knee", "draw_ankle"]];

export const blank = (clip, fps = 30, duration = null) => ({
  schema: "racm.labels.v1", clip, athlete: "", date: "", camera_angle: "", capture_fps: null, playback_fps: fps, duration_s: duration,
  phases: PHASES.map((p) => ({ key: p.key, name: p.key, start_s: null, start_frame: null, source: null, confidence: null })),
  release_s: null, verdict: null, faults: [], notes: "", labelled_by: "", labelled_at: null, hints: { motion_analysed: false, suggested: false },
  points: {}, drawings: [],
});

// A body point on frame f: the mark itself, else a straight line between the nearest marks up to `gap` frames apart
// (kind "i", drawn faded), else nothing. Keep gap short (a quarter second): a line across a fast release leaves the arm.
export function ptAt(points, k, f, gap = 8) {
  const m = points?.[k];
  if (!m) return null;
  if (m[f]) return m[f];
  let a = null, b = null;
  for (const s in m) { const i = +s; if (i < f && (a == null || i > a)) a = i; if (i > f && (b == null || i < b)) b = i; }
  if (a != null && b != null && b - a <= gap) { const u = (f - a) / (b - a), A = m[a], B = m[b]; return [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, "i"]; }
  return null;
}

export const phaseAt = (phases, t) => {
  let k = -1;
  phases.forEach((p, i) => { if (p.start_s != null && p.start_s <= t + 1e-6 && (k < 0 || p.start_s >= phases[k].start_s)) k = i; });
  return k;
};
// Phases keep their order: each starts at least one frame after the one before it.
export const enforceOrder = (phases, fps) => {
  let last = -1;
  for (const p of phases) {
    if (p.start_frame == null) continue;
    if (p.start_frame <= last) { p.start_frame = last + 1; p.start_s = +(p.start_frame / fps).toFixed(4); }
    last = p.start_frame;
  }
  return phases;
};

// How much moved between two grey frames (W×H), allowing the camera to shake by up to 2 pixels either way.
export function motionScore(prev, g, W, H) {
  let best = Infinity; const B = 3;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    let s = 0;
    for (let y = B; y < H - B; y++) { const r = y * W, rp = (y + dy) * W; for (let x = B; x < W - B; x++) { const v = Math.abs(g[r + x] - prev[rp + x + dx]); if (v > 8) s += v; } }
    if (s < best) best = s;
  }
  return best / ((W - 2 * B) * (H - 2 * B));
}
// Frames the reading skipped are filled in a straight line, then a 3-frame average, scaled to 0–1.
export function finishMotion(raw, fps) {
  const n = raw.length, v = Float32Array.from(raw);
  let last = -1;
  for (let i = 0; i < n; i++) if (!Number.isNaN(v[i])) {
    if (last >= 0) for (let k = last + 1; k < i; k++) v[k] = v[last] + (v[i] - v[last]) * (k - last) / (i - last);
    else for (let k = 0; k < i; k++) v[k] = v[i];
    last = i;
  }
  for (let k = last + 1; k < n; k++) v[k] = last >= 0 ? v[last] : 0;
  const sm = Array.from(v, (x, i) => ((v[i - 1] ?? x) + x + (v[i + 1] ?? x)) / 3), mx = Math.max(...sm) || 1;
  return { fps, values: sm.map((x) => +(x / mx).toFixed(4)) };
}

// Phase starts from motion alone: the longest still stretch (0.4 s or more) is the hold, the release ends it, and the
// moving stretches before it are the draw and the raise. Returns { sugg, conf } in frames, or null with no clear hold.
export function suggestPhases(values, f) {
  const n = values.length;
  const v = values.map((_, i) => { const w = values.slice(Math.max(0, i - 2), i + 3).sort((a, b) => a - b); return w[w.length >> 1]; });
  const srt = [...v].sort((a, b) => a - b), lo = srt[Math.floor(n * 0.1)], hi = srt[Math.floor(n * 0.9)], thr = lo + 0.18 * (hi - lo);
  const quiet = (i) => v[i] < thr;
  const runs = []; let s = -1;
  for (let i = 0; i <= n; i++) { if (i < n && quiet(i)) { if (s < 0) s = i; } else if (s >= 0) { runs.push([s, i - 1]); s = -1; } }
  const hold = runs.filter((r) => r[1] - r[0] >= 0.4 * f && r[1] < n - 2).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  if (!hold) return null;
  const rel = Math.min(n - 1, hold[1] + 1), h0 = hold[0], sugg = { release: rel }, conf = { release: 0.8 };
  sugg.follow = Math.min(n - 1, rel + Math.max(2, Math.round(0.08 * f))); conf.follow = 0.55;
  if (h0 <= 2) { sugg.hold = 0; conf.hold = 0.3; return { sugg, conf }; }
  sugg.anchor = h0; conf.anchor = 0.55;
  sugg.hold = Math.min(rel - 1, h0 + Math.max(2, Math.min(Math.round(0.3 * f), Math.round((rel - h0) / 3)))); conf.hold = 0.35;
  let i = h0 - 1; while (i > 0 && !quiet(i)) i--; sugg.draw = i + 1; conf.draw = 0.45;
  let j = i; while (j > 0 && quiet(j)) j--;
  if (j > 0) {
    let k = j; while (k > 0 && !quiet(k)) k--; sugg.raise = k + 1; conf.raise = 0.4;
    if (k > 0) { sugg.stance = 0; conf.stance = 0.5; sugg.hook = Math.max(0, Math.round(k * 0.6)); conf.hook = 0.2; }
  }
  return { sugg, conf };
}

// ---- touch ----
export const HOLD_MS = 320;      // press this long without moving to pick something up
export const SLOP = 10;          // px a finger may wander and still be a press or a tap
// A quick flick downward from the thing pressed: at least 60 px, mostly down, within 700 ms. Nothing else deletes.
export const isSwipeDown = ({ dx, dy, ms }) => dy >= 60 && dy > 2 * Math.abs(dx) && ms <= 700;

// The body point nearest (x, y) on screen within r px. P: { key: [x, y] } in screen px.
export const hitPoint = (P, x, y, r) => {
  let best = null, bd = r;
  for (const k in P) { const d = Math.hypot(P[k][0] - x, P[k][1] - y); if (d <= bd) { bd = d; best = k; } }
  return best;
};
// Distance from (x, y) to the segment a–b.
const toSegment = (x, y, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, u = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
  return Math.hypot(x - (ax + u * dx), y - (ay + u * dy));
};
// The drawing under (x, y), topmost first, within r px. Shapes are in 0–1; w, h turn them into screen px.
export const hitShape = (shapes, x, y, r, w, h) => {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i], P = s.p.map(([px, py]) => [px * w, py * h]);
    if (s.t === "circle" && P[1]) { if (Math.abs(Math.hypot(x - P[0][0], y - P[0][1]) - Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1])) <= r) return i; continue; }
    for (let j = 1; j < P.length; j++) if (toSegment(x, y, P[j - 1], P[j]) <= r) return i;
    if (P.length === 1 && Math.hypot(x - P[0][0], y - P[0][1]) <= r) return i;
  }
  return -1;
};
export const moveShape = (s, dx, dy) => ({ ...s, p: s.p.map(([x, y]) => [+(x + dx).toFixed(4), +(y + dy).toFixed(4)]) });
