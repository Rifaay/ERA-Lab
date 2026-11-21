// The marker tracker (like Kinovea's): a spot the coach placed is followed frame to frame by matching the little
// picture around it. Plain functions on grey pixel arrays, tested in Node (markers.test.js).

// Zero-mean normalised cross-correlation of a (2r+1)² patch: 1 is the same picture, whatever the light did.
const patch = (g, W, H, x, y, r) => {
  const n = (2 * r + 1) ** 2, out = new Float32Array(n);
  let k = 0, sum = 0;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const v = g[Math.min(H - 1, Math.max(0, y + j)) * W + Math.min(W - 1, Math.max(0, x + i))];
    out[k++] = v; sum += v;
  }
  const m = sum / n; let ss = 0;
  for (let i = 0; i < n; i++) { out[i] -= m; ss += out[i] * out[i]; }
  return { v: out, norm: Math.sqrt(ss) || 1 };
};
export const template = (g, W, H, x, y, r) => patch(g, W, H, Math.round(x), Math.round(y), r);

// Best match for the template within ±S pixels of (px, py): every other pixel first, then every pixel round the best.
// Returns { x, y, score }.
export function search(g, W, H, tpl, px, py, r, S) {
  let best = -2, bx = Math.round(px), by = Math.round(py);
  const at = (x, y) => {
    const p = patch(g, W, H, x, y, r);
    let dot = 0; for (let i = 0; i < p.v.length; i++) dot += p.v[i] * tpl.v[i];
    const sc = dot / (p.norm * tpl.norm);
    if (sc > best) { best = sc; bx = x; by = y; }
  };
  const cx = bx, cy = by;
  for (let dy = -S; dy <= S; dy += 2) for (let dx = -S; dx <= S; dx += 2) at(cx + dx, cy + dy);
  const fx = bx, fy = by;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) at(fx + dx, fy + dy);
  return { x: bx, y: by, score: best };
}

// The coach moved a tracked point on frame f. The frames tracked since the previous mark of the coach's lean towards
// the correction (none at that mark, all of it at f), and the frames after f up to the next mark lean back out of it,
// so one fix repairs the drift around it. m: { frame: [x, y, kind] }; kind "m" is the coach's, others are tracked.
export function blendCorrection(m, f, x, y) {
  const old = m[f], frames = Object.keys(m).map(Number).sort((a, b) => a - b);
  m[f] = [x, y, "m"];
  if (!old || old[2] === "m") return m;
  const ex = x - old[0], ey = y - old[1];
  const prev = frames.filter((g) => g < f && m[g][2] === "m").pop();
  const next = frames.find((g) => g > f && m[g][2] === "m");
  const run = (g) => m[g] && m[g][2] !== "m";
  const near = (from, to, step) => { const out = []; for (let g = from; g !== to && run(g); g += step) out.push(g); return out; }; // tracked frames touching f
  const before = near(f - 1, prev ?? -1, -1), after = near(f + 1, next ?? Infinity, 1);
  const shift = (g, w) => { m[g] = [+(m[g][0] + ex * w).toFixed(5), +(m[g][1] + ey * w).toFixed(5), m[g][2]]; };
  before.forEach((g) => shift(g, prev != null ? (g - prev) / (f - prev) : 1));
  after.forEach((g) => shift(g, next != null ? (next - g) / (next - f) : 1)); // no later mark: the rest of the run moves with it
  return m;
}
