// Two devices syncing through a stand-in for Supabase's records table. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";

let mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = { alert: () => {} };

const { plan, isAdult, shareable, syncNow } = await import("./sync.js");
const st = await import("./storage.js");

// The cloud: rows keyed "kind/id", answering the three requests sync.js makes.
const cloud = new Map();
const q = (url) => Object.fromEntries(new URL("http://x" + url).searchParams);
const fakeFetch = async (url, { method, body }) => {
  const p = q(url);
  let out = "";
  if (method === "GET") {
    const rows = [...cloud.values()].sort((a, b) => (a.kind + a.id).localeCompare(b.kind + b.id));
    out = JSON.stringify(rows.slice(+p.offset, +p.offset + +p.limit));
  } else if (method === "POST") for (const r of JSON.parse(body)) cloud.set(`${r.kind}/${r.id}`, structuredClone(r));
  else if (method === "DELETE") cloud.delete(`${p.kind.slice(3)}/${p.id.slice(3)}`);
  return { ok: true, status: 200, text: async () => out };
};

const devices = { phone: new Map(), desktop: new Map() };
const on = (name) => {
  mem = devices[name];
  if (!mem.has("racm_auth")) mem.set("racm_auth", JSON.stringify({ email: "c@x", token: "t", refresh: "r", expires: Date.now() + 3.6e6 }));
};
const today = new Date("2026-11-13");
const sync = () => syncNow(fakeFetch, today);
const adult = { id: "a1", name: "Adult Archer", dob: "1990-05-01" };
const child = { id: "c1", name: "Young Archer", dob: "2012-05-01" };

test("plan: one-sided changes travel, both-sided changes keep this device's and flag a conflict", () => {
  const h = (x) => plan({ x }, { x }, {}).next.x; // hash of a record
  const v1 = { id: "x", n: 1 }, v2 = { id: "x", n: 2 }, v3 = { id: "x", n: 3 };
  assert.deepEqual(plan({ x: v2 }, { x: v1 }, { x: h(v1) }).push, ["x"]);       // changed here
  assert.deepEqual(plan({ x: v1 }, { x: v2 }, { x: h(v1) }).take, ["x"]);       // changed in the cloud
  assert.deepEqual(plan({}, { x: v1 }, { x: h(v1) }).drop, ["x"]);              // deleted here
  assert.deepEqual(plan({ x: v1 }, {}, { x: h(v1) }).remove, ["x"]);            // deleted in the cloud
  assert.deepEqual(plan({ x: v1 }, {}, {}).push, ["x"]);                        // new here
  const c = plan({ x: v2 }, { x: v3 }, { x: h(v1) });
  assert.deepEqual([c.push, c.conflicts], [["x"], ["x"]]);
});

test("under-18s and athletes with no birth date stay on the device, with everything about them", () => {
  assert.equal(isAdult("2008-11-13", today), true);
  assert.equal(isAdult("2008-11-14", today), false);
  assert.equal(isAdult("", today), false);
  const lists = {
    athletes: [adult, child, { id: "n1", name: "No Date" }],
    sessions: [{ id: "s1", athleteId: "a1" }, { id: "s2", athleteId: "c1" }],
    goals: [{ id: "g1", athleteId: "c1" }], progressLogs: [{ id: "p1", goalId: "g1" }], checkIns: [],
    assessments: [], plans: [], exercises: [{ id: "e1" }], goalTemplates: [], reviews: [{ id: "clip.mp4", athleteId: "c1" }],
    settings: { coachName: "Coach" },
  };
  const s = shareable(lists, today);
  assert.deepEqual(Object.keys(s.athletes), ["a1"]);
  assert.deepEqual(Object.keys(s.sessions), ["s1"]);
  assert.deepEqual([s.goals, s.progressLogs, s.reviews], [{}, {}, {}]);
  assert.deepEqual(Object.keys(s.exercises), ["e1"]);
  assert.equal(s.settings.main.coachName, "Coach");
});

test("the emailed sign-in link signs in and is wiped from the address", async () => {
  const { finishLinkSignIn } = await import("./sync.js");
  mem = new Map();
  const replaced = [];
  globalThis.history = { replaceState: (_, __, url) => replaced.push(url) };
  globalThis.location = { href: "https://x.test/ERA-Lab/#access_token=AT&refresh_token=RT&expires_in=3600&type=magiclink", hash: "#access_token=AT&refresh_token=RT&expires_in=3600&type=magiclink" };
  globalThis.fetch = async (url, { headers }) => ({ ok: headers.Authorization === "Bearer AT", status: 200, text: async () => JSON.stringify({ id: "u1", email: "c@x" }) });
  assert.equal(await finishLinkSignIn(), true);
  assert.deepEqual(replaced, ["https://x.test/ERA-Lab/"]);
  assert.equal(JSON.parse(mem.get("racm_auth")).refresh, "RT");
  globalThis.location = { href: "https://x.test/ERA-Lab/", hash: "" };
  assert.equal(await finishLinkSignIn(), false, "an ordinary visit does nothing");
});

test("two devices: adds, deletions and conflicts carry over; children never reach the cloud", async () => {
  on("phone");
  st.saveAthlete(adult); st.saveAthlete(child);
  st.saveSession({ id: "s1", athleteId: "a1", score: 50 });
  st.saveSession({ id: "s2", athleteId: "c1", score: 40 });
  await sync();
  assert.deepEqual([...cloud.keys()].sort(), ["athletes/a1", "sessions/s1", "settings/main"]);

  on("desktop");
  await sync();
  assert.deepEqual(st.getAthletes().map((a) => a.id), ["a1"]);
  assert.deepEqual(st.getSessions().map((s) => s.id), ["s1"]);

  st.deleteSession("s1");
  await sync();
  on("phone");
  await sync();
  assert.deepEqual(st.getSessions().map((s) => s.id), ["s2"], "deleted on the desktop, gone on the phone; the child's session stays");

  // Both change the same athlete: the device that syncs last keeps its version, the other is set aside.
  st.saveAthlete({ ...adult, notes: "phone" });
  await sync();
  on("desktop");
  st.saveAthlete({ ...adult, notes: "desktop" });
  const r = await sync();
  assert.equal(r.conflicts, 1);
  assert.equal(cloud.get("athletes/a1").data.notes, "desktop");
  assert.equal(JSON.parse(mem.get("racm_sync_conflicts"))[0].data.notes, "phone");

  // A birth date corrected to under 18 replaces the athlete in the cloud with a stub holding only the id.
  st.saveAthlete({ ...adult, dob: "2015-01-01" });
  await sync();
  assert.deepEqual(cloud.get("athletes/a1").data, { id: "a1", private: true });
  on("phone");
  await sync();
  await sync();
  assert.deepEqual(st.getAthletes().map((a) => a.id).sort(), ["a1", "c1"], "the phone keeps its copy");
  assert.deepEqual(cloud.get("athletes/a1").data, { id: "a1", private: true }, "and never uploads it again");});

test("password rules: long enough, not the email, not a common word", async () => {
  const { passwordProblem } = await import("./sync.js");
  assert.equal(passwordProblem("short1!"), "short");
  assert.equal(passwordProblem("coach.ahmed-2026", "coach.ahmed@x.com"), "email");
  assert.equal(passwordProblem("MyArcheryPass99"), "common");
  assert.equal(passwordProblem("aaaaaaaaaaaaaa"), "common");
  assert.equal(passwordProblem("river-tent-oak-42"), "");
});

test("only a token that passed both sign-in steps counts as signed in", async () => {
  const { signedIn, verifyApp } = await import("./sync.js");
  const jwt = (aal) => `h.${btoa(JSON.stringify({ aal }))}.s`;
  mem = new Map();
  mem.set("racm_auth", JSON.stringify({ email: "c@x", token: jwt("aal1"), refresh: "r", expires: Date.now() + 3.6e6, aal: "aal1" }));
  assert.equal(signedIn(), false);
  globalThis.fetch = async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(url.endsWith("/challenge") ? { id: "ch" } : { access_token: jwt("aal2"), refresh_token: "r2", expires_in: 3600, user: { id: "u1", email: "c@x" } }) });
  await verifyApp("f1", "123456");
  assert.equal(signedIn(), true);
});

test("a session ended elsewhere signs this device out; being offline does not", async () => {
  const { syncNow, account } = await import("./sync.js");
  const old = () => mem.set("racm_auth", JSON.stringify({ email: "c@x", token: "t", refresh: "r", expires: 0, aal: "aal2" }));
  mem = new Map(); old();
  await assert.rejects(syncNow(async () => { throw new TypeError("offline"); }));
  assert.equal(account(), "c@x");
  await assert.rejects(syncNow(async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" }) })));
  assert.equal(account(), "");
});

test("the account's role comes from the server, not from the note the owner can edit", async () => {
  const { loadRole, role } = await import("./sync.js");
  const auth = () => mem.set("racm_auth", JSON.stringify({ email: "c@x", token: "t", refresh: "r", expires: Date.now() + 3.6e6, uid: "u1", role: "coach" }));
  mem = new Map(); auth();
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify([{ role: "archer" }]) });
  assert.equal(await loadRole(), "archer");
  auth();
  globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => "{}" });
  assert.equal(await loadRole(), "coach", "project without the roles table: the note is the fallback");
  assert.equal(role(), "coach");
});
