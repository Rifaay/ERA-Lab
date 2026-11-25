// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { FAULTS, pickMime, clipName, quickReview, shotOf, toggleFault, setVerdict, refreshShots, suggestShot, arrowChoices } from "./clips.js";
import { mergeReview, reviewFacts } from "./review.js";
import { t } from "./i18n.js";

test("both languages name every fault tag", () => {
  assert.equal(t.en.quick.faults.length, FAULTS.length);
  assert.equal(t.ar.quick.faults.length, FAULTS.length);
});

test("clip names sort by time and carry the archer; MP4 is preferred", () => {
  const at = new Date(2026, 10, 14, 9, 5, 7).getTime();
  assert.equal(clipName("Test Archer", at, "video/mp4"), "2026-11-14_090507_TestArcher_phone.mp4");
  assert.equal(clipName("رامي تجربة", at, "video/webm;codecs=vp9"), "2026-11-14_090507_راميتجربة_phone.webm");
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

test("a clip from another camera finds its arrow by time, shot by shot or end by end", () => {
  const T = 1_800_000_000_000, s = 1000;
  // End 1 plotted arrow by arrow (each shot filmed, then plotted); end 2 plotted all at once after shooting.
  const range = { session_id: "S1", start_ms: T, ends: [
    { end: 1, arrows: [{ arrow: 1, score: "9", plot_ms: T + 40 * s }, { arrow: 2, score: "8", plot_ms: T + 100 * s }] },
    { end: 2, arrows: [{ arrow: 1, score: "10", plot_ms: T + 400 * s }, { arrow: 2, score: "7", plot_ms: T + 405 * s }] },
  ] };
  assert.deepEqual(suggestShot([range], T + 50 * s, T + 60 * s), { session_id: "S1", end: 1, arrow: 2, score: "8", how: "arrow" });
  assert.equal(suggestShot([range], T + 200 * s, T + 210 * s).end, 2);
  assert.equal(suggestShot([range], T + 200 * s, T + 210 * s, new Set(["S1/2/1"])).arrow, 2, "the next arrow without a clip");
  assert.equal(suggestShot([range], T + 900 * s, T + 910 * s), null, "after the session: no guess");
  const sessions = [{ athleteId: "a1", date: "2027-01-15", range }, { athleteId: "a2", date: "2027-01-15", range }];
  assert.equal(arrowChoices(sessions, "a1", new Date("2027-01-15T10:00").getTime()).length, 4);
});

