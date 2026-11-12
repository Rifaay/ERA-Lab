// What the home screen says about each archer: the latest facts, and whether the coach should look at them.
// Pure functions over the stored records, so the rules are testable and the screens stay thin.

export const IDLE_DAYS = 14; // no session for this long means the archer needs a plan

export const daysSince = (dateStr, now = new Date()) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor((now - new Date(y, m - 1, d)) / 86400000);
};

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const rubricAvg = (a) => (a ? mean(Object.values(a.scores || {}).filter(Boolean)) : null);
// Average per arrow needs both a score and an arrow count; sessions logged without either are skipped.
export const arrowAvg = (s) => (s.score !== "" && s.score != null && +s.arrows > 0 ? +s.score / +s.arrows : null);
const trendOf = (now, before, step) => (now == null || before == null ? null : now > before + step ? "up" : now < before - step ? "down" : "flat");

export function athleteFacts(athlete, { sessions, assessments, goals }, now = new Date()) {
  const mine = sessions.filter((s) => s.athleteId === athlete.id).sort((a, b) => b.date.localeCompare(a.date));
  const last = mine[0] || null;
  const lastDays = last ? daysSince(last.date, now) : null;
  const month = mine.filter((s) => daysSince(s.date, now) <= 30);
  const scored = mine.filter((s) => arrowAvg(s) != null);
  const avg = scored[0] ? arrowAvg(scored[0]) : null, prevAvg = scored[1] ? arrowAvg(scored[1]) : null;
  const rubrics = assessments.filter((a) => a.athleteId === athlete.id).sort((a, b) => b.date.localeCompare(a.date));
  const rubric = rubricAvg(rubrics[0]), prevRubric = rubricAvg(rubrics[1]);
  const open = goals.filter((g) => g.athleteId === athlete.id && !g.completed);
  const overdue = open.filter((g) => g.dueDate && daysSince(g.dueDate, now) > 0);
  const plotted = mine.find((s) => s.range?.ends?.some((e) => e.arrows.length));
  const lastEnd = plotted ? plotted.range.ends.filter((e) => e.arrows.length).at(-1).arrows.map((a) => a.score) : null;

  // Most serious first. Each reason is data; the screen turns it into words in the coach's language.
  const reasons = [];
  if (!last) reasons.push({ kind: "none" });
  else if (lastDays >= IDLE_DAYS) reasons.push({ kind: "idle", days: lastDays });
  if (rubric != null && prevRubric != null && rubric < prevRubric - 0.1) reasons.push({ kind: "rubric", from: prevRubric, to: rubric });
  if (overdue.length) reasons.push({ kind: "goal", count: overdue.length, name: overdue[0].name });
  if (avg != null && prevAvg != null && avg < prevAvg - 0.5) reasons.push({ kind: "score", from: prevAvg, to: avg });

  return {
    athlete, last, lastDays, lastEnd, lastEndDate: plotted?.date || null,
    sessions30: month.length, arrows30: month.reduce((t, s) => t + (+s.arrows || 0), 0),
    avg, trend: trendOf(avg, prevAvg, 0.1),
    rubric, prevRubric, rubricTrend: trendOf(rubric, prevRubric, 0.1), rubricDate: rubrics[0]?.date || null,
    openGoals: open, overdue, reasons,
  };
}

// The roster split the home screen shows: who needs the coach (longest wait first), then everyone on track (most recent first).
export function roster(athletes, data, now = new Date()) {
  const facts = athletes.map((a) => athleteFacts(a, data, now));
  const idle = (f) => (f.lastDays == null ? Infinity : f.lastDays);
  return {
    need: facts.filter((f) => f.reasons.length).sort((a, b) => idle(b) - idle(a)),
    onTrack: facts.filter((f) => !f.reasons.length).sort((a, b) => idle(a) - idle(b)),
  };
}

// Which colour an arrow value takes on a target face: gold, red, blue, black, white.
export const ringOf = (score) =>
  score === "X" || score === "10" || score === "9" ? "gold" : score === "8" || score === "7" ? "red" : score === "6" || score === "5" ? "blue" : score === "4" || score === "3" ? "black" : "white";
