import test from "node:test";
import assert from "node:assert/strict";
import { bowSide, smooth, toPoints, fillGaps } from "./pose.js";

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

test("unsure points are kept faded, short holes are filled, long ones left", () => {
  const frames = Array.from({ length: 12 }, () => rightHanded());
  frames[1][16] = { x: 0.9, y: 0.4, visibility: 0.3 }; // the bow wrist half hidden (right-handed: the left wrist is the bow one)
  const pts = toPoints(frames, 30);
  assert.equal(Object.values(pts.bow_wrist).some((q) => q[2] === "i") || Object.values(pts.draw_wrist).some((q) => q[2] === "i"), true, "a faded point, not a hole");
  const list = [{ x: 0, y: 0 }, null, null, { x: 0.3, y: 0.3 }, ...Array(8).fill(null), { x: 1, y: 1 }];
  const out = fillGaps(list, 6);
  assert.ok(out[1].filled && Math.abs(out[1].x - 0.1) < 1e-9 && Math.abs(out[2].x - 0.2) < 1e-9, "two missing frames filled on the line");
  assert.equal(out[6], null, "eight missing frames stay missing");
});
