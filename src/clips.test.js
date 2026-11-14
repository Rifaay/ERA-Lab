// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAULTS, pickMime, clipName, quickReview, shotOf, toggleFault, setVerdict, refreshShots } from "./clips.js";
import { mergeReview, reviewFacts } from "./review.js";
import { t } from "./i18n.js";

test("the phone's fault tags are the Labeller's, and both languages name every one", () => {
  const engine = readFileSync(new URL("./review/engine.js", import.meta.url), "utf8");
  assert.deepEqual(FAULTS, JSON.parse(engine.match(/DEFAULT_FAULTS = (\[.*?\]);/)[1].replace(/'/g, '"')));
  assert.equal(t.en.quick.faults.length, FAULTS.length);
  assert.equal(t.ar.quick.faults.length, FAULTS.length);
});

test("clip names sort by time and carry the archer; MP4 is preferred", () => {
  const at = new Date(2026, 10, 14, 9, 5, 7).getTime();
  assert.equal(clipName("Test Archer", at, "video/mp4"), "2026-11-14_090507_TestArcher.mp4");
  assert.equal(clipName("رامي تجربة", at, "video/webm;codecs=vp9"), "2026-11-14_090507_راميتجربة.webm");
  assert.equal(pickMime((m) => m.startsWith("video/webm")), "video/webm;codecs=vp9");
  assert.equal(pickMime(() => false), "");
});

test("a clip links to the arrow just plotted, tags toggle, and saving the session updates its score", () => {
  const live = { session_id: "S1", ends: [{ end: 1, arrows: [{ arrow: 1, score: "9" }, { arrow: 2, score: "7" }] }] };
  const shot = shotOf(live, 0, 1);
  assert.deepEqual(shot, { session_id: "S1", end: 1, arrow: 2, score: "7" });
  let r = quickReview({ id: "c.mp4", athlete: { id: "a1", name: "Test Archer" }, at: Date.now(), shot });
  r = toggleFault(r, "Plucked release");
  assert.deepEqual([r.verdict, r.faults], ["fault", ["Plucked release"]]);
  r = setVerdict(r, "good");
  assert.deepEqual([r.verdict, r.faults], ["good", []]);
  live.ends[0].arrows[1].score = "8"; // re-scored before the session was saved
  assert.equal(refreshShots([r], live)[0].shot.score, "8");
});

test("labels saved on the computer keep the phone's tags they leave out; untagged clips count as waiting", () => {
  const phone = { id: "c.mp4", athleteId: "a1", verdict: "fault", faults: ["Head moved"], notes: "late", shot: { session_id: "S1", end: 1, arrow: 2 }, phasesMarked: 0 };
  const pc = { id: "c.mp4", athleteId: "", verdict: null, faults: [], notes: "", shot: null, phasesMarked: 6, holdS: 2.1 };
  const m = mergeReview(phone, pc);
  assert.deepEqual([m.athleteId, m.verdict, m.faults, m.notes, m.shot.arrow, m.phasesMarked], ["a1", "fault", ["Head moved"], "late", 2, 6]);
  const f = reviewFacts([m, { id: "d.mp4", athleteId: "a1", verdict: null, faults: [], phasesMarked: 0 }], "a1");
  assert.deepEqual([f.count, f.waiting], [1, 1]);
});
