// Range session logic: one plotted arrow per gesture, ends that fill and roll over.
// Pure functions on a plain session object, so the screen stays thin and this file is testable.
// The session uses the same shape as RACM Field's file (racm.session.v1), which the Labeller reads.

export const FACES = ["122", "80", "80r", "40", "40s"]; // 80r: 80 cm reduced, rings 5 to 10. 40s: 40 cm 3-spot, rings 6 to 10
export const rings = (face) => ({ "40s": 5, "80r": 6 })[face] ?? 10;
// A 3-spot has three faces stacked vertically. Arrows keep x, y on their own spot (0 top, 1 middle, 2 bottom), so
// grouping and statistics overlay the three spots, as coaches read them.
export const spotsOf = (face) => (face === "40s" ? 3 : 1);
export const scoreValue = (s) => (s === "X" ? 10 : s === "M" || s == null ? 0 : +s);

// x, y: hit position in target radii, centre 0,0, y up.
// shortcut: scores by the arrow's centre; World Archery gives the higher score when the shaft touches a line.
export const scoreOf = (face, x, y) => {
  const r = Math.hypot(x, y), n = rings(face);
  if (r > 1) return "M";
  if (r < 0.5 / n) return "X";
  return String(Math.max(11 - n, 10 - Math.floor(r * n)));
};

export const scoreKeys = (face) =>
  ["X", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "M"].filter((k) => k === "X" || k === "M" || +k >= 11 - rings(face));

const newEnd = (n) => ({ end: n, focus: null, routine: null, notes: "", arrows: [] });

export const newSession = ({ athlete, setup, now = Date.now() }) => {
  const d = new Date(now), p = (n) => String(n).padStart(2, "0");
  const num = (v) => (v === "" || v == null ? null : +v);
  return {
    schema: "racm.session.v1",
    session_id: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}_${athlete.name.replace(/\s+/g, "")}`,
    athlete: athlete.name, athlete_id: athlete.id, type: setup.type,
    start_ms: now, end_ms: null, tz_offset_min: -d.getTimezoneOffset(),
    context: {
      distance_m: Math.min(150, Math.max(1, Math.round(+setup.distance) || 70)), face: setup.face, arrows_per_end: Math.min(12, Math.max(1, Math.round(+setup.perEnd) || 6)), place: setup.place || "",
      wind: setup.wind || null, wind_from: setup.windFrom || null, temp_c: num(setup.temp), light: setup.light || "",
    },
    equipment: { bow: setup.bow || "", draw_weight_lb: num(setup.drawWeight), arrows: setup.arrows || "", draw_length_in: num(setup.drawLength), notes: setup.eqNotes || "" },
    mental_pre: {
      readiness: setup.readiness ?? null, confidence: setup.confidence ?? null, focus: setup.focus ?? null, energy: setup.energy ?? null,
      sleep_h: num(setup.sleep), goal: setup.goal || "",
    },
    ends: [newEnd(1)], post: {}, coach_notes: "",
  };
};

// Records one arrow, or changes the picked one. Mutates `s`.
// view: index of the end on screen. pick: index of an arrow chosen to move or re-score, else null.
// hit: {x, y, score} from a plot, or {score} from Miss or the score pad.
// Returns {view} on success, or {view, refused: "double" | "full"} with nothing changed.
export const record = (s, view, pick, hit, now = Date.now()) => {
  let e = s.ends[view], a = pick != null ? e.arrows[pick] : null;
  if (!a) {
    const last = Math.max(0, ...s.ends.flatMap((x) => x.arrows.map((b) => b.plot_ms || 0)));
    if (now - last < 400) return { view, refused: "double" }; // two arrows are never recorded within half a second
    if (e.arrows.length >= s.context.arrows_per_end) {
      if (view < s.ends.length - 1) return { view, refused: "full" };
      s.ends.push(newEnd(s.ends.length + 1)); view = s.ends.length - 1; e = s.ends[view];
    }
    a = { arrow: e.arrows.length + 1, plot_ms: now, score: null, x: null, y: null, feel: null, notes: "" };
    e.arrows.push(a);
  }
  if (!("x" in hit)) { a.x = null; a.y = null; delete a.spot; } // a typed score replaces an old plotted position
  Object.assign(a, hit);
  return { view };
};

// Removes the last arrow of the session. Returns the end to show, or null when there was nothing to undo.
export const undoLast = (s) => {
  const last = s.ends[s.ends.length - 1];
  if (!last.arrows.length) return null;
  last.arrows.pop();
  if (!last.arrows.length && s.ends.length > 1) s.ends.pop();
  return s.ends.length - 1;
};

export const summary = (s) => {
  const all = s.ends.flatMap((e) => e.arrows), scored = all.filter((a) => a.score != null);
  const plotted = all.filter((a) => a.x != null), mean = (k) => (plotted.length ? plotted.reduce((t, a) => t + a[k], 0) / plotted.length : null);
  const total = scored.reduce((t, a) => t + scoreValue(a.score), 0);
  return {
    total, arrows: scored.length, outOf: scored.length * 10, avg: scored.length ? total / scored.length : null,
    tens: scored.filter((a) => a.score === "X" || a.score === "10").length, misses: scored.filter((a) => a.score === "M").length,
    cx: mean("x"), cy: mean("y"),
  };
};

export const RING_FILL = ["#f7f3ea", "#f7f3ea", "#1b1b1b", "#1b1b1b", "#2e7fd8", "#2e7fd8", "#e2483d", "#e2483d", "#f2c40c", "#f2c40c"]; // ring 1 to 10
export const faceRadiusCm = (face) => (face === "40s" ? 10 : parseInt(face, 10) / 2); // a 3-spot's single face is 20 cm across

// Everything the printed scorecard shows: per-end and running totals, how often each score came up,
// first half against second half, and the group's centre and size in cm on the real face.
export const scorecard = (s) => {
  const sum = summary(s), R = faceRadiusCm(s.context.face);
  let run = 0;
  const ends = s.ends.filter((e) => e.arrows.length).map((e) => {
    const total = e.arrows.reduce((t, a) => t + scoreValue(a.score), 0);
    return { ...e, sum: total, run: (run += total) };
  });
  const all = ends.flatMap((e) => e.arrows).filter((a) => a.score != null);
  const avg = (xs) => (xs.length ? xs.reduce((t, a) => t + scoreValue(a.score), 0) / xs.length : null);
  const plotted = all.filter((a) => a.x != null), half = Math.ceil(all.length / 2), sums = ends.map((e) => e.sum);
  return {
    ...sum, ends, radiusCm: R,
    dist: scoreKeys(s.context.face).map((k) => [k, all.filter((a) => a.score === k).length]),
    best: sums.length ? Math.max(...sums) : null, worst: sums.length ? Math.min(...sums) : null,
    firstHalf: avg(all.slice(0, half)), secondHalf: all.length > 1 ? avg(all.slice(half)) : null,
    // average distance of each plotted arrow from the group's centre
    spreadCm: plotted.length > 1 ? (plotted.reduce((t, a) => t + Math.hypot(a.x - sum.cx, a.y - sum.cy), 0) / plotted.length) * R : null,
    feel: all.some((a) => a.feel) ? all.reduce((t, a) => t + (a.feel || 0), 0) / all.filter((a) => a.feel).length : null,
  };
};

// Closes the session and returns the entry the Sessions screen, dashboard and report already understand.
// The full session rides along in `range`, so backups, the Labeller file and athlete deletion all cover it.
export const finish = (s, id, now = Date.now()) => {
  s.end_ms ??= now;
  s.ends = s.ends.filter((e) => e.arrows.length);
  const sum = summary(s), d = new Date(s.start_ms), p = (n) => String(n).padStart(2, "0");
  return {
    id, athleteId: s.athlete_id, date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    type: s.type, duration: String(Math.max(1, Math.round((s.end_ms - s.start_ms) / 60000))),
    arrows: String(sum.arrows), distance: String(s.context.distance_m), round: "",
    score: String(sum.total), outOf: String(sum.outOf),
    condition: [s.context.wind, s.context.wind_from].filter(Boolean).join(", "),
    quality: s.post?.rating ? String(Math.ceil(s.post.rating / 2)) : "", // the logger's quality is 1 to 5; the range rating is 1 to 10
    archerReport: s.mental_pre?.goal || "", domains: [], notes: s.coach_notes || "", ramadan: false,
    range: s,
  };
};

// The loupe rides just above the fingertip and follows it, so the finger never reaches it and it never jumps sides.
// Only when there is no room above (finger near the top of the screen) does it sit beside the finger instead.
// fx, fy: finger in px from the target's top-left; w: target width; top: target's distance from the top of the screen.
export const loupeAt = (fx, fy, w, top) => {
  const size = Math.min(w * 0.42, 170), lift = 28, minY = 8 - top;
  const lx = Math.max(0, Math.min(w - size, fx - size / 2)), ly = fy - size - lift;
  if (ly >= minY) return { lx, ly, size };
  return { lx: fx > w / 2 ? Math.max(0, fx - size - lift) : Math.min(w - size, fx + lift), ly: Math.max(minY, fy - size / 2), size };
};
