// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { scoreOf, scoreKeys, newSession, record, undoLast, summary, finish } from "./range.js";

const setup = { type: "Technical", distance: "70", face: "122", perEnd: "3", wind: "Calm", temp: "", sleep: "7.5", goal: "hold expansion" };
const start = 1_800_000_000_000;
const fresh = () => newSession({ athlete: { id: "a1", name: "Test Archer" }, setup, now: start });
// each arrow five seconds after the one before
const shoot = (s, hits) => { let view = s.ends.length - 1, t = start; for (const h of hits) ({ view } = record(s, view, null, h, (t += 5000))); return view; };

test("scores at the ring edges", () => {
  const at = (face, r) => scoreOf(face, r, 0);
  assert.deepEqual([0, 0.04, 0.05, 0.09, 0.1, 0.95, 1, 1.01].map((r) => at("122", r)), ["X", "X", "10", "10", "9", "1", "1", "M"]);
  assert.deepEqual([0.05, 0.1, 0.19, 0.2, 0.85, 1, 1.01].map((r) => at("40s", r)), ["X", "10", "10", "9", "6", "6", "M"]);
  assert.deepEqual(scoreKeys("40s"), ["X", "10", "9", "8", "7", "6", "M"]);
});

test("a new session carries the athlete, the setup and one empty end", () => {
  const s = fresh();
  assert.equal(s.athlete_id, "a1");
  assert.equal(s.session_id.endsWith("_TestArcher"), true);
  assert.deepEqual([s.context.distance_m, s.context.arrows_per_end, s.context.temp_c, s.mental_pre.sleep_h], [70, 3, null, 7.5]);
  assert.deepEqual(s.ends.map((e) => e.arrows.length), [0]);
});

test("the arrow after a full end starts the next end", () => {
  const s = fresh();
  const view = shoot(s, [{ x: 0, y: 0, score: "X" }, { score: "9" }, { score: "M" }, { x: 0.3, y: 0, score: "8" }]);
  assert.equal(view, 1);
  assert.deepEqual(s.ends.map((e) => e.arrows.map((a) => a.score)), [["X", "9", "M"], ["8"]]);
  assert.ok(s.ends[0].arrows.every((a) => a.plot_ms > start));
});

test("a second arrow within 400 ms is refused", () => {
  const s = fresh();
  record(s, 0, null, { score: "9" }, start + 1000);
  assert.deepEqual(record(s, 0, null, { score: "9" }, start + 1100), { view: 0, refused: "double" });
  assert.equal(s.ends[0].arrows.length, 1);
});

test("a picked arrow is changed, not added, and a typed score drops its old position", () => {
  const s = fresh();
  shoot(s, [{ x: 0.2, y: 0.1, score: "8" }]);
  record(s, 0, 0, { score: "M" }, start + 6000);
  assert.deepEqual(s.ends[0].arrows.map((a) => [a.score, a.x]), [["M", null]]);
});

test("a full earlier end refuses new arrows", () => {
  const s = fresh();
  shoot(s, [{ score: "9" }, { score: "9" }, { score: "9" }, { score: "9" }]);
  assert.deepEqual(record(s, 0, null, { score: "9" }, start + 60000), { view: 0, refused: "full" });
});

test("undo removes the last arrow and an end it leaves empty", () => {
  const s = fresh();
  shoot(s, [{ score: "9" }, { score: "9" }, { score: "9" }, { score: "9" }]);
  assert.equal(undoLast(s), 0);
  assert.deepEqual(s.ends.map((e) => e.arrows.length), [3]);
  undoLast(s); undoLast(s); undoLast(s);
  assert.equal(undoLast(s), null);
  assert.equal(s.ends.length, 1);
});

test("finish gives the Sessions screen an entry with the totals and the full session", () => {
  const s = fresh();
  shoot(s, [{ x: 0, y: 0, score: "X" }, { x: 0.2, y: 0, score: "8" }, { score: "M" }, { score: "7" }]);
  s.post.rating = 7; s.coach_notes = "good rhythm";
  assert.deepEqual([summary(s).total, summary(s).tens, summary(s).misses], [25, 1, 1]);
  const entry = finish(s, "id1", start + 30 * 60000);
  assert.deepEqual(
    [entry.athleteId, entry.type, entry.duration, entry.arrows, entry.score, entry.outOf, entry.distance, entry.quality, entry.notes],
    ["a1", "Technical", "30", "4", "25", "40", "70", "4", "good rhythm"]);
  assert.equal(entry.range.ends.length, 2);
  assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
});
