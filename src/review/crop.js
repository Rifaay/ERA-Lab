// Where to look in the next frame, and the RTMPose maths. Plain functions, tested in Node (crop.test.js).
// Points everywhere are { x, y, s }: x and y as fractions of the picture, s the model's confidence 0..1.

export const IN_W = 192, IN_H = 256, SPLIT = 2; // RTMPose-m input (width × height) and its SimCC bins per pixel
// RTMPose's 17 COCO points → MediaPipe's numbering, so the rest of the Labeller reads one layout.
// COCO: nose, eyes, ears, shoulders, elbows, wrists, hips, knees, ankles (left then right).
export const COCO_TO_MP = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const SEEN = 0.3; // below this a point doesn't count for placing the crop

// A box around the archer from last frame's points, in pixels, or null to look at the whole picture.
// Points hug the body, so the box gets room for the bow, the head and the feet, and keeps the model's 3:4 shape.
export function boxFrom(points, W, H, { pad = 1.5, aspect = IN_W / IN_H } = {}) {
  const ok = (points || []).filter((p) => p && p.s >= SEEN);
  if (ok.length < 4) return null;
  const xs = ok.map((p) => p.x * W), ys = ok.map((p) => p.y * H);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let w = (x1 - x0) * pad, h = (y1 - y0) * pad;
  if (w > h * aspect) h = w / aspect; else w = h * aspect;
  const min = Math.min(W, H) * 0.25; // never zoom into a sliver
  if (h < min) { h = min; w = h * aspect; }
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

// Is a result from a crop believable? Enough sure points, and the body still about as tall as in the last frame:
// a crop that caught only part of the archer (or someone else) must not steer the next crop.
export function sane(points, last, minSure) {
  if (!points) return false;
  const tall = (ps) => { const ys = (ps || []).filter((p) => p && p.s >= SEEN).map((p) => p.y); return ys.length >= 4 ? Math.max(...ys) - Math.min(...ys) : 0; };
  return points.filter((p) => p && p.s >= 0.5).length >= minSure && (!last || tall(points) >= 0.6 * tall(last));
}

// The whole picture as a box of the model's shape, centred (the rest is padded black).
export function wholeBox(W, H, aspect = IN_W / IN_H) {
  let w = W, h = H;
  if (w > h * aspect) h = w / aspect; else w = h * aspect;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// RGBA pixels of the crop → the model's input: RGB planes, normalised as RTMPose was trained.
const MEAN = [123.675, 116.28, 103.53], STD = [58.395, 57.12, 57.375];
export function toTensor(rgba, w = IN_W, h = IN_H) {
  const n = w * h, out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[i * 4 + c] - MEAN[c]) / STD[c];
  return out;
}

// SimCC output → points. For each joint the best x bin and the best y bin give its place in the crop; the weaker of
// the two peaks is its confidence. box: the crop in picture pixels; W, H: the picture.
export function decodeSimcc(simX, simY, K, box, W, H) {
  const LX = simX.length / K, LY = simY.length / K, out = [];
  for (let k = 0; k < K; k++) {
    let bx = 0, vx = -Infinity, by = 0, vy = -Infinity;
    for (let i = 0; i < LX; i++) { const v = simX[k * LX + i]; if (v > vx) { vx = v; bx = i; } }
    for (let i = 0; i < LY; i++) { const v = simY[k * LY + i]; if (v > vy) { vy = v; by = i; } }
    const x = box.x + (bx / SPLIT) * (box.w / IN_W), y = box.y + (by / SPLIT) * (box.h / IN_H);
    out.push({ x: x / W, y: y / H, s: Math.max(0, Math.min(vx, vy)) });
  }
  return out;
}

// Points found inside a crop (fractions of the crop) → fractions of the whole picture.
export const fromCrop = (points, box, W, H) => points.map((p) => p && { ...p, x: (box.x + p.x * box.w) / W, y: (box.y + p.y * box.h) / H });
