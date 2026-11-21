import test from "node:test";
import assert from "node:assert/strict";
import { template, search, blendCorrection } from "./markers.js";

// A grey picture with one bright square, and the same square moved and lit differently.
const picture = (W, H, cx, cy, gain = 1, base = 40) => {
  const g = new Float32Array(W * H).fill(base);
  for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) g[y * W + x] = base + 150 * gain * (1 + ((x + y) % 3) / 3);
  return g;
};

test("the marker is found again after it moves, even when the light changes", () => {
  const W = 120, H = 90, a = picture(W, H, 40, 40), b = picture(W, H, 47, 36, .6, 70);
  const t = template(a, W, H, 40, 40, 6), r = search(b, W, H, t, 40, 40, 6, 12);
  assert.deepEqual([r.x, r.y], [47, 36]);
  assert.ok(r.score > .95, `score ${r.score}`);
  const blank = new Float32Array(W * H).fill(40).map((v, i) => v + ((i * 7919) % 13));
  assert.ok(search(blank, W, H, t, 40, 40, 6, 12).score < .5, "nothing like it: a low score, so the tracker knows");
});

test("one fix by the coach carries to the tracked frames on either side", () => {
  const m = { 0: [.1, .1, "m"], 1: [.2, .1, "t"], 2: [.3, .1, "t"], 3: [.4, .1, "t"], 4: [.5, .1, "t"], 5: [.6, .1, "t"], 6: [.9, .9, "m"] };
  blendCorrection(m, 3, .4, .2); // the coach says frame 3 is 0.1 lower
  assert.deepEqual(m[3], [.4, .2, "m"]);
  assert.deepEqual(m[0], [.1, .1, "m"], "the earlier mark stays");
  assert.ok(Math.abs(m[1][1] - (.1 + .1 / 3)) < 1e-4 && Math.abs(m[2][1] - (.1 + .2 / 3)) < 1e-4, "frames before lean in");
  assert.ok(Math.abs(m[4][1] - (.1 + .1 * 2 / 3)) < 1e-4 && Math.abs(m[5][1] - (.1 + .1 / 3)) < 1e-4, "frames after lean out");
  assert.deepEqual(m[6], [.9, .9, "m"], "the later mark stays");
  const ai = { 0: [.1, .1, "t"], 1: [.2, .1, "t"], 2: [.3, .1, "t"] }; // AI points: found frame by frame, no coach marks
  blendCorrection(ai, 1, .2, .3);
  assert.deepEqual([ai[0], ai[2]], [[.1, .1, "t"], [.3, .1, "t"]], "with no mark on a side, that side is left alone");
  const fresh = {}; blendCorrection(fresh, 4, .5, .5);
  assert.deepEqual(fresh, { 4: [.5, .5, "m"] }, "a new point is just placed");
});
