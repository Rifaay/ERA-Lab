// ERA Lab statistics for one archer over one period (a week, a month, a training block from the plan, or everything).
// Every figure compares the archer with their own arrows, at their own distances and faces; nothing here ranks them
// against other people. Pure functions over the stored records, so the screen stays thin and the rules are testable.
import { scoreValue, scoreOf, faceRadiusCm } from "./range.js";

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const utc = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
export const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return isoDay(d); };
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = (xs) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) : null; };
const corr = (xs, ys) => {
  const mx = mean(xs), my = mean(ys);
  let a = 0, b = 0, c = 0;
  xs.forEach((x, i) => { a += (x - mx) * (ys[i] - my); b += (x - mx) ** 2; c += (ys[i] - my) ** 2; });
  return b && c ? a / Math.sqrt(b * c) : null;
};

// ── Periods ───────────────────────────────────────────────────────────────────────────────
// The planner numbers its weeks 1 to 52 from 1 January (as the archer screen does); blocks follow those weeks.
// Counted in UTC: in local time a summer date is an hour short of whole days (daylight saving), which lands on the week before.
export const planWeek = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Math.min(52, Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / (7 * DAY)) + 1); };
const planWeekStart = (year, w) => isoDay(new Date(year, 0, 1 + (w - 1) * 7));

// kind: "week" (Monday to Sunday), "month", "block" (a run of weeks with one phase in the archer's plan), "all".
// plans: the archer's plans ({year, weeks: {n: phase}}). Returns null when the anchor falls outside any block.
export function periodOf(kind, anchor, { plans = [], first } = {}) {
  const d = parse(anchor);
  if (kind === "week") { const from = addDays(anchor, -((d.getDay() + 6) % 7)); return { kind, from, to: addDays(from, 6) }; }
  if (kind === "month") return { kind, from: isoDay(new Date(d.getFullYear(), d.getMonth(), 1)), to: isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  if (kind === "year") return { kind, from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
  if (kind === "all") return { kind, from: first || anchor, to: anchor };
  const year = d.getFullYear(), weeks = plans.find((p) => p.year === year)?.weeks || {}, w = planWeek(anchor), phase = weeks[w];
  if (!phase) return null;
  let a = w, b = w;
  while (a > 1 && weeks[a - 1] === phase) a--;
  while (b < 52 && weeks[b + 1] === phase) b++;
  return { kind, phase, from: planWeekStart(year, a), to: b === 52 ? `${year}-12-31` : addDays(planWeekStart(year, b + 1), -1) };
}

// The period before (dir -1) or after (dir 1). A block steps to the nearest other block within a year.
// A custom range (any two dates the coach picks) steps by its own length.
export function shiftPeriod(p, dir, ctx) {
  if (p.kind === "all") return null;
  if (p.kind === "custom") {
    const days = daysBetween(p.from, p.to) + 1;
    return dir < 0 ? { kind: "custom", from: addDays(p.from, -days), to: addDays(p.from, -1) } : { kind: "custom", from: addDays(p.to, 1), to: addDays(p.to, days) };
  }
  if (p.kind !== "block") return periodOf(p.kind, dir < 0 ? addDays(p.from, -1) : addDays(p.to, 1), ctx);
  for (let day = dir < 0 ? addDays(p.from, -1) : addDays(p.to, 1), i = 0; i < 53; i++, day = addDays(day, 7 * dir)) {
    const q = periodOf("block", day, ctx);
    if (q) return q;
  }
  return null;
}

// ── Arrows ────────────────────────────────────────────────────────────────────────────────
// Every scored arrow of plotted (Range) sessions, with what the coach recorded around it.
export function arrowsOf(sessions) {
  const out = [];
  for (const s of sessions) {
    const r = s.range;
    if (!r?.ends) continue;
    const c = r.context || {}, R = faceRadiusCm(c.face), mine = [];
    for (const e of r.ends) for (const a of e.arrows) {
      if (a.score == null) continue;
      mine.push({
        sid: s.id, rsid: r.session_id, date: s.date, end: e.end, n: a.arrow, score: a.score, value: scoreValue(a.score),
        x: a.x ?? null, y: a.y ?? null, feel: a.feel ?? null, routine: e.routine ?? null,
        distance: c.distance_m, face: c.face, R, wind: c.wind || null, light: c.light || null, readiness: r.mental_pre?.readiness ?? null, sleep: r.mental_pre?.sleep_h ?? null,
      });
    }
    mine.forEach((a, i) => { a.idx = i; a.third = mine.length < 6 ? null : Math.min(2, Math.floor((3 * i) / mine.length)); });
    out.push(...mine);
  }
  return out;
}

// One session's group: centre, size (mean distance from the centre) and which arrows are fliers.
// A flier sits more than 2.5 times the median distance from the centre; it needs 6 plotted arrows to judge.
export function groupOf(arrows) {
  const p = arrows.filter((a) => a.x != null && a.score !== "M");
  if (!p.length) return null;
  let cx = mean(p.map((a) => a.x)), cy = mean(p.map((a) => a.y));
  const fliers = new Set();
  if (p.length >= 6) {
    const lim = 2.5 * Math.max(median(p.map((a) => Math.hypot(a.x - cx, a.y - cy))), 0.02);
    for (const a of p) if (Math.hypot(a.x - cx, a.y - cy) > lim) fliers.add(a);
    const core = p.filter((a) => !fliers.has(a));
    cx = mean(core.map((a) => a.x)); cy = mean(core.map((a) => a.y));
  }
  const core = p.filter((a) => !fliers.has(a));
  return {
    cx, cy, n: p.length, fliers,
    radius: mean(core.map((a) => Math.hypot(a.x - cx, a.y - cy))),
    sdX: sd(core.map((a) => a.x)), sdY: sd(core.map((a) => a.y)),
  };
}

// ── Where the points went ──────────────────────────────────────────────────────────────────
// Splits the points lost (10 per arrow minus the score) into causes the coach can act on. Each lost point goes to one
// cause, checked in this order: a miss, a flier, a fault the coach tagged on that arrow's clip, the group sitting off the
// centre (what re-centring each session's group would have gained), fatigue (extra loss in the last third of a session),
// skipped routine (extra loss on ends where the routine was not followed), and what is left: the size of the group.
// shortcut: an estimate from the recorded arrows, not a measurement of cause; it reads well from about 30 plotted arrows.
export function pointsLost(arrows, reviews = []) {
  const byShot = new Map(reviews.filter((r) => r.shot && r.faults?.length).map((r) => [`${r.shot.session_id}/${r.shot.end}/${r.shot.arrow}`, r]));
  const out = { max: arrows.length * 10, scored: 0, lost: 0, misses: 0, fliers: 0, flierCount: 0, faults: {}, aim: 0, fatigue: 0, routine: 0, spread: 0 };
  const rest = new Set();
  const sessions = new Map();
  for (const a of arrows) { if (!sessions.has(a.sid)) sessions.set(a.sid, []); sessions.get(a.sid).push(a); }
  for (const list of sessions.values()) {
    const g = groupOf(list);
    let gain = 0;
    for (const a of list) {
      const loss = 10 - a.value;
      out.scored += a.value; out.lost += loss;
      const review = byShot.get(`${a.rsid}/${a.end}/${a.n}`);
      if (a.score === "M") out.misses += loss;
      else if (g?.fliers.has(a)) { out.fliers += loss; out.flierCount++; }
      else if (review) { const share = loss / review.faults.length; for (const f of review.faults) out.faults[f] = (out.faults[f] || 0) + share; }
      else {
        rest.add(a);
        if (g && a.x != null) gain += scoreValue(scoreOf(a.face, a.x - g.cx, a.y - g.cy)) - a.value;
      }
    }
    out.aim += Math.max(0, gain);
    const early = list.filter((a) => rest.has(a) && a.third != null && a.third < 2), late = list.filter((a) => rest.has(a) && a.third === 2);
    if (early.length >= 4 && late.length >= 2) out.fatigue += Math.max(0, late.length * (mean(late.map((a) => 10 - a.value)) - mean(early.map((a) => 10 - a.value))));
  }
  const yes = [...rest].filter((a) => a.routine === "Yes"), not = [...rest].filter((a) => a.routine === "Partly" || a.routine === "No");
  if (yes.length >= 6 && not.length >= 6) out.routine = Math.max(0, not.length * (mean(not.map((a) => 10 - a.value)) - mean(yes.map((a) => 10 - a.value))));
  const named = out.misses + out.fliers + Object.values(out.faults).reduce((s, x) => s + x, 0);
  const room = Math.max(0, out.lost - named), soft = out.aim + out.fatigue + out.routine;
  if (soft > room) { const k = room / soft; out.aim *= k; out.fatigue *= k; out.routine *= k; } // causes overlap: never explain more than was lost
  out.spread = Math.max(0, out.lost - named - out.aim - out.fatigue - out.routine);
  return out;
}

// ── The period's statistics ────────────────────────────────────────────────────────────────
const keyOf = (a) => `${a.distance}|${a.face}`;
const avgOf = (as) => mean(as.map((a) => a.value));
const inPeriod = (p) => (s) => s.date >= p.from && s.date <= p.to;
// Average per arrow over every session: the logged score and arrow count, or the plotted arrows when no score was typed.
const loggedAvg = (ss) => {
  let total = 0, n = 0;
  for (const s of ss) {
    if (s.score !== "" && s.score != null && +s.arrows > 0) { total += +s.score; n += +s.arrows; continue; }
    const as = arrowsOf([s]);
    total += as.reduce((t, a) => t + a.value, 0); n += as.length;
  }
  return n ? total / n : null;
};

export function periodStats(period, { sessions, reviews = [], athleteId }) {
  const all = sessions.filter((s) => s.athleteId === athleteId);
  const ss = all.filter(inPeriod(period)).sort((a, b) => a.date.localeCompare(b.date));
  const arrows = arrowsOf(ss);
  const myReviews = reviews.filter((r) => r.athleteId === athleteId);
  const periodReviews = myReviews.filter((r) => r.shot && ss.some((s) => s.range?.session_id === r.shot.session_id));

  // Distances and faces shot, the most arrows first; grouping only makes sense within one of them.
  const groups = [...new Set(arrows.map(keyOf))].map((k) => {
    const as = arrows.filter((a) => keyOf(a) === k), R = as[0].R;
    const perSession = [...new Set(as.map((a) => a.sid))].map((sid) => groupOf(as.filter((a) => a.sid === sid))).filter((g) => g && g.n >= 3);
    const allTime = arrowsOf(all).filter((a) => keyOf(a) === k);
    const bestSessions = [...new Set(allTime.map((a) => a.sid))].map((sid) => { const x = allTime.filter((a) => a.sid === sid); return { sid, avg: avgOf(x), n: x.length }; }).filter((x) => x.n >= 12);
    const pb = bestSessions.sort((a, b) => b.avg - a.avg)[0] || null;
    const here = bestSessions.filter((x) => ss.some((s) => s.id === x.sid)).sort((a, b) => b.avg - a.avg)[0] || null;
    return {
      key: k, distance: as[0].distance, face: as[0].face, arrows: as.length, avg: avgOf(as),
      groupCm: perSession.length ? mean(perSession.map((g) => g.radius)) * R : null,
      offsetXcm: perSession.length ? mean(perSession.map((g) => g.cx)) * R : null,
      offsetYcm: perSession.length ? mean(perSession.map((g) => g.cy)) * R : null,
      shape: perSession.length ? mean(perSession.map((g) => (g.sdX || 0) / Math.max(g.sdY || 0, 1e-6))) : null, // >1: wider than tall
      best: here, pb, isPb: !!(here && pb && here.sid === pb.sid),
    };
  }).sort((a, b) => b.arrows - a.arrows);

  const ends = [];
  for (const s of ss) for (const e of s.range?.ends || []) { const v = e.arrows.filter((a) => a.score != null).map((a) => scoreValue(a.score)); if (v.length) ends.push(mean(v)); }
  const byThird = [0, 1, 2].map((t) => avgOf(arrows.filter((a) => a.third === t)));
  const positions = [...new Set(arrows.map((a) => a.n))].sort((a, b) => a - b).map((n) => ({ n, avg: avgOf(arrows.filter((a) => a.n === n)), count: arrows.filter((a) => a.n === n).length }));
  const by = (field) => [...new Set(arrows.map((a) => a[field]).filter(Boolean))].map((v) => ({ value: v, avg: avgOf(arrows.filter((a) => a[field] === v)), count: arrows.filter((a) => a[field] === v).length })).sort((a, b) => b.count - a.count);
  const sessionAvgs = ss.filter((s) => s.range).map((s) => ({ s, avg: avgOf(arrows.filter((a) => a.sid === s.id)) })).filter((x) => x.avg != null);
  const linkOf = (field) => { const xs = sessionAvgs.filter((x) => x.s.range.mental_pre?.[field] != null); return xs.length >= 5 ? corr(xs.map((x) => +x.s.range.mental_pre[field]), xs.map((x) => x.avg)) : null; };
  const good = arrows.filter((a) => a.feel >= 4), bad = arrows.filter((a) => a.feel != null && a.feel <= 2);
  const routineYes = arrows.filter((a) => a.routine === "Yes"), routineNot = arrows.filter((a) => a.routine === "Partly" || a.routine === "No");

  // Faults tagged on clips linked to this period's arrows, and what an arrow with each fault scored against the rest.
  const shotValue = new Map(arrows.map((a) => [`${a.rsid}/${a.end}/${a.n}`, a.value]));
  const faultList = {};
  for (const r of periodReviews) for (const f of r.faults || []) (faultList[f] ||= []).push(shotValue.get(`${r.shot.session_id}/${r.shot.end}/${r.shot.arrow}`));
  const overall = avgOf(arrows);
  const faults = Object.entries(faultList).map(([name, vs]) => { const v = vs.filter((x) => x != null); return { name, count: vs.length, avg: mean(v), cost: v.length && overall != null ? overall - mean(v) : null }; }).sort((a, b) => b.count - a.count);

  // Monday-to-Sunday weeks inside the period (a week view is one week).
  const weeks = [];
  if (period.kind !== "week") for (let from = addDays(period.from, -((parse(period.from).getDay() + 6) % 7)); from <= period.to; from = addDays(from, 7)) {
    const to = addDays(from, 6), wk = ss.filter((s) => s.date >= from && s.date <= to);
    weeks.push({ from: from < period.from ? period.from : from, to: to > period.to ? period.to : to, sessions: wk.length, arrows: wk.reduce((t, s) => t + (+s.arrows || 0), 0), avg: loggedAvg(wk) });
  }

  return {
    period, sessions: ss, arrows,
    count: { sessions: ss.length, arrows: ss.reduce((t, s) => t + (+s.arrows || 0), 0), plotted: arrows.filter((a) => a.x != null).length, scored: arrows.length },
    avg: loggedAvg(ss), arrowAvg: overall,
    tens: arrows.filter((a) => a.score === "X" || a.score === "10").length, xs: arrows.filter((a) => a.score === "X").length, misses: arrows.filter((a) => a.score === "M").length,
    groups, endSd: ends.length >= 3 ? sd(ends) : null, byThird, positions,
    wind: by("wind"), light: by("light"),
    readinessLink: linkOf("readiness"), sleepLink: linkOf("sleep_h"),
    routine: { yes: avgOf(routineYes), not: avgOf(routineNot), yesN: routineYes.length, notN: routineNot.length },
    feel: { good: avgOf(good), bad: avgOf(bad), goodN: good.length, badN: bad.length },
    faults, reviews: periodReviews, points: pointsLost(arrows, periodReviews), weeks,
  };
}

// ── What to say ────────────────────────────────────────────────────────────────────────────
// The few findings worth the coach's attention, most useful first. Data only; the screen words them in either language.
export function findings(st, prev) {
  const out = [], p = st.points, main = st.groups[0];
  if (st.count.scored >= 18) {
    const causes = [["misses", p.misses], ["fliers", p.fliers], ["aim", p.aim], ["fatigue", p.fatigue], ["routine", p.routine],
      ...Object.entries(p.faults).map(([name, v]) => ["fault", v, name])].filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
    if (causes[0]) out.push({ kind: "leak", cause: causes[0][0], name: causes[0][2], points: causes[0][1], perArrow: causes[0][1] / st.count.scored });
  }
  if (main?.groupCm != null && main.offsetXcm != null) {
    const off = Math.hypot(main.offsetXcm, main.offsetYcm);
    if (off >= 2 && off >= main.groupCm * 0.4) out.push({ kind: "aim", distance: main.distance, x: main.offsetXcm, y: main.offsetYcm });
    if (main.shape != null && main.shape >= 1.4) out.push({ kind: "shape", distance: main.distance, wide: true });
    else if (main.shape != null && main.shape <= 0.7) out.push({ kind: "shape", distance: main.distance, wide: false });
  }
  const [e, , l] = st.byThird;
  if (e != null && l != null && e - l >= 0.3) out.push({ kind: "fatigue", early: e, late: l });
  const posAvg = mean(st.positions.filter((x) => x.count >= 6).map((x) => x.avg));
  const weak = st.positions.filter((x) => x.count >= 6).sort((a, b) => a.avg - b.avg)[0];
  if (weak && posAvg != null && posAvg - weak.avg >= 0.3) out.push({ kind: "position", n: weak.n, avg: weak.avg, others: posAvg });
  if (st.routine.yesN >= 6 && st.routine.notN >= 6 && st.routine.yes - st.routine.not >= 0.3) out.push({ kind: "routine", yes: st.routine.yes, not: st.routine.not });
  if (st.feel.goodN >= 6 && st.feel.badN >= 6) out.push({ kind: "feel", matches: st.feel.good - st.feel.bad >= 0.5, good: st.feel.good, bad: st.feel.bad });
  if (st.readinessLink != null && Math.abs(st.readinessLink) >= 0.4) out.push({ kind: "readiness", up: st.readinessLink > 0 });
  if (st.groups.some((g) => g.isPb)) { const g = st.groups.find((x) => x.isPb); out.push({ kind: "pb", distance: g.distance, avg: g.best.avg }); }
  if (prev && st.avg != null && prev.avg != null && Math.abs(st.avg - prev.avg) >= 0.1) out.push({ kind: "trend", from: prev.avg, to: st.avg });
  if (prev && prev.count.arrows && st.count.arrows) { const ch = st.count.arrows / prev.count.arrows - 1; if (Math.abs(ch) >= 0.2) out.push({ kind: "volume", change: ch }); }
  const busiest = [...st.weeks].sort((a, b) => b.arrows - a.arrows)[0];
  if (busiest?.arrows && st.weeks.length > 1) out.push({ kind: "busiest", from: busiest.from, arrows: busiest.arrows });
  return out;
}
