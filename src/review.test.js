// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { archerOf, reviewFromLabels, reviewFacts } from "./review.js";

const athletes = [{ id: "a", name: "Test Archer A" }, { id: "b", name: "Test Archer B" }];
const sessions = [{ athleteId: "b", range: { session_id: "S1" } }];
const ctx = { sessions, athletes, selectedId: "a" };
const labels = (extra = {}) => ({
  clip: "2026-11-07_092804_TestArcherA_side_slowmo240.mp4", athlete: "Test Archer A", date: "2026-11-07", camera_angle: "Bow-arm side",
  phases: [{ key: "anchor", start_s: 4.2 }, { key: "release", start_s: 7.05 }, { key: "follow", start_s: null }],
  verdict: "fault", faults: ["Plucked release"], notes: "late clicker", labelled_at: "2026-11-13T10:00:00.000Z", ...extra,
});

test("the linked arrow's session decides whose clip it is, before the file name or the archer on screen", () => {
  assert.equal(archerOf(labels({ shot: { session_id: "S1" } }), ctx), "b");
  assert.equal(archerOf(labels(), ctx), "a");
  assert.equal(archerOf(labels({ athlete: "testarchera" }), { ...ctx, selectedId: "" }), "a");
  assert.equal(archerOf(labels({ athlete: "Someone Else" }), ctx), "a");
  assert.equal(archerOf(labels({ athlete: "Someone Else" }), { ...ctx, selectedId: "" }), "");
});

test("a review keeps the verdict, faults, hold time and linked arrow, not the frame data", () => {
  const r = reviewFromLabels(labels({ shot: { session_id: "S1", end: 2, arrow: 3, score: "9", x: 0.1 }, points: { head: {} }, motion: [1, 2] }), ctx);
  assert.deepEqual([r.id, r.athleteId, r.date, r.verdict, r.holdS, r.phasesMarked], [labels().clip, "b", "2026-11-07", "fault", 2.85, 2]);
  assert.deepEqual(r.shot, { session_id: "S1", end: 2, arrow: 3, score: "9" });
  assert.equal("points" in r || "motion" in r, false);
});

test("hold time needs both anchor and release", () => {
  assert.equal(reviewFromLabels(labels({ phases: [{ key: "anchor", start_s: 4 }] }), ctx).holdS, null);
});

test("review facts count clips, faults and the most common fault for one archer", () => {
  const mk = (id, athleteId, verdict, faults, holdS, savedAt) => ({ id, athleteId, verdict, faults, holdS, savedAt });
  const all = [
    mk("1", "a", "fault", ["Plucked release", "Head moved"], 2, "2026-11-10"),
    mk("2", "a", "fault", ["Plucked release"], 3, "2026-11-12"),
    mk("3", "a", "good", [], null, "2026-11-11"),
    mk("4", "b", "fault", ["Short draw"], 1, "2026-11-13"),
  ];
  const f = reviewFacts(all, "a");
  assert.deepEqual([f.count, f.faulty, f.topFault, f.avgHold, f.last.id], [3, 2, { name: "Plucked release", count: 2 }, 2.5, "2"]);
  assert.deepEqual([reviewFacts(all, "c").count, reviewFacts(all, "c").topFault], [0, null]);
});
