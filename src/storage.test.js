// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
const ls = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    if (ls.full) throw new Error("QuotaExceededError");
    mem.set(k, String(v));
  },
  removeItem: (k) => mem.delete(k),
};
globalThis.localStorage = new Proxy(ls, { ownKeys: () => [...mem.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
const alerts = [];
globalThis.window = { alert: (m) => alerts.push(m) };
let downloads = 0;
globalThis.document = { createElement: () => ({ click: () => downloads++ }) };
globalThis.URL.createObjectURL = () => "blob:x";
globalThis.URL.revokeObjectURL = () => {};

const s = await import("./storage.js");
const reset = () => { mem.clear(); alerts.length = 0; downloads = 0; ls.full = false; };
const backup = (extra = {}) => JSON.stringify({ version: 2, athletes: [{ id: "a", name: "New" }], ...extra });

test("corrupt data is set aside, not lost or fatal", () => {
  reset();
  mem.set("racm_sessions", "{not json");
  assert.deepEqual(s.getSessions(), []);
  assert.equal(mem.get("racm_sessions_corrupt"), "{not json");
  assert.equal(alerts.length, 1);
});

test("wrong-shaped data is treated as corrupt", () => {
  reset();
  mem.set("racm_athletes", '{"a":1}');
  assert.deepEqual(s.getAthletes(), []);
  mem.set("racm_settings", "null");
  assert.equal(s.getSettings().coachName, "");
});

test("a full disk surfaces an error instead of a false save", () => {
  reset();
  ls.full = true;
  assert.throws(() => s.saveAthlete({ id: "a", name: "A" }));
  assert.equal(alerts.length, 1);
});

for (const [name, bad] of [
  ["not an object", "null"],
  ["newer version", JSON.stringify({ version: 3, athletes: [] })],
  ["athlete without a name", JSON.stringify({ athletes: [{ id: "a" }] })],
  ["sessions not a list", backup({ sessions: "nope" })],
  ["null record", backup({ goals: [null] })],
  ["settings not an object", backup({ settings: [] })],
]) {
  test(`restore rejects ${name} and leaves data alone`, () => {
    reset();
    s.saveAthlete({ id: "old", name: "Old" });
    assert.throws(() => s.importBackup(bad));
    assert.equal(s.getAthletes()[0].name, "Old");
    assert.equal(downloads, 0);
  });
}

test("restore downloads a safety copy, then replaces data", () => {
  reset();
  s.saveAthlete({ id: "old", name: "Old" });
  s.importBackup(backup());
  assert.equal(downloads, 1);
  assert.equal(s.getAthletes()[0].name, "New");
});

test("a restore that fails midway rolls back", () => {
  reset();
  s.saveAthlete({ id: "old", name: "Old" });
  const realSet = ls.setItem;
  let writes = 0;
  ls.setItem = (k, v) => { if (++writes === 3) throw new Error("QuotaExceededError"); realSet(k, v); };
  assert.throws(() => s.importBackup(backup()));
  ls.setItem = realSet;
  assert.equal(s.getAthletes()[0].name, "Old");
});

test("clear all leaves other apps' data on the same origin", () => {
  reset();
  mem.set("someone_elses_key", "keep");
  s.saveAthlete({ id: "a", name: "A" });
  mem.set("racm_sessions_corrupt", "x");
  s.clearAllData();
  assert.deepEqual([...mem.keys()], ["someone_elses_key"]);
});

test("deleting an athlete removes all their records, keeps everyone else's, and downloads a backup first", () => {
  reset();
  s.saveAthlete({ id: "a", name: "A" });
  s.saveAthlete({ id: "b", name: "B" });
  for (const id of ["a", "b"]) {
    s.saveSession({ id: `s-${id}`, athleteId: id });
    s.saveAssessment({ id: `as-${id}`, athleteId: id });
    s.savePlan({ id: `${id}-2026`, athleteId: id, year: 2026 });
    s.saveGoal({ id: `g-${id}`, athleteId: id });
    s.saveProgressLog({ goalId: `g-${id}` });
    s.saveCheckIn({ goalId: `g-${id}` });
    s.saveReview({ id: `clip-${id}.mp4`, athleteId: id });
    s.saveReview({ id: `clip-${id}.mp4`, athleteId: id, verdict: "good" }); // saving a clip twice keeps one record
  }
  s.saveRange({ live: { athlete_id: "a" }, setups: { a: { bow: "x" }, b: { bow: "y" } } });
  s.deleteAthlete("a");
  assert.deepEqual(s.getRange(), { live: null, setups: { b: { bow: "y" } } });
  assert.equal(downloads, 1);
  assert.deepEqual(s.getAthletes().map((x) => x.id), ["b"]);
  assert.deepEqual(s.getSessions().map((x) => x.athleteId), ["b"]);
  assert.deepEqual(s.getAssessments().map((x) => x.athleteId), ["b"]);
  assert.deepEqual(s.getPlans().map((x) => x.athleteId), ["b"]);
  assert.deepEqual(s.getGoals().map((x) => x.id), ["g-b"]);
  assert.deepEqual(s.getProgressLogs().map((x) => x.goalId), ["g-b"]);
  assert.deepEqual(s.getCheckIns().map((x) => x.goalId), ["g-b"]);
  assert.deepEqual(s.getReviews(), [{ id: "clip-b.mp4", athleteId: "b", verdict: "good" }]);
});

test("plans belong to the coach: older one-archer plans read as plans with that archer, and an archer follows one plan a season", () => {
  reset();
  s.saveAthlete({ id: "a", name: "Test One" }); s.saveAthlete({ id: "b", name: "Test Two" });
  s.savePlan({ id: "a-2026", athleteId: "a", year: 2026, weeks: {} }); // made before plans had archers
  const old = s.getPlanById("a-2026");
  assert.deepEqual(old.archers, ["a"]);
  assert.equal(old.name, "Test One 2026");
  assert.equal(s.planFor("a", 2026).id, "a-2026");
  const group = s.newPlan({ name: "Seniors", level: "elite", year: 2026 });
  assert.equal(group.rules.peakArrows, s.LEVELS.elite);
  s.assignArchers(group.id, ["a", "b"]);
  assert.equal(s.planFor("a", 2026).id, group.id, "ticking moves an archer off their other plan of the season");
  assert.deepEqual(s.getPlanById("a-2026").archers, []);
  s.deleteAthlete("a");
  assert.equal(s.getPlanById("a-2026"), null, "the plan named after the deleted archer goes");
  assert.deepEqual(s.getPlanById(group.id).archers, ["b"], "a plan others follow stays, without them");
  s.deletePlan(group.id);
  assert.equal(s.getPlans().length, 0);
});
