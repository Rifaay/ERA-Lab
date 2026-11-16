// What ERA Lab learns from the coach's own saved reviews, on this device: each archer's shot timing (when the anchor,
// hold and follow-through come, measured from the release), and which faults and notes go with which kind of shot.
// No outside AI service: the coach's corrections are the training data, and the model is a handful of medians.

export const PHASE_KEYS = ["stance", "hook", "raise", "draw", "anchor", "hold", "release", "follow"];
// Where a clip can start. A clip filmed from the anchor has no stance, hook, raise or draw to find.
export const STARTS = ["stance", "draw", "anchor", "hold"];

const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const MIN = 3; // reviews needed before a learned value is used

// Seconds from each phase's start to the release, per phase, from reviews that marked the release.
const offsets = (reviews) => {
  const out = {};
  for (const r of reviews) {
    const p = r.phases, rel = p?.release;
    if (rel == null) continue;
    for (const k of PHASE_KEYS) if (k !== "release" && p[k] != null) (out[k] ||= []).push(p[k] - rel);
  }
  return out;
};

// The archer's timing if they have enough reviews, else every archer's, else nothing. `n` is how many reviews it rests on.
export const timing = (reviews, athleteId) => {
  const own = reviews.filter((r) => r.athleteId === athleteId && r.phases?.release != null);
  const pool = own.length >= MIN ? own : reviews.filter((r) => r.phases?.release != null);
  if (pool.length < MIN) return null;
  const o = offsets(pool), at = {};
  for (const k in o) if (o[k].length >= MIN) at[k] = median(o[k]);
  return { at, n: pool.length, own: own.length >= MIN };
};

// Changes the Labeller's motion-based suggestion in place. sugg/conf: frame and confidence per phase; f: frames per
// second; n: frames in the clip; start: the first phase the clip shows; model: timing() or null.
// The release stays as the motion found it (the clearest signal in the clip); the others move toward the coach's
// usual timing as the coach's reviews pile up, and phases before the clip's start are left out.
export const adjust = (sugg, conf, f, n, start = "stance", model = null) => {
  const first = PHASE_KEYS.indexOf(STARTS.includes(start) ? start : "stance");
  for (const k of PHASE_KEYS.slice(0, first)) { delete sugg[k]; delete conf[k]; }
  if (first > 0 && sugg[PHASE_KEYS[first]] == null && first < PHASE_KEYS.indexOf("release")) { sugg[PHASE_KEYS[first]] = 0; conf[PHASE_KEYS[first]] = 0.3; }
  if (!model || sugg.release == null) return sugg;
  const w = Math.min(0.7, model.n / (model.n + 6)); // how far to trust what was learned
  for (const k of PHASE_KEYS.slice(first)) {
    const off = model.at[k];
    if (k === "release" || off == null) continue;
    const learned = Math.round(sugg.release + off * f);
    if (learned < 0 || learned > n - 1) continue;
    if (sugg[k] == null) { sugg[k] = learned; conf[k] = +(0.25 + 0.3 * w).toFixed(2); continue; }
    const agree = Math.abs(sugg[k] - learned) <= 0.15 * f;
    sugg[k] = Math.round(sugg[k] * (1 - w) + learned * w);
    conf[k] = +Math.min(0.9, (conf[k] || 0.3) + (agree ? 0.2 : -0.05) * (w / 0.7)).toFixed(2);
  }
  // keep the order: each phase at or after the one before it
  let last = -1;
  for (const k of PHASE_KEYS) if (sugg[k] != null) { sugg[k] = Math.max(sugg[k], last); last = sugg[k]; }
  return sugg;
};

// The shot's measurable shape: hold and draw length in seconds (null when not marked).
export const shape = (phases) => {
  const p = phases || {}, gap = (a, b) => (a != null && b != null && b > a ? b - a : null); // out-of-order marks: not measured
  return { hold: gap(p.anchor, p.release), draw: gap(p.draw, p.anchor) };
};

// What the coach's past reviews of this archer say about a shot like this one:
// faults the coach tags on shots shaped like it, and notes from the most similar earlier shots.
export const notice = (reviews, athleteId, phases, clipId) => {
  const now = shape(phases);
  const past = reviews.filter((r) => r.athleteId === athleteId && r.id !== clipId && r.phases);
  const feats = ["hold", "draw"].filter((k) => now[k] != null);
  if (!feats.length || past.length < MIN) return { faults: [], similar: [], n: past.length };
  const usual = {}, spread = {};
  for (const k of feats) {
    const xs = past.map((r) => shape(r.phases)[k]).filter((x) => x != null);
    if (xs.length < MIN) continue;
    usual[k] = median(xs);
    // a robust "typical difference", never below 0.2 s: a coach's marks differ by a few frames even on identical shots
    spread[k] = Math.max(0.2, median(xs.map((x) => Math.abs(x - usual[k]))));
  }
  const z = (s) => Object.fromEntries(Object.keys(usual).filter((k) => s[k] != null).map((k) => [k, (s[k] - usual[k]) / spread[k]]));
  const zNow = z(now);
  const dist = (zs) => { const ks = Object.keys(zNow).filter((k) => zs[k] != null); return ks.length ? Math.sqrt(ks.reduce((t, k) => t + (zs[k] - zNow[k]) ** 2, 0) / ks.length) : Infinity; };

  // A fault is hinted when the shots it was tagged on sit nearer this shot than the archer's other shots do.
  const tags = {};
  for (const r of past) for (const f of r.faults || []) (tags[f] ||= []).push(r);
  const faults = [];
  for (const [f, with_] of Object.entries(tags)) {
    if (with_.length < MIN) continue;
    const without = past.filter((r) => !(r.faults || []).includes(f));
    const near = median(with_.map((r) => dist(z(shape(r.phases)))));
    const far = without.length ? median(without.map((r) => dist(z(shape(r.phases))))) : Infinity;
    if (near < 1.2 && near < far) faults.push({ fault: f, times: with_.length, of: past.length });
  }
  faults.sort((a, b) => b.times - a.times);

  const similar = past.filter((r) => r.notes?.trim())
    .map((r) => ({ id: r.id, date: r.date, notes: r.notes.trim(), d: dist(z(shape(r.phases))) }))
    .filter((x) => x.d < 1.5).sort((a, b) => a.d - b.d).slice(0, 2);

  return { faults: faults.slice(0, 3), similar, n: past.length, hold: now.hold, usualHold: usual.hold ?? null };
};

const START_KEY = "racm_clipstart";
export const getStart = (clip) => { try { return JSON.parse(localStorage.getItem(START_KEY))?.[clip] || "stance"; } catch { return "stance"; } };
export const setStart = (clip, k) => {
  try { const all = JSON.parse(localStorage.getItem(START_KEY)) || {}; all[clip] = k; localStorage.setItem(START_KEY, JSON.stringify(all)); } catch { /* storage full */ }
};
