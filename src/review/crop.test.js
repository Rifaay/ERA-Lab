import test from "node:test";
import assert from "node:assert/strict";
import { boxFrom, wholeBox, decodeSimcc, toTensor, fromCrop, COCO_TO_MP, IN_W, IN_H } from "./crop.js";

test("the crop follows the archer with room round the body, in the model's 3:4 shape", () => {
  const pts = [{ x: .4, y: .3, s: .9 }, { x: .45, y: .7, s: .9 }, { x: .5, y: .5, s: .9 }, { x: .42, y: .5, s: .9 }, { x: .9, y: .1, s: .1 }];
  const b = boxFrom(pts, 1920, 1080);
  assert.ok(Math.abs(b.w / b.h - IN_W / IN_H) < 1e-9);
  assert.ok(b.x < .4 * 1920 && b.x + b.w > .5 * 1920 && b.y < .3 * 1080 && b.y + b.h > .7 * 1080, "holds every sure point");
  assert.ok(b.x + b.w < .9 * 1920, "an unsure point doesn't stretch it");
  assert.equal(boxFrom(pts.slice(0, 3), 1920, 1080), null, "too few points: look at the whole picture");
  const w = wholeBox(1920, 1080);
  assert.ok(w.w >= 1920 && w.h >= 1080 && Math.abs(w.w / w.h - .75) < 1e-9);
});

test("SimCC peaks become points in the whole picture, weaker peak as confidence", () => {
  const K = 2, LX = IN_W * 2, LY = IN_H * 2, sx = new Float32Array(K * LX), sy = new Float32Array(K * LY);
  sx[0 * LX + 96] = .9; sy[0 * LY + 256] = .6; // joint 0 at crop pixel (48, 128)
  sx[1 * LX + 0] = .1; sy[1 * LY + 0] = .2;
  const box = { x: 100, y: 50, w: 192 * 2, h: 256 * 2 }; // crop twice the input size
  const [a, b] = decodeSimcc(sx, sy, K, box, 1000, 1000);
  assert.ok(Math.abs(a.x - (100 + 48 * 2) / 1000) < 1e-9 && Math.abs(a.y - (50 + 128 * 2) / 1000) < 1e-9);
  assert.ok(Math.abs(a.s - .6) < 1e-6 && Math.abs(b.s - .1) < 1e-6);
});

test("pixels are normalised as RTMPose was trained, colour planes apart", () => {
  const t = toTensor(new Uint8ClampedArray([123.675, 116.28, 103.53, 255, 255, 0, 0, 255]), 2, 1);
  assert.ok(Math.abs(t[0]) < .01 && Math.abs(t[2]) < .01 && Math.abs(t[4]) < .01, "the mean colour is zero");
  assert.ok(t[1] > 2 && t[3] < -1.9, "red and green planes apart");
});

test("COCO joints land on MediaPipe's numbers; crop points map back to the picture", () => {
  assert.equal(COCO_TO_MP.length, 17);
  assert.deepEqual([COCO_TO_MP[9], COCO_TO_MP[10], COCO_TO_MP[15]], [15, 16, 27], "wrists and left ankle");
  const [p] = fromCrop([{ x: .5, y: .5, s: 1 }], { x: 100, y: 100, w: 200, h: 400 }, 1000, 1000);
  assert.ok(Math.abs(p.x - .2) < 1e-9 && Math.abs(p.y - .3) < 1e-9);
});
