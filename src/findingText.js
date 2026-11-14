// One finding from stats.js findings(), in the coach's language. Shared by Statistics and the archer report.
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const f1 = (v) => (v == null ? "–" : v.toFixed(1));
const f2 = (v) => (v == null ? "–" : v.toFixed(2));

// s: tr.stats. shortDate(iso): the date as "12 Oct" in the coach's language.
export function findingText(x, s, shortDate) {
  const L = s.find;
  if (x.kind === "leak") return fill(L.leak, { cause: x.cause === "fault" ? fill(s.faultNamed, { name: x.name }) : s.causes[x.cause].toLowerCase(), n: f1(x.perArrow * 72) });
  if (x.kind === "aim") return fill(L.aim, { d: x.distance, x: `${Math.abs(x.x).toFixed(1)} cm ${x.x > 0 ? s.right : s.left}`, y: `${Math.abs(x.y).toFixed(1)} cm ${x.y > 0 ? s.high : s.low}` });
  if (x.kind === "shape") return fill(x.wide ? L.wide : L.tall, { d: x.distance });
  if (x.kind === "fatigue") return fill(L.fatigue, { a: f2(x.early), b: f2(x.late) });
  if (x.kind === "position") return fill(L.position, { n: x.n, a: f2(x.avg), b: f2(x.others) });
  if (x.kind === "routine") return fill(L.routine, { a: f2(x.yes), b: f2(x.not) });
  if (x.kind === "feel") return fill(x.matches ? L.feelGood : L.feelOff, { a: f2(x.good), b: f2(x.bad) });
  if (x.kind === "readiness") return x.up ? L.readyUp : L.readyDown;
  if (x.kind === "pb") return fill(L.pb, { d: x.distance, a: f2(x.avg) });
  if (x.kind === "trend") return fill(x.to > x.from ? L.up : L.down, { a: f2(x.from), b: f2(x.to) });
  if (x.kind === "volume") return fill(x.change > 0 ? L.more : L.fewer, { n: Math.round(Math.abs(x.change) * 100) });
  if (x.kind === "busiest") return fill(L.busiest, { w: shortDate(x.from), n: x.arrows });
  return "";
}
