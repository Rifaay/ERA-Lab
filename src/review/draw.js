// The angle at corner b between b→a and b→c, in degrees (0–180). Points are in 0–1 of the picture; `ar` (width / height)
// puts both axes in the same units, so a 90° corner reads 90° on a wide video too.
export const angleOf = (a, b, c, ar) => {
  const v1 = [(a[0] - b[0]) * ar, a[1] - b[1]], v2 = [(c[0] - b[0]) * ar, c[1] - b[1]];
  const d = Math.abs(Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]));
  return (d * 180) / Math.PI;
};
