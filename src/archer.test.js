import test from "node:test";
import assert from "node:assert/strict";

let mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { newSession, record, finish } = await import("./range.js");
const A = await import("./archer.js");

const adult = { id: "a1", name: "Sam", dob: "1990-01-01" };
const shot = () => {
  const s = newSession({ athlete: adult, setup: { distance: "18", face: "40", perEnd: "3", type: "Technical" }, now: 1000 });
  record(s, 0, null, { x: 0.1, y: 0.1, score: "9" }, 2000);
  return s;
};
const signIn = () => mem.set("racm_auth", JSON.stringify({ email: "x@y", token: "t", refresh: "r", expires: Date.now() + 3.6e6, uid: "u1", aal: "aal2" }));

test("invite codes are 8 unambiguous characters; only adults can be invited", () => {
  for (let i = 0; i < 50; i++) assert.match(A.newCode(), /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(A.canInvite(adult), true);
  assert.equal(A.canInvite({ id: "c", name: "Kid", dob: "2015-01-01" }), false);
  assert.equal(A.canInvite({ id: "n", name: "No date" }), false);
});

test("a session from an archer's phone is rebuilt to the known shape and bound to the coach's own profile", () => {
  const s = shot();
  const evil = { ...s, athlete_id: "someone-else", athlete: "<img onerror=x>", extra: { big: "x".repeat(5000) }, context: { ...s.context, face: "999", distance_m: 1e9 } };
  evil.ends[0].arrows.push({ arrow: 9, score: "<b>", x: 55, y: "no", notes: "n".repeat(900), spot: 7 });
  const c = A.cleanSession(evil, adult);
  assert.equal(c.athlete_id, "a1"); assert.equal(c.athlete, "Sam"); assert.equal("extra" in c, false);
  assert.equal(c.context.face, "122"); assert.equal(c.context.distance_m, 150);
  assert.deepEqual([c.ends[0].arrows[0].score, c.ends[0].arrows[0].x], ["9", 0.1]);
  const bad = c.ends[0].arrows[1];
  assert.deepEqual([bad.score, bad.x, bad.y, bad.notes.length, bad.spot], [null, null, null, 300, 2]);
  for (const junk of [null, {}, { schema: "racm.session.v1" }, { ...s, ends: "x" }, { ...s, session_id: "" }]) assert.equal(A.cleanSession(junk, adult), null);
});

test("the archer's phone sends a session once, and again only after it changes", async () => {
  mem = new Map(); signIn();
  mem.set("racm_link", JSON.stringify({ coach_id: "c1", athlete_id: "a1", name: "Sam" }));
  const posts = [];
  globalThis.fetch = async (url, o) => { posts.push(JSON.parse(o.body)); return { ok: true, status: 201, text: async () => "" }; };
  const s = shot();
  assert.equal(A.waiting(s, []), 1);
  assert.equal(await A.uploadSessions(s, []), 1);
  assert.deepEqual([posts[0][0].coach_id, posts[0][0].athlete_id, posts[0][0].session_id], ["c1", "a1", s.session_id]);
  assert.equal(await A.uploadSessions(s, []), 0);
  record(s, 0, null, { x: 0, y: 0, score: "X" }, 9000);
  assert.equal(await A.uploadSessions(s, [{ range: { ...s, athlete_id: "not-me" } }]), 1, "only the changed session, never another archer's");
  mem.delete("racm_link");
  assert.equal(await A.uploadSessions(s, []), 0, "not linked: nothing leaves");
});

test("the coach's app shows unfinished sessions as live and copies each finished one once, for linked archers only", () => {
  mem = new Map();
  mem.set("racm_invites", JSON.stringify([{ code: "ABCDEFGH", athlete_id: "a1", claimed_by: "u9" }, { code: "ABCDEFGJ", athlete_id: "a2", claimed_by: null }]));
  const live = shot(), done = finish(shot(), "x").range;
  done.session_id = "done-1";
  const row = (data, athlete_id = "a1") => ({ session_id: data.session_id, athlete_id, data, updated_at: new Date().toISOString() });
  const athletes = [adult, { id: "a2", name: "Kim", dob: "1991-01-01" }];
  const rows = [row(live), row(done), row({ ...done, session_id: "done-2" }, "a2"), row({ ...done, session_id: "other" }, "zz")];
  assert.deepEqual(A.liveOf(rows, athletes).map((x) => x.athlete.name), ["Sam"]);
  assert.equal(A.liveOf([{ ...row(live), updated_at: new Date(Date.now() - 31 * 60_000).toISOString() }], athletes).length, 0, "stale");
  assert.deepEqual(A.finishedOf(rows, athletes).map((x) => x.session.session_id), ["done-1"], "finished today, linked archers only");
  assert.equal(A.finishedOf([{ ...row(done), updated_at: new Date(Date.now() - 13 * 3600_000).toISOString() }], athletes).length, 0, "yesterday's");
  const saved = [];
  const env = { athletes, sessions: saved, saveSession: (e) => saved.push(e) };
  assert.equal(A.importFinished(rows, env), 1);
  assert.deepEqual([saved[0].athleteId, saved[0].range.session_id, saved[0].score, saved[0].fromArcher], ["a1", "done-1", "9", true]);
  assert.equal(A.importFinished(rows, env), 0, "already there");
  const other = []; // the coach's second device copies the same session before the two have synced
  A.importFinished(rows, { ...env, sessions: other, saveSession: (e) => other.push(e) });
  assert.equal(other[0].id, saved[0].id, "the same id on both devices, so the sync keeps one record");
});

test("invite link: carries the code, and only a well-formed code is read back", () => {
  const url = A.inviteUrl("ABCD2345", { origin: "https://x.io", pathname: "/ERA-Lab/" });
  assert.equal(url, "https://x.io/ERA-Lab/?invite=ABCD2345");
  assert.equal(A.inviteFrom(new URL(url).search), "ABCD2345");
  assert.equal(A.inviteFrom("?invite=abcd2345"), "ABCD2345");     // typed in lower case
  assert.equal(A.inviteFrom("?invite=ABCD0O11"), "");             // 0, O, 1 are never used
  assert.equal(A.inviteFrom("?invite=<script>"), "");
  assert.equal(A.inviteFrom(""), "");
});
