// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { athleteFacts, roster, ringOf, arrowAvg } from "./insights.js";

const now = new Date(2026, 10, 12); // 12 November 2026
const day = (n) => { const d = new Date(now - n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const A = { id: "a", name: "Test Archer A" }, B = { id: "b", name: "Test Archer B" }, C = { id: "c", name: "Test Archer C" };
const empty = { sessions: [], assessments: [], goals: [] };
const kinds = (f) => f.reasons.map((r) => r.kind);

test("an archer with no sessions needs a first one", () => {
  assert.deepEqual(kinds(athleteFacts(A, empty, now)), ["none"]);
});

test("14 days without a session is flagged; 13 is not", () => {
  const at = (n) => athleteFacts(A, { ...empty, sessions: [{ athleteId: "a", date: day(n) }] }, now);
  assert.deepEqual(kinds(at(13)), []);
  assert.deepEqual([kinds(at(14)), at(14).reasons[0].days], [["idle"], 14]);
});

test("a falling rubric, an overdue goal and a falling arrow average are each flagged", () => {
  const f = athleteFacts(A, {
    sessions: [
      { athleteId: "a", date: day(1), arrows: "72", score: "540" },  // 7.50
      { athleteId: "a", date: day(8), arrows: "72", score: "598" },  // 8.31
    ],
    assessments: [{ athleteId: "a", date: day(2), scores: { x: 3, y: 2 } }, { athleteId: "a", date: day(30), scores: { x: 4, y: 3 } }],
    goals: [{ athleteId: "a", name: "Hold 3 s", dueDate: day(3) }, { athleteId: "a", name: "Done", dueDate: day(9), completed: true }],
  }, now);
  assert.deepEqual(kinds(f), ["rubric", "goal", "score"]);
  assert.deepEqual([f.rubric, f.prevRubric, f.trend, f.rubricTrend, f.overdue.length], [2.5, 3.5, "down", "down", 1]);
});

test("small moves are not flagged, and a session without arrows has no average", () => {
  const f = athleteFacts(A, {
    ...empty,
    sessions: [{ athleteId: "a", date: day(1), arrows: "72", score: "590" }, { athleteId: "a", date: day(5), arrows: "72", score: "598" }, { athleteId: "a", date: day(6), type: "Physical" }],
  }, now);
  assert.deepEqual([kinds(f), f.trend, f.sessions30, f.arrows30], [[], "down", 3, 144]);
  assert.equal(arrowAvg({ score: "", arrows: "72" }), null);
});

test("the last plotted end comes from the newest range session", () => {
  const range = { ends: [{ arrows: [{ score: "X" }, { score: "9" }] }, { arrows: [{ score: "8" }, { score: "M" }] }, { arrows: [] }] };
  const f = athleteFacts(A, { ...empty, sessions: [{ athleteId: "a", date: day(2), range }, { athleteId: "a", date: day(1) }] }, now);
  assert.deepEqual([f.lastEnd, f.lastEndDate], [["8", "M"], day(2)]);
});

test("the roster puts the longest wait first, then the most recent on-track archer", () => {
  const data = { ...empty, sessions: [{ athleteId: "a", date: day(20) }, { athleteId: "b", date: day(3) }, { athleteId: "c", date: day(1) }] };
  const r = roster([A, B, C, { id: "d", name: "Test Archer D" }], data, now);
  assert.deepEqual(r.need.map((f) => f.athlete.id), ["d", "a"]);
  assert.deepEqual(r.onTrack.map((f) => f.athlete.id), ["c", "b"]);
});

test("arrow values map to the target's colours", () => {
  assert.deepEqual(["X", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "M"].map(ringOf),
    ["gold", "gold", "gold", "red", "red", "blue", "blue", "black", "black", "white", "white", "white"]);
});
