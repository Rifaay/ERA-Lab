// What the archer report shows for one period: the period's statistics compared with the same length of time before,
// progress over time, technique from the rubric, video review, goals. Plain data; screens/ReportDoc.jsx draws it.
import { periodStats, findings, addDays, daysBetween, isoDay } from "./stats.js";
import { scoreValue } from "./range.js";

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const domainOf = (key) => key.split("__")[0];

// Domain averages of one rubric assessment: {technical: 3.4, ...}.
export const rubricDomains = (a) => {
  if (!a) return null;
  const by = {};
  for (const [k, v] of Object.entries(a.scores || {})) if (v) (by[domainOf(k)] ||= []).push(v);
  return Object.fromEntries(Object.entries(by).map(([d, vs]) => [d, mean(vs)]));
};

// Arrow average per week (periods up to about two months) or per month (longer), so a year reads as 12 bars.
export function progress(period, sessions) {
  const days = daysBetween(period.from, period.to) + 1, weekly = days <= 62, out = [];
  let from = period.from;
  if (weekly) { const d = new Date(`${from}T00:00`); from = addDays(from, -((d.getDay() + 6) % 7)); }
  else from = `${from.slice(0, 7)}-01`;
  while (from <= period.to) {
    const d = new Date(`${from}T00:00`);
    const to = weekly ? addDays(from, 6) : isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const ss = sessions.filter((s) => s.date >= from && s.date <= to && s.date >= period.from && s.date <= period.to);
    let total = 0, n = 0;
    for (const s of ss) {
      if (s.score !== "" && s.score != null && +s.arrows > 0) { total += +s.score; n += +s.arrows; continue; }
      for (const e of s.range?.ends || []) for (const a of e.arrows) if (a.score != null) { total += scoreValue(a.score); n++; }
    }
    out.push({ from, to, weekly, sessions: ss.length, arrows: ss.reduce((t, s) => t + (+s.arrows || 0), 0), avg: n ? total / n : null });
    from = addDays(to, 1);
  }
  return out;
}

export function reportData(period, { athlete, sessions, reviews = [], assessments = [], goals = [], logs = [] }) {
  const id = athlete.id, days = daysBetween(period.from, period.to) + 1;
  const before = { kind: "custom", from: addDays(period.from, -days), to: addDays(period.from, -1) };
  const st = periodStats(period, { sessions, reviews, athleteId: id });
  const prev = periodStats(before, { sessions, reviews, athleteId: id });
  const mine = (xs) => xs.filter((x) => x.athleteId === id);
  const inside = (d) => d >= period.from && d <= period.to;

  // Technique: the last assessment up to the end of the period, against the one before it.
  const rubrics = mine(assessments).filter((a) => a.date <= period.to).sort((a, b) => a.date.localeCompare(b.date));
  const latest = rubrics.at(-1) || null, earlier = rubrics.at(-2) || null;

  const tagged = mine(reviews).filter((r) => inside(r.date || "") && (r.verdict || r.faults?.length || r.phasesMarked));
  const faultCount = {};
  for (const r of tagged) for (const f of r.faults || []) faultCount[f] = (faultCount[f] || 0) + 1;

  const goalRows = mine(goals).map((g) => {
    const gl = logs.filter((l) => l.goalId === g.id && l.date <= period.to).sort((a, b) => a.date.localeCompare(b.date));
    const last = gl.at(-1)?.value ?? null, span = +g.target - +g.baseline;
    const pct = last != null && span ? Math.max(0, Math.min(100, Math.round(((last - +g.baseline) / span) * 100))) : null;
    return { ...g, last, pct, logsInPeriod: gl.filter((l) => inside(l.date)).length };
  }).filter((g) => !g.completed || (g.dueDate && inside(g.dueDate)));

  return {
    period, before, st, prev, says: findings(st, prev.count.sessions ? prev : null),
    progress: progress(period, st.sessions),
    rubric: latest && { date: latest.date, now: rubricDomains(latest), before: earlier && { date: earlier.date, domains: rubricDomains(earlier) }, inPeriod: inside(latest.date) },
    video: { clips: tagged.length, good: tagged.filter((r) => r.verdict === "good").length, faults: Object.entries(faultCount).sort((a, b) => b[1] - a[1]), notes: tagged.filter((r) => r.notes).slice(-5) },
    goals: goalRows,
  };
}
