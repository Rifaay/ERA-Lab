import test from "node:test";
import assert from "node:assert/strict";
import { angleOf } from "./draw.js";

test("the angle tool reads true angles on a wide video", () => {
  // 16:9 picture: a right angle drawn on the real scene is not square in 0–1 picture units
  assert.equal(Math.round(angleOf([0.5, 0.2], [0.5, 0.5], [0.5 + 0.3 * 9 / 16, 0.5], 16 / 9)), 90);
  assert.equal(Math.round(angleOf([0.2, 0.5], [0.5, 0.5], [0.8, 0.5], 16 / 9)), 180);
  assert.equal(Math.round(angleOf([0.8, 0.5], [0.5, 0.5], [0.8, 0.5], 1)), 0);
});
