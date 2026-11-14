// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { forecast, suggestGoals, difficulty, measure, reached } from "./goals.js";
import { addDays } from "./stats.js";
import { scoreOf } from "./range.js";

// A made-up archer: a session every other day for 80 days, group sitting right of centre and tightening over time,
// and dropping off in the last third of each session.
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const today = "2026-11-14";
const sessions = [];
for (let d = 80; d >= 0; d -= 2) {
  const date = addDays(today, -d), spread = 0.2 - (80 - d) * 0.0008, ends = [];
  for (let e = 0; e < 8; e++) {
    const late = e >= 6 ? 1.6 : 1, arrows = [];
    for (let a = 0; a < 6; a++) { const x = 0.15 + gauss() * spread * late, y = gauss() * spread * late; arrows.push({ arrow: a + 1, x, y, score: scoreOf("122", x, y) }); }
    ends.push({ end: e + 1, routine: "Yes", arrows });
  }
  sessions.push({ id: `s${d}`, athleteId: "a1", date, arrows: "48", score: "", range: { session_id: `r${d}`, context: { distance_m: 70, face: "122" }, ends } });
}
const data = { sessions, reviews: [], athleteId: "a1" };

test("forecast: finds a real trend, and trusts a short history less", () => {
  const pts = Array.from({ length: 20 }, (_, i) => ({ date: addDays(today, -i * 3), avg: 8 - i * 0.03 })); // +0.01 per day
  const f = forecast(pts, today, 30);
  assert.ok(f.slope > 0.007 && f.slope < 0.01, `slope ${f.slope}`);
  const few = forecast(pts.slice(0, 3), today, 30);
  assert.ok(few.slope < f.slope / 2, "three sessions: the trend is held near zero");
});

test("suggestions: a performance goal a step above today, and process goals from the biggest leaks", () => {
  const { suggestions, p } = suggestGoals(data, [], today);
  assert.equal(p, 0.65);
  const perf = suggestions.find((s) => s.kind === "avg");
  assert.ok(perf && perf.target > perf.baseline, "a step up");
  assert.ok(perf.chance > 0.5 && perf.chance < 0.8, `chance ${perf.chance}`);
  const kinds = suggestions.filter((s) => s.type === "process").map((s) => s.kind);
  assert.ok(kinds.includes("offset") || kinds.includes("late"), `process goals: ${kinds}`);
  for (const s of suggestions) assert.ok(s.metric.dir === "down" ? s.target < s.baseline : s.target > s.baseline, `${s.kind} moves the right way`);
});

test("an open goal on the same measure is not suggested again", () => {
  const first = suggestGoals(data, [], today).suggestions[0];
  const open = [{ athleteId: "a1", metric: first.metric, target: String(first.target), dueDate: first.due }];
  assert.ok(!suggestGoals(data, open, today).suggestions.some((s) => s.kind === first.kind));
});

test("learning: goals met make the next ones harder, goals missed make them easier", () => {
  const m = { kind: "avg", key: "70|122", dir: "up" }, now = measure(m, data, addDays(today, -20));
  const due = (target) => Array.from({ length: 4 }, (_, i) => ({ athleteId: "a1", metric: m, target: String(target), dueDate: addDays(today, -20 + i) }));
  assert.ok(reached(m, now, now - 1));
  assert.ok(difficulty(due(now - 1), data, today).p < 0.6, "all met: aim higher");
  assert.ok(difficulty(due(10), data, today).p > 0.7, "none met: aim lower");
});
