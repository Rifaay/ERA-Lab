// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { periodOf, shiftPeriod, arrowsOf, groupOf, pointsLost, periodStats, findings } from "./stats.js";
import { scoreOf } from "./range.js";

// A plotted session on a 122 cm face (61 cm radius): `spots` are [x, y] in target radii, 6 per end.
let n = 0;
const session = (date, spots, { routine = "Yes", readiness = null, face = "122", distance = 70 } = {}) => {
  const ends = [];
  spots.forEach(([x, y], i) => {
    if (i % 6 === 0) ends.push({ end: ends.length + 1, routine, arrows: [] });
    const e = ends.at(-1);
    e.arrows.push({ arrow: e.arrows.length + 1, x, y, score: x == null ? "M" : scoreOf(face, x, y), feel: null });
  });
  const id = `s${++n}`;
  return { id, athleteId: "a1", date, arrows: String(spots.length), score: "", range: { session_id: `r${id}`, context: { distance_m: distance, face }, mental_pre: { readiness }, ends } };
};
const ring = (k, r, cx = 0, cy = 0) => Array.from({ length: k }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / k), cy + r * Math.sin((2 * Math.PI * i) / k)]);

test("periods: Monday weeks, calendar months, plan blocks, and stepping between them", () => {
  assert.deepEqual(periodOf("week", "2026-10-15"), { kind: "week", from: "2026-10-12", to: "2026-10-18" });
  assert.deepEqual(periodOf("month", "2026-02-10"), { kind: "month", from: "2026-02-01", to: "2026-02-28" });
  const plans = [{ year: 2026, weeks: { 10: "gpp", 11: "gpp", 12: "gpp", 14: "comp" } }];
  const b = periodOf("block", "2026-03-20", { plans }); // plan week 12
  assert.deepEqual([b.phase, b.from, b.to], ["gpp", "2026-03-05", "2026-03-25"]);
  assert.equal(periodOf("block", "2026-07-01", { plans }), null, "no phase planned that week");
  assert.equal(shiftPeriod(b, 1, { plans }).phase, "comp");
  assert.equal(shiftPeriod(periodOf("month", "2026-01-15"), -1).from, "2025-12-01");
  // A summer block starts on its own week even where clocks moved forward in spring (daylight saving).
  const summer = [{ year: 2026, weeks: { 40: "gpp", 41: "spp", 42: "spp" } }];
  assert.equal(periodOf("block", periodOf("block", "2026-10-15", { plans: summer }).from, { plans: summer }).phase, "spp");
});

test("a group: centre, size, and the flier left out of both", () => {
  const s = session("2026-10-01", [...ring(6, 0.1, 0.2, 0), [-0.9, 0]]);
  const g = groupOf(arrowsOf([s]));
  assert.equal(g.fliers.size, 1);
  assert.ok(Math.abs(g.cx - 0.2) < 1e-9 && Math.abs(g.radius - 0.1) < 1e-9);
});

test("where the points went: every lost point has one cause, and the causes add up", () => {
  // A tight group 0.25 radius right of centre, one flier, one miss, one arrow with a fault tagged on its clip.
  const spots = [...ring(10, 0.05, 0.25, 0), [-0.85, 0.1], [null, null], [0.25, 0.06]];
  const s = session("2026-10-02", spots);
  const reviews = [{ athleteId: "a1", faults: ["collapse"], shot: { session_id: s.range.session_id, end: 3, arrow: 1 } }];
  const p = pointsLost(arrowsOf([s]), reviews);
  const sum = p.misses + p.fliers + p.aim + p.fatigue + p.routine + p.spread + Object.values(p.faults).reduce((t, x) => t + x, 0);
  assert.ok(Math.abs(sum - p.lost) < 1e-9, "causes add up to what was lost");
  assert.equal(p.misses, 10);
  assert.equal(p.fliers, 10 - +scoreOf("122", -0.85, 0.1));
  assert.ok(p.faults.collapse > 0);
  assert.ok(p.aim > 5, "re-centring the group would have scored more");
});

test("a month: grouping in cm, fatigue, a personal best and the findings worth saying", () => {
  const tired = [...ring(12, 0.04, 0.1, 0), ...ring(6, 0.25, 0.1, 0)]; // last third falls apart
  const ss = [
    session("2026-09-20", ring(18, 0.3)), // an older, weaker session at the same distance
    session("2026-10-05", tired, { readiness: 8 }),
    session("2026-10-12", tired, { readiness: 6 }),
  ];
  const st = periodStats(periodOf("month", "2026-10-15"), { sessions: ss, athleteId: "a1" });
  const g = st.groups[0];
  assert.equal(st.count.sessions, 2);
  assert.ok(Math.abs(g.offsetXcm - 6.1) < 0.01, "group centre 0.1 radius right = 6.1 cm on a 122 face");
  assert.ok(g.isPb);
  assert.ok(st.byThird[0] - st.byThird[2] >= 0.3);
  const prev = periodStats(periodOf("month", "2026-09-15"), { sessions: ss, athleteId: "a1" });
  const kinds = findings(st, prev).map((f) => f.kind);
  for (const k of ["fatigue", "pb", "trend"]) assert.ok(kinds.includes(k), k);
});
