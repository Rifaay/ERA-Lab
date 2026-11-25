import test from "node:test";
import assert from "node:assert/strict";
import { ptAt, enforceOrder, finishMotion, suggestPhases, isSwipeDown, hitPoint, hitShape, moveShape, phaseAt, blank } from "./labels.js";

test("a point between two marks is drawn on the line between them, faded", () => {
  const pts = { head: { 0: [0, 0, "m"], 10: [1, 1, "m"] } };
  assert.deepEqual(ptAt(pts, "head", 5, 10), [0.5, 0.5, "i"]);
  assert.equal(ptAt(pts, "head", 5), null, "a gap longer than a quarter second is left empty");
  assert.deepEqual(ptAt(pts, "head", 10), [1, 1, "m"]);
  assert.equal(ptAt(pts, "head", 11), null);
  assert.equal(ptAt({ head: { 0: [0, 0], 40: [1, 1] } }, "head", 20, 30), null, "too far apart to guess");
});

test("phases stay in order and the one on screen is found", () => {
  const ph = blank("c").phases;
  ph[0].start_frame = 5; ph[1].start_frame = 3;
  enforceOrder(ph, 30);
  assert.equal(ph[1].start_frame, 6);
  ph[0].start_s = 0; ph[1].start_s = 1;
  assert.equal(phaseAt(ph, 0.5), 0);
  assert.equal(phaseAt(ph, 1.2), 1);
});

test("a clip with a long still stretch gets its release at the end of it", () => {
  const f = 30, raw = [...Array(20).fill(0.8), ...Array(10).fill(0.05), ...Array(30).fill(0.9), ...Array(30).fill(0.02), ...Array(20).fill(1)];
  const m = finishMotion(raw, f);
  assert.equal(m.values.length, raw.length);
  const r = suggestPhases(m.values, f);
  assert.ok(Math.abs(r.sugg.release - 90) <= 2, `release at ${r.sugg.release}`);
  assert.ok(r.sugg.anchor < r.sugg.release && r.sugg.draw < r.sugg.anchor);
  assert.equal(suggestPhases(Array(60).fill(0.5), f), null, "no hold, no guess");
});

test("only a quick, mostly downward flick deletes", () => {
  assert.equal(isSwipeDown({ dx: 5, dy: 80, ms: 200 }), true);
  assert.equal(isSwipeDown({ dx: 5, dy: -80, ms: 200 }), false, "up");
  assert.equal(isSwipeDown({ dx: 60, dy: 80, ms: 200 }), false, "sideways");
  assert.equal(isSwipeDown({ dx: 0, dy: 30, ms: 200 }), false, "too short");
  assert.equal(isSwipeDown({ dx: 0, dy: 80, ms: 1500 }), false, "a slow drag");
});

test("presses find the point or drawing under the finger", () => {
  assert.equal(hitPoint({ a: [10, 10], b: [50, 50] }, 48, 52, 20), "b");
  assert.equal(hitPoint({ a: [10, 10] }, 100, 100, 20), null);
  const shapes = [{ t: "line", p: [[0, 0], [1, 1]] }, { t: "circle", p: [[0.5, 0.5], [0.6, 0.5]] }];
  assert.equal(hitShape(shapes, 60, 50, 6, 100, 100), 1, "on the circle's rim");
  assert.equal(hitShape(shapes, 20, 20, 6, 100, 100), 0, "on the line");
  assert.equal(hitShape(shapes, 90, 10, 6, 100, 100), -1);
  assert.deepEqual(moveShape(shapes[0], 0.1, 0).p, [[0.1, 0], [1.1, 1]]);
});
