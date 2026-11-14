// SMART goal suggestions for one archer, learned from their own data on this device (nothing is sent anywhere).
//  1. Measure: every suggested goal carries a metric ERA Lab can measure from sessions and clips (no logging needed).
//  2. Forecast: a recency-weighted trend through the archer's session averages, held near zero until enough sessions
//     support it (shrinkage), gives where they will probably be at the due date and how sure that is.
//  3. Relevant: the biggest point leaks of the last six weeks ("Where the points went") become process goals.
//  4. Learn: suggested goals that reached their due date are checked against their target; the hit rate moves how hard
//     the next targets are, aiming for about two goals in three met.
// Plain functions: the Goals screen words the suggestions in the coach's language and the coach edits before saving.
import { periodStats, addDays, daysBetween } from "./stats.js";

const WINDOW = 28; // a goal's value is measured over the last four weeks of training up to the day
const round = (v, step) => Math.round(v / step) * step;
const phi = (z) => 1 / (1 + Math.exp(-1.702 * z)); // normal distribution, close enough for a chance in percent
const zFor = (p) => Math.log(p / (1 - p)) / 1.702;

// ── 1. Measure ─────────────────────────────────────────────────────────────────────────────
// metric: { kind, key (distance|face), fault, dir: "up" | "down" }. Returns null when there is nothing to measure.
export function measure(metric, data, asOf) {
  const st = periodStats({ kind: "custom", from: addDays(asOf, -(WINDOW - 1)), to: asOf }, data);
  if (!st.count.sessions) return null;
  const g = st.groups.find((x) => x.key === metric.key) || null, per72 = (v) => (st.count.scored ? (v / st.count.scored) * 72 : null);
  switch (metric.kind) {
    case "avg": return g ? g.avg : null;
    case "group": return g?.groupCm ?? null;
    case "offset": return g?.offsetXcm == null ? null : Math.hypot(g.offsetXcm, g.offsetYcm);
    case "late": return st.byThird[0] == null || st.byThird[2] == null ? null : Math.max(0, st.byThird[0] - st.byThird[2]);
    case "routine": { const n = st.routine.yesN + st.routine.notN; return n ? (st.routine.yesN / n) * 100 : null; }
    case "fliers": return per72(st.points.flierCount); // fliers per 72 arrows
    case "misses": return per72(st.misses);
    case "fault": {
      const tagged = data.reviews.filter((r) => r.athleteId === data.athleteId && r.date && r.date <= asOf && r.date > addDays(asOf, -WINDOW) && (r.verdict || r.faults?.length));
      return tagged.length >= 4 ? (tagged.filter((r) => r.faults?.includes(metric.fault)).length / tagged.length) * 100 : null;
    }
    default: return null;
  }
}
export const reached = (metric, value, target) => value != null && (metric.dir === "down" ? value <= target : value >= target);

// ── 4. Learn ───────────────────────────────────────────────────────────────────────────────
// The chance of success to aim for, from how the archer did on suggested goals that are due.
export function difficulty(goals, data, today) {
  const done = goals.filter((g) => g.athleteId === data.athleteId && g.metric && g.dueDate && g.dueDate <= today)
    .map((g) => reached(g.metric, measure(g.metric, data, g.dueDate), +g.target));
  if (done.length < 3) return { p: 0.65, met: done.filter(Boolean).length, due: done.length };
  const rate = done.filter(Boolean).length / done.length;
  return { p: Math.min(0.8, Math.max(0.5, 0.65 + (0.67 - rate) * 0.45)), met: done.filter(Boolean).length, due: done.length, rate };
}

// ── 2. Forecast ────────────────────────────────────────────────────────────────────────────
// Session averages at one distance and face over the last 90 days → trend per day and spread around it.
export function forecast(points, today, horizonDays) {
  const xs = points.map((p) => -daysBetween(p.date, today)), ys = points.map((p) => p.avg), n = xs.length;
  const w = xs.map((x) => Math.exp(x / 45)); // recent sessions count more (a 45-day memory)
  const sw = w.reduce((a, b) => a + b, 0), mx = w.reduce((t, wi, i) => t + wi * xs[i], 0) / sw, my = w.reduce((t, wi, i) => t + wi * ys[i], 0) / sw;
  const sxx = w.reduce((t, wi, i) => t + wi * (xs[i] - mx) ** 2, 0), sxy = w.reduce((t, wi, i) => t + wi * (xs[i] - mx) * (ys[i] - my), 0);
  const raw = sxx ? sxy / sxx : 0, slope = raw * (n / (n + 8)); // few sessions: trust the trend less
  const level = my + slope * (0 - mx);
  const resid = Math.sqrt(w.reduce((t, wi, i) => t + wi * (ys[i] - (level + slope * xs[i])) ** 2, 0) / sw) || 0.3;
  return { level, slope, sd: Math.max(0.08, resid / 2), predicted: level + slope * horizonDays }; // sd of a four-session average
}

// ── 3. Suggest ─────────────────────────────────────────────────────────────────────────────
// Each suggestion: { kind, type, metric, baseline, target, due, chance, why: {cause, points} | null, sessions, coldStart }.
export function suggestGoals(data, goals, today) {
  const { athleteId } = data, out = [];
  const { p } = difficulty(goals, data, today);
  const open = goals.filter((g) => g.athleteId === athleteId && g.metric && (!g.dueDate || g.dueDate > today));
  const taken = (m) => open.some((g) => g.metric.kind === m.kind && (g.metric.key || g.metric.fault) === (m.key || m.fault));
  const recent = periodStats({ kind: "custom", from: addDays(today, -41), to: today }, data);
  const main = recent.groups[0];
  if (!main) return { suggestions: [], p };
  const key = main.key;

  // Performance: average per arrow at the main distance.
  const history = periodStats({ kind: "custom", from: addDays(today, -89), to: today }, data);
  const pts = [...new Set(history.arrows.filter((a) => `${a.distance}|${a.face}` === key).map((a) => a.sid))].map((sid) => {
    const as = history.arrows.filter((a) => a.sid === sid);
    return { date: as[0].date, avg: as.reduce((t, a) => t + a.value, 0) / as.length, n: as.length };
  }).filter((x) => x.n >= 12);
  const avgMetric = { kind: "avg", key, dir: "up" };
  const baseline = measure(avgMetric, data, today);
  if (baseline != null && !taken(avgMetric)) {
    const H = 42, due = addDays(today, H);
    if (pts.length >= 5) {
      const f = forecast(pts, today, H);
      let target = round(f.predicted - zFor(p) * f.sd, 0.05);
      target = Math.min(10, Math.max(target, round(baseline + 0.05, 0.05))); // a goal is always a step up
      out.push({ kind: "avg", type: "performance", metric: avgMetric, distance: main.distance, face: main.face, baseline, target, due, sessions: pts.length,
        chance: phi((f.predicted - target) / f.sd), trend: f.slope * 7 });
    } else {
      out.push({ kind: "avg", type: "performance", metric: avgMetric, distance: main.distance, face: main.face, baseline, target: Math.min(10, round(baseline + 0.2, 0.05)), due,
        sessions: pts.length, chance: null, coldStart: true });
    }
  }

  // Process: the biggest leaks of the last six weeks, each as a goal ERA Lab can measure.
  const pl = recent.points, leaks = [["aim", pl.aim], ["fatigue", pl.fatigue], ["routine", pl.routine], ["fliers", pl.fliers], ["misses", pl.misses],
    ...Object.entries(pl.faults).map(([f, v]) => ["fault", v, f])].filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
  const perArrow72 = (v) => (recent.count.scored ? (v / recent.count.scored) * 72 : 0);
  const PROCESS = {
    aim: { metric: { kind: "offset", key, dir: "down" }, days: 21, to: (b) => Math.max(1.5, b * 0.5), step: 0.5 },
    fatigue: { metric: { kind: "late", dir: "down" }, days: 28, to: (b) => b * 0.5, step: 0.05 },
    routine: { metric: { kind: "routine", dir: "up" }, days: 28, to: (b) => Math.min(95, b + (100 - b) * 0.6), step: 5 },
    fliers: { metric: { kind: "fliers", dir: "down" }, days: 28, to: (b) => b * 0.5, step: 0.5 },
    misses: { metric: { kind: "misses", dir: "down" }, days: 28, to: (b) => b * 0.4, step: 0.5 },
    fault: { metric: { kind: "fault", dir: "down" }, days: 28, to: (b) => b * 0.5, step: 5 },
  };
  for (const [cause, points, fault] of leaks) {
    const spec = PROCESS[cause], metric = { ...spec.metric, ...(fault && { fault }) };
    if (taken(metric)) continue;
    const b = measure(metric, data, today);
    if (b == null || b <= 0) continue;
    const easier = (p - 0.65) * 0.6; // learning: a lower hit rate asks for a smaller step
    const target = round(metric.dir === "down" ? Math.max(0, spec.to(b) + (b - spec.to(b)) * easier) : spec.to(b) - (spec.to(b) - b) * easier, spec.step);
    if (metric.dir === "down" ? target >= b : target <= b) continue;
    out.push({ kind: metric.kind, type: "process", metric, distance: main.distance, fault, baseline: b, target, due: addDays(today, spec.days),
      why: { cause, points: perArrow72(points) }, chance: null });
    if (out.filter((x) => x.type === "process").length >= 2) break;
  }

  // Group size, when nothing bigger stands out.
  const groupMetric = { kind: "group", key, dir: "down" }, gb = measure(groupMetric, data, today);
  if (out.length < 3 && gb != null && !taken(groupMetric)) {
    out.push({ kind: "group", type: "performance", metric: groupMetric, distance: main.distance, baseline: gb, target: round(gb * (0.95 - (0.65 - p) * 0.1), 0.5), due: addDays(today, 42),
      why: { cause: "spread", points: perArrow72(pl.spread) }, chance: null });
  }
  return { suggestions: out, p };
}
