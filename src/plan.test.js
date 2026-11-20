import test from "node:test";
import assert from "node:assert/strict";
import { buildSeason, buildTargets, autoPlan, rulesOf, warnings, shotByDay, shotByWeek, loadRatio, weekStart, ramadanWeeks, monthGrid, dayFilled, phaseOfDay } from "./plan.js";

const Y = 2027;
const at = (w) => weekStart(Y, w);
const A = (w, id = "a" + w) => ({ id, name: "Champs", date: at(w), priority: "A" });

test("the season is built back from an A competition, with the coach's lengths", () => {
  const r = rulesOf({});
  const s = buildSeason([A(30)], Y, r);
  assert.equal(s[30], "comp");
  assert.deepEqual([s[29], s[28]], ["taper", "taper"]);
  assert.deepEqual([s[27], s[25]], ["precomp", "precomp"]);
  assert.deepEqual([s[24], s[19]], ["spp", "spp"]);
  assert.deepEqual([s[18], s[1]], ["gpp", "gpp"]);
  assert.deepEqual([s[31], s[32], s[33]], ["transition", "transition", undefined]);
  const short = buildSeason([A(30)], Y, rulesOf({ rules: { weeks: { taper: 1 } } }));
  assert.equal(short[28], "precomp", "a 1-week taper");
});

test("two A competitions close together: between them the archer stays sharp instead of resting", () => {
  const s = buildSeason([A(20), A(24)], Y, rulesOf({}));
  assert.deepEqual([s[20], s[21], s[22], s[23], s[24]], ["comp", "precomp", "taper", "taper", "comp"]);
});

test("targets: share of the peak, a lighter 4th build week, lighter Ramadan and B weeks", () => {
  const r = rulesOf({});
  const weeks = { 1: "gpp", 2: "gpp", 3: "gpp", 4: "gpp", 5: "gpp", 6: "taper" };
  const t = buildTargets(weeks, [{ id: "b", date: at(5), priority: "B" }], Y, r, [3]);
  assert.deepEqual([t[1].arrows, t[2].arrows, t[3].arrows, t[4].arrows, t[5].arrows, t[6].arrows], [900, 900, 630, 630, 720, 410]);
  assert.deepEqual(t[6].mix, r.mix.taper);
});

test("building again keeps every week the coach edited", () => {
  const plan = { comps: [A(30)], edited: [5], weeks: { 5: "spp" }, targets: { 5: { arrows: 123, mix: {} } } };
  const p = autoPlan(plan, Y, []);
  assert.equal(p.weeks[5], "spp"); assert.equal(p.targets[5].arrows, 123);
  assert.equal(p.weeks[6], "gpp"); assert.equal(p.targets[6].arrows, 900);
});

test("shot arrows by week and the 7:28-day load ratio", () => {
  const sessions = [{ athleteId: "x", date: at(10), arrows: "300" }, { athleteId: "x", date: at(10), arrows: "100" }, { athleteId: "y", date: at(10), arrows: "999" }];
  const byDay = shotByDay(sessions, "x");
  assert.equal(shotByWeek(byDay, Y)[10], 400);
  const flat = {}; for (let w = 7; w <= 10; w++) flat[at(w)] = 500;
  assert.equal(loadRatio(flat, Y, 10), 1);
  flat[at(10)] = 1500;
  assert.equal(loadRatio(flat, Y, 10), 2);
});

test("warnings: no taper, heavy competition week, sudden jump; a dismissed one stays gone", () => {
  const plan = { comps: [A(20, "c1")], weeks: { 19: "gpp", 20: "comp" }, targets: { 18: { arrows: 400 }, 19: { arrows: 900 }, 20: { arrows: 800 } } };
  const kinds = warnings(plan, Y).map((x) => x.kind);
  assert.deepEqual(kinds.sort(), ["heavyComp", "jump", "noTaper"]);
  assert.equal(warnings({ ...plan, dismissed: ["noTaper-c1"] }, Y).some((x) => x.kind === "noTaper"), false);
});

test("Ramadan weeks come from the Islamic calendar", () => {
  const w = ramadanWeeks(2027); // Ramadan 1448: about 8 February to 9 March 2027
  assert.ok(w.includes(6) && w.includes(9) && !w.includes(15), String(w));
});

test("returning to full volume after a lighter week is not a jump; going above recent weeks is", () => {
  const tg = (list) => Object.fromEntries(list.map((a, i) => [i + 1, { arrows: a }]));
  assert.deepEqual(warnings({ targets: tg([900, 900, 900, 630, 900]) }, Y).map((x) => x.kind), []);
  assert.ok(warnings({ targets: tg([500, 500, 500, 500, 900]) }, Y).some((x) => x.kind === "jump"));
});

test("a week the coach gave only a phase still gets that phase's numbers", () => {
  const p = autoPlan({ comps: [], edited: [3], weeks: { 3: "taper" } }, Y, []);
  assert.equal(p.weeks[3], "taper"); assert.equal(p.targets[3].arrows, 410);
});

test("calendar: a month as Monday-first rows; days know their plan week; empty days don't count", () => {
  const nov = monthGrid(2026, 10); // November 2026 starts on a Sunday
  assert.equal(nov.length % 7, 0);
  assert.equal(nov.indexOf("2026-11-01"), 6);
  assert.equal(nov.filter(Boolean).length, 30);
  assert.equal(nov.filter(Boolean).at(-1), "2026-11-30");
  assert.equal(monthGrid(2027, 1).filter(Boolean).length, 28); // February 2027
  assert.equal(monthGrid(2028, 1).filter(Boolean).length, 29); // leap year
  assert.equal(phaseOfDay({ weeks: { 1: "gpp" } }, "2026-01-07"), "gpp");
  assert.equal(phaseOfDay({ weeks: { 1: "gpp" } }, "2026-01-08"), null);
  assert.equal(dayFilled({ focus: "", exercises: [] }), false);
  assert.equal(dayFilled({ note: "rest" }), true);
});
