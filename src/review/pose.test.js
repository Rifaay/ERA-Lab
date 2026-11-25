import test from "node:test";
import assert from "node:assert/strict";
import { bowSide, smooth, toPoints, unswap, despike } from "./pose.js";
import { sane } from "./crop.js";

// A fake MediaPipe frame: 33 points at the centre, then the ones a test cares about.
const frame = (set = {}) => {
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  for (const [i, v] of Object.entries(set)) p[i] = { visibility: 0.9, ...v };
  return p;
};
// Right-handed archer: bow arm is the person's left (wrist 15 far from the nose), draw hand (16) at the face.
const rightHanded = (dx = 0) => frame({ 0: { x: 0.5, y: 0.3 }, 15: { x: 0.9 + dx, y: 0.35 }, 16: { x: 0.52, y: 0.32 }, 11: { x: 0.55, y: 0.4 }, 12: { x: 0.45, y: 0.4 } });

test("the bow arm is the one that stays away from the face, for either hand", () => {
  assert.equal(bowSide([rightHanded(), null, rightHanded()]), "left");
  const lefty = frame({ 0: { x: 0.5, y: 0.3 }, 16: { x: 0.1, y: 0.35 }, 15: { x: 0.48, y: 0.32 } });
  assert.equal(bowSide([lefty]), "right");
});

test("smoothing calms shaking points, keeps a real move and leaves holes as holes", () => {
  const shaky = Array.from({ length: 60 }, (_, i) => 0.5 + (i % 2 ? 0.004 : -0.004));
  const s = smooth(shaky, 30);
  const spread = (a) => Math.max(...a.slice(10, 50)) - Math.min(...a.slice(10, 50));
  assert.ok(spread(s) < spread(shaky) / 3, "jitter is mostly gone");
  const step = Array.from({ length: 60 }, (_, i) => (i < 30 ? 0.2 : 0.8)), t = smooth(step, 30);
  assert.ok(t[5] < 0.25 && t[55] > 0.75, "both sides of a quick move stay where they were");
  assert.deepEqual(smooth([0.1, null, 0.3], 30).map((x) => x == null), [false, true, false]);
});

test("frames become the Labeller's points, bow and draw sides right, unseen points left out", () => {
  const frames = [rightHanded(), rightHanded(0.001), rightHanded()];
  frames[2][27] = { x: 0.5, y: 0.9, visibility: 0.1 }; // bow ankle hidden on the last frame
  const pts = toPoints(frames, 30);
  assert.ok(pts.bow_wrist[0][0] > 0.85, "bow wrist is the far one");
  assert.ok(pts.draw_wrist[0][0] < 0.6, "draw wrist is at the face");
  assert.equal(pts.bow_wrist[0][2], "t", "marked as tracked, so a coach's click still wins");
  assert.equal(pts.bow_ankle[2], undefined, "an ankle the model can't see is not guessed");
  assert.ok(pts.head && pts.bow_hip && pts.draw_knee, "the whole skeleton");
  assert.equal(toPoints(frames, 30, false).bow_hip, undefined, "upper body only when asked");
});

test("unsure points are kept faded instead of dropped", () => {
  const frames = Array.from({ length: 12 }, () => rightHanded());
  frames[1][16] = { x: 0.9, y: 0.4, visibility: 0.3 };
  frames[2][16] = { x: 0.9, y: 0.4, visibility: 0.1 };
  const pts = toPoints(frames, 30);
  assert.ok(Object.values(pts.bow_wrist).some((q) => q[2] === "i") || Object.values(pts.draw_wrist).some((q) => q[2] === "i"), "a faded point, not a hole");
});

test("a left/right swap for one frame is put back, so two joints never jump onto each other", () => {
  const frames = [rightHanded(), rightHanded(), rightHanded()];
  [frames[1][15], frames[1][16]] = [frames[1][16], frames[1][15]]; // the model swapped the wrists on frame 1
  const fixed = unswap(frames);
  assert.ok(fixed[1][15].x > 0.85 && fixed[1][16].x < 0.6, "wrists back on their own sides");
  assert.ok(frames[1][15].x < 0.6, "the model's frames are left as they were");
  const pts = toPoints(frames, 30);
  assert.ok(pts.bow_wrist[1][0] > 0.85, "the bow wrist stays at the bow");
});

test("a one-frame leap off the body becomes a hole; a real move stays", () => {
  const at = (x) => ({ x, y: 0.5 });
  assert.equal(despike([at(0.5), at(0.5), at(0.9), at(0.5), at(0.5)], 0.05)[2], null, "out and straight back: a wrong guess");
  assert.deepEqual(despike([at(0.5), at(0.6), at(0.7), at(0.8)], 0.05).map((q) => q.x), [0.5, 0.6, 0.7, 0.8], "steady movement is kept");
});

test("a crop that caught only part of the archer is not trusted", () => {
  const body = (y0, y1, s = 0.9) => Array.from({ length: 10 }, (_, i) => ({ x: 0.5, y: y0 + ((y1 - y0) * i) / 9, s }));
  assert.equal(sane(body(0.2, 0.9), body(0.2, 0.9), 8), true);
  assert.equal(sane(body(0.2, 0.4), body(0.2, 0.9), 8), false, "the body shrank to a third: look at the whole picture");
  assert.equal(sane(body(0.2, 0.9, 0.3), null, 8), false, "too few sure points");
  assert.equal(sane(null, null, 8), false);
});
