// The season plan: phases built back from the archer's A competitions, week targets in archery terms, what was shot,
// the load ratio and warnings. Every number here is a default the coach can change (plan.rules), and every week the
// coach touches is theirs: building again never overwrites an edited week.
import { planWeek, planWeekStart, addDays, isoDay } from "./stats.js";

// The calendar view: the year in months, a month in days. Each day sits in its plan week (phase, targets) and may
// carry the coach's own plan for that day: plan.days["2026-03-14"] = { focus, arrows, exercises: [ids], materials, note }.
export const monthGrid = (year, month) => { // month 0-11; rows of 7 starting Monday, null outside the month
  const lead = (new Date(year, month, 1).getDay() + 6) % 7, n = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => isoDay(new Date(year, month, i + 1)))];
  while (cells.length % 7) cells.push(null);
  return cells;
};
export const dayFilled = (d) => Boolean(d && (d.focus || d.arrows || d.note || d.materials || d.exercises?.length));
export const phaseOfDay = (plan, iso) => plan.weeks?.[planWeek(iso)] || null;

export const PHASES = ["gpp", "spp", "precomp", "taper", "comp", "transition", "accum", "intens", "realiz"];
export const COLORS = { gpp: "#3498db", spp: "#9b59b6", precomp: "#f39c12", taper: "#95a5a6", comp: "#e74c3c", transition: "#2ecc71", accum: "#1abc9c", intens: "#e67e22", realiz: "#c0392b" };
export const MIX = ["tech", "dist", "score", "sim"]; // blank bale & technique, distance shooting, scored rounds, competition simulation
const BUILD = ["gpp", "spp", "accum"]; // phases that take a lighter week every few weeks

const m = (tech, dist, score, sim) => ({ tech, dist, score, sim });
export const DEFAULT_RULES = {
  peakArrows: 900, // the biggest week of the season
  share: { gpp: 100, spp: 90, precomp: 70, taper: 45, comp: 35, transition: 15, accum: 100, intens: 80, realiz: 60 }, // % of peak
  mix: {
    gpp: m(60, 30, 10, 0), spp: m(40, 35, 20, 5), precomp: m(20, 25, 35, 20), taper: m(25, 15, 30, 30), comp: m(15, 10, 25, 50),
    transition: m(70, 10, 10, 10), accum: m(50, 35, 15, 0), intens: m(25, 30, 30, 15), realiz: m(15, 15, 30, 40),
  },
  physical: { gpp: 3, spp: 3, precomp: 2, taper: 1, comp: 1, transition: 2, accum: 3, intens: 2, realiz: 1 },
  mental: { gpp: 1, spp: 1, precomp: 2, taper: 2, comp: 2, transition: 1, accum: 1, intens: 2, realiz: 2 },
  weeks: { spp: 6, precomp: 3, taper: 2, transition: 2 }, // lengths before (and after) each A competition
  deloadEvery: 4, deloadCut: 30, // every 4th build week is 30% lighter
  ramadanCut: 30, bCut: 20, // Ramadan weeks and B-competition weeks are lighter
  warn: { maxJump: 30, acwrHigh: 1.5, compShare: 50, buildRun: 5 },
};
// A plan saved with only some rules (or none) gets the defaults for the rest.
export const rulesOf = (plan) => {
  const r = plan?.rules || {}, d = DEFAULT_RULES;
  return {
    ...d, ...r,
    share: { ...d.share, ...r.share }, physical: { ...d.physical, ...r.physical }, mental: { ...d.mental, ...r.mental },
    weeks: { ...d.weeks, ...r.weeks }, warn: { ...d.warn, ...r.warn },
    mix: Object.fromEntries(PHASES.map((k) => [k, { ...d.mix[k], ...r.mix?.[k] }])),
  };
};

export const weekStart = (year, w) => planWeekStart(year, w);
export const weekOf = (iso, year) => (iso?.startsWith(String(year)) ? planWeek(iso) : null);

// Weeks with a day of Ramadan, from the Umm al-Qura calendar the browser knows. The coach can still mark weeks by hand.
export const ramadanWeeks = (year) => {
  try {
    const f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric" }), out = new Set();
    for (let w = 1; w <= 52; w++) for (let d = 0; d < 7; d++) {
      const [y, mo, da] = addDays(weekStart(year, w), d).split("-").map(Number);
      if (f.format(new Date(y, mo - 1, da)) === "9") { out.add(w); break; }
    }
    return [...out];
  } catch { return []; }
};

// Competitions this year with their week: [{ ...comp, week }].
export const compsIn = (comps, year) => (comps || []).map((c) => ({ ...c, week: weekOf(c.date, year) })).filter((c) => c.week);

// Phases built back from each A competition: competition week, taper, pre-competition, specific preparation, and general
// preparation filling back to the previous season's rest; transition after. Where two competitions' blocks meet, the
// part nearer a competition wins.
const RANK = { comp: 6, taper: 5, precomp: 4, spp: 3, transition: 2, gpp: 1 };
export const buildSeason = (comps, year, rules) => {
  const out = {}, put = (w, k) => { if (w >= 1 && w <= 52 && (RANK[k] || 0) > (RANK[out[w]] || 0)) out[w] = k; };
  const As = compsIn(comps, year).filter((c) => c.priority === "A").sort((a, b) => a.week - b.week);
  let restEnd = 0;
  for (const c of As) {
    const { taper, precomp, spp, transition } = rules.weeks;
    put(c.week, "comp");
    let w = c.week - 1;
    for (let i = 0; i < taper; i++) put(w--, "taper");
    for (let i = 0; i < precomp; i++) put(w--, "precomp");
    for (let i = 0; i < spp; i++) put(w--, "spp");
    for (; w > restEnd; w--) put(w, "gpp");
    for (let i = 1; i <= transition; i++) put(c.week + i, "transition");
    restEnd = c.week + transition;
  }
  return out;
};

// Targets for every week that has a phase. `ramadan`: weeks to lighten; B competitions are lightened too.
export const buildTargets = (weeks, comps, year, rules, ramadan = []) => {
  const out = {}, bWeeks = new Set(compsIn(comps, year).filter((c) => c.priority === "B").map((c) => c.week));
  let run = 0;
  for (let w = 1; w <= 52; w++) {
    const k = weeks[w];
    if (!k) { run = 0; continue; }
    run = BUILD.includes(k) && BUILD.includes(weeks[w - 1]) ? run + 1 : BUILD.includes(k) ? 1 : 0;
    let arrows = rules.peakArrows * (rules.share[k] ?? 50) / 100;
    if (run && rules.deloadEvery > 1 && run % rules.deloadEvery === 0) arrows *= 1 - rules.deloadCut / 100;
    if (ramadan.includes(w)) arrows *= 1 - rules.ramadanCut / 100;
    if (bWeeks.has(w)) arrows *= 1 - rules.bCut / 100;
    out[w] = { arrows: Math.round(arrows / 10) * 10, mix: { ...rules.mix[k] }, physical: rules.physical[k] ?? 1, mental: rules.mental[k] ?? 1 };
  }
  return out;
};

// Builds the season again from the competitions and rules, keeping every week the coach edited.
export const autoPlan = (plan, year, ramadan = ramadanWeeks(year)) => {
  const rules = rulesOf(plan), edited = new Set((plan.edited || []).map(Number));
  const built = buildSeason(plan.comps, year, rules), weeks = {}, targets = {};
  for (let w = 1; w <= 52; w++) {
    if (edited.has(w)) { if (plan.weeks?.[w]) weeks[w] = plan.weeks[w]; if (plan.targets?.[w]) targets[w] = plan.targets[w]; }
    else if (built[w]) weeks[w] = built[w];
  }
  const fresh = buildTargets(weeks, plan.comps, year, rules, ramadan);
  // fresh numbers for every week ERA Lab fills, and for a week the coach gave a phase but no numbers yet
  for (const w in fresh) if (!edited.has(+w) || !targets[w]) targets[w] = { ...fresh[w], exercises: plan.targets?.[w]?.exercises || [], goals: plan.targets?.[w]?.goals || [], note: plan.targets?.[w]?.note || "" };
  return { ...plan, weeks, targets };
};

// Arrows actually shot each week (range sessions and session logs), and the daily totals behind the load ratio.
export const shotByDay = (sessions, athleteId) => {
  const out = {};
  for (const s of sessions) if (s.athleteId === athleteId && s.date) out[s.date] = (out[s.date] || 0) + (+s.arrows || 0);
  return out;
};
export const shotByWeek = (byDay, year) => {
  const out = {};
  for (const [d, n] of Object.entries(byDay)) { const w = weekOf(d, year); if (w) out[w] = (out[w] || 0) + n; }
  return out;
};
// Last 7 days' arrows against the weekly average of the last 28 (acute:chronic load ratio), at the end of each week.
export const loadRatio = (byDay, year, w) => {
  const end = addDays(weekStart(year, w), 6), sum = (days) => { let t = 0; for (let i = 0; i < days; i++) t += byDay[addDays(end, -i)] || 0; return t; };
  const acute = sum(7), chronic = sum(28) / 4;
  return chronic ? +(acute / chronic).toFixed(2) : null;
};

// What looks risky, for the coach to act on or dismiss. Each warning has a key so a dismissal sticks.
export const warnings = (plan, year, byDay = {}, todayWeek = 53) => {
  const rules = rulesOf(plan), wk = plan.weeks || {}, tg = plan.targets || {}, out = [], gone = new Set(plan.dismissed || []);
  const add = (key, week, kind, v = {}) => { if (!gone.has(key)) out.push({ key, week, kind, ...v }); };
  for (const c of compsIn(plan.comps, year)) {
    if (c.priority === "A" && c.week > 1 && !["taper", "comp"].includes(wk[c.week - 1])) add(`noTaper-${c.id}`, c.week, "noTaper", { name: c.name });
    const a = tg[c.week]?.arrows;
    if (c.priority !== "C" && a > rules.peakArrows * rules.warn.compShare / 100) add(`heavyComp-${c.id}`, c.week, "heavyComp", { name: c.name, arrows: a });
  }
  let run = 0;
  for (let w = 2; w <= 52; w++) {
    const a = tg[w]?.arrows, b = tg[w - 1]?.arrows;
    // a jump above the last 4 weeks' highest: going back to full volume after a planned lighter week is not one
    const recent = Math.max(0, ...[1, 2, 3, 4].map((i) => +tg[w - i]?.arrows || 0));
    if (a && recent && a > recent * (1 + rules.warn.maxJump / 100)) add(`jump-${w}`, w, "jump", { pct: Math.round((a / recent - 1) * 100) });
    run = a && b && a >= b * 0.9 ? run + 1 : 0;
    if (run + 1 === rules.warn.buildRun) add(`run-${w}`, w, "buildRun", { n: run + 1 });
  }
  for (let w = 1; w < Math.min(53, todayWeek + 1); w++) {
    const r = loadRatio(byDay, year, w);
    if (r != null && r > rules.warn.acwrHigh) add(`acwr-${w}`, w, "acwr", { ratio: r });
  }
  return out.sort((x, y) => x.week - y.week);
};
