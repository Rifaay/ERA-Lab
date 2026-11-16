import test from "node:test";
import assert from "node:assert/strict";
import { timing, adjust, notice } from "./learn.js";

// A shot whose release is at `rel` s: draw 1.4 s before, anchor `hold` s before, follow 0.3 s after.
const rv = (id, hold, extra = {}) => {
  const rel = 3;
  return { id, athleteId: "a1", date: "2026-11-1" + id, faults: [], notes: "", phases: { draw: rel - hold - 1.4, anchor: rel - hold, hold: rel - hold + 0.3, release: rel, follow: rel + 0.3 }, ...extra };
};

test("a clip filmed from the anchor gets no stance, hook, raise or draw", () => {
  const sugg = { stance: 0, hook: 5, raise: 20, draw: 40, anchor: 70, hold: 80, release: 120, follow: 125 }, conf = {};
  adjust(sugg, conf, 30, 150, "anchor");
  assert.deepEqual(Object.keys(sugg).sort(), ["anchor", "follow", "hold", "release"]);
});

test("a clip that starts in the hold, where the motion found no anchor, starts its first phase at frame 0", () => {
  const sugg = { release: 40, follow: 44 }, conf = {};
  adjust(sugg, conf, 30, 60, "hold");
  assert.equal(sugg.hold, 0);
});

test("nothing is learned from fewer than 3 reviews; after that, the archer's own timing", () => {
  assert.equal(timing([rv(1, 2), rv(2, 2)], "a1"), null);
  const m = timing([rv(1, 2), rv(2, 2.2), rv(3, 2.4)], "a1");
  assert.equal(m.own, true);
  assert.equal(+m.at.anchor.toFixed(2), -2.2);
  assert.equal(+m.at.follow.toFixed(2), 0.3);
});

test("learned timing fills what the motion missed and pulls the rest toward the coach's usual marks", () => {
  const model = timing([rv(1, 2), rv(2, 2), rv(3, 2), rv(4, 2), rv(5, 2), rv(6, 2)], "a1"), f = 30;
  const sugg = { release: 120, follow: 140, anchor: 100 }, conf = { release: 0.8, follow: 0.55, anchor: 0.55 };
  adjust(sugg, conf, f, 200, "stance", model);
  assert.equal(sugg.release, 120, "the release is the motion's");
  assert.ok(sugg.anchor < 100 && sugg.anchor >= 60, "anchor moved toward 2 s before release (frame 60)");
  assert.ok(sugg.follow < 140, "follow moved toward 0.3 s after release (frame 129)");
  assert.equal(sugg.draw, 18, "draw, missed by the motion, comes from what was learned");
  const order = ["draw", "anchor", "hold", "release", "follow"].map((k) => sugg[k]);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("faults and notes from similar past shots are offered; nothing on too little history", () => {
  const short = (id) => rv(id, 0.8, { faults: ["Short hold / snap"], notes: id === 1 ? "Rushed the hold again" : "" });
  const normal = (id) => rv(id, 2.2, { notes: id === 7 ? "Good expansion" : "" });
  const past = [short(1), short(2), short(3), normal(4), normal(5), normal(6), normal(7)];
  const n = notice(past, "a1", rv(9, 0.9).phases, "9");
  assert.deepEqual(n.faults.map((x) => x.fault), ["Short hold / snap"]);
  assert.equal(n.similar[0].notes, "Rushed the hold again");
  assert.deepEqual(notice(past, "a1", rv(9, 2.2).phases, "9").faults, [], "a normal hold: no hint");
  assert.deepEqual(notice(past.slice(0, 2), "a1", rv(9, 0.9).phases, "9").faults, []);
  const p = rv(9, 0.8).phases; p.draw -= 0.2; // marked a little differently from the past shots
  assert.deepEqual(notice(past, "a1", p, "9").faults.map((x) => x.fault), ["Short hold / snap"], "a small difference elsewhere doesn't hide it");
});
