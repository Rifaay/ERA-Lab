// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { reportData, progress, rubricDomains } from "./report.js";
import { periodOf, shiftPeriod } from "./stats.js";

const athlete = { id: "a1", name: "Test Archer" };
const logged = (date, score, arrows = 60) => ({ id: date, athleteId: "a1", date, type: "Technical", arrows: String(arrows), score: String(score), outOf: String(arrows * 10), distance: "70" });

test("periods for the report: a year, and a custom range that steps by its own length", () => {
  assert.deepEqual(periodOf("year", "2026-06-10"), { kind: "year", from: "2026-01-01", to: "2026-12-31" });
  const c = { kind: "custom", from: "2026-03-01", to: "2026-03-10" };
  assert.deepEqual(shiftPeriod(c, -1), { kind: "custom", from: "2026-02-19", to: "2026-02-28" });
});

test("progress is weekly for short periods and monthly for long ones", () => {
  const ss = [logged("2026-10-05", 480), logged("2026-10-20", 510)];
  const month = progress({ from: "2026-10-01", to: "2026-10-31" }, ss);
  assert.ok(month.every((r) => r.weekly));
  assert.equal(month.find((r) => r.sessions).avg, 8);
  const year = progress({ from: "2026-01-01", to: "2026-12-31" }, ss);
  assert.equal(year.length, 12);
  assert.equal(year[9].avg, (480 + 510) / 120);
});

test("the report compares the period with the same length before, and picks the right rubric and goals", () => {
  const sessions = [logged("2026-09-10", 450), logged("2026-10-10", 510)];
  const assessments = [
    { id: "r1", athleteId: "a1", date: "2026-08-01", scores: { technical__Draw: 2, technical__Anchor: 4, mental__Focus: 3 } },
    { id: "r2", athleteId: "a1", date: "2026-10-15", scores: { technical__Draw: 4, technical__Anchor: 4, mental__Focus: 5 } },
    { id: "r3", athleteId: "a1", date: "2026-12-01", scores: { technical__Draw: 5 } }, // after the period: not used
  ];
  const goals = [{ id: "g1", athleteId: "a1", name: "70 m average", baseline: "7", target: "9", dueDate: "2026-12-31" }];
  const logs = [{ goalId: "g1", date: "2026-10-20", value: 8 }];
  const d = reportData({ kind: "month", from: "2026-10-01", to: "2026-10-31", label: "October" }, { athlete, sessions, assessments, goals, logs });
  assert.deepEqual([d.before.from, d.before.to], ["2026-08-31", "2026-09-30"]);
  assert.deepEqual([d.st.avg, d.prev.avg], [8.5, 7.5]);
  assert.equal(d.rubric.date, "2026-10-15");
  assert.deepEqual(d.rubric.now, { technical: 4, mental: 5 });
  assert.deepEqual(d.rubric.before.domains, rubricDomains(assessments[0]));
  assert.equal(d.goals[0].pct, 50);
});
