// Runs the real migration on an in-process Postgres and tries to reach another coach's data. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const R = "00000000-0000-0000-0000-0000000000c1"; // an archer
const R2 = "00000000-0000-0000-0000-0000000000c2"; // another archer

const db = new PGlite();
// Minimal stand-in for what Supabase provides: its roles, auth.users and auth.uid() reading the login token.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create schema auth; grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
`);
for (const m of ["0001_records.sql", "0002_reviews_and_ping.sql", "0003_require_second_step.sql", "0004_archers.sql"]) await db.exec(readFileSync(new URL(`./migrations/${m}`, import.meta.url), "utf8"));

// Every test starts from an empty table with both coaches present, even if an earlier one failed midway.
test.beforeEach(() => db.exec(`delete from archer_sessions; delete from invites; delete from records; insert into auth.users values ('${A}'), ('${B}'), ('${R}'), ('${R2}') on conflict do nothing`));

// Each call runs as the given visitor and is rolled back, so tests can't leak into each other.
const as = async (who, sql, params, aal = "aal2") => {
  try {
    await db.exec("begin");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [who ? JSON.stringify({ sub: who, aal }) : ""]);
    await db.exec(`set local role ${who ? "authenticated" : "anon"}`);
    return await db.query(sql, params);
  } finally {
    await db.exec("rollback");
  }
};
const seed = (coach) => db.query(`insert into records (coach_id, kind, id, data) values ($1, 'athletes', 'a1', '{"name":"Ali"}')`, [coach]);
const insertAthlete = `insert into records (kind, id, data) values ('athletes', 'x', '{"name":"Ali"}') returning coach_id`;

test("a coach's insert is stamped with their own id", async () => {
  const r = await as(A, insertAthlete);
  assert.equal(r.rows[0].coach_id, A);
});

test("another coach can't see, change or delete it", async () => {
  await seed(A);
  assert.equal((await as(A, "select * from records")).rows.length, 1);
  assert.equal((await as(B, "select * from records")).rows.length, 0);
  assert.equal((await as(B, `update records set data = '{"name":"x"}'`)).affectedRows, 0);
  assert.equal((await as(B, "delete from records")).affectedRows, 0);
});

test("a coach can't write rows into another coach's account", async () => {
  await assert.rejects(as(B, `insert into records (coach_id, kind, id, data) values ('${A}', 'athletes', 'y', '{}')`), /row-level security/);
});

test("a coach can't move their row into another account", async () => {
  await seed(A);
  await assert.rejects(as(A, `update records set coach_id = '${B}'`), /row-level security/);
});

test("logged-out visitors are refused outright", async () => {
  await assert.rejects(as(null, "select * from records"), /permission denied/);
  await assert.rejects(as(null, insertAthlete), /permission denied/);
});

test("bad records are rejected by the database", async () => {
  const bad = [
    `('nonsense', 'x', '{}')`,                                // unknown kind
    `('athletes', '', '{}')`,                                 // empty id
    `('athletes', 'x', '[1]')`,                               // not an object
    `('athletes', 'x', '{"a":"${"x".repeat(1_000_001)}"}')`,  // over 1 MB
  ];
  for (const v of bad) await assert.rejects(as(A, `insert into records (kind, id, data) values ${v}`), /violates check constraint/);
});

test("review records are accepted; ping is the only thing logged-out visitors may run", async () => {
  await as(A, `insert into records (kind, id, data) values ('reviews', 'clip.mp4', '{}')`);
  assert.equal((await as(null, "select public.ping() as p")).rows[0].p, 1);
});

test("deleting the account erases its data", async () => {
  await seed(A);
  await db.query(`delete from auth.users where id = $1`, [A]);
  assert.equal((await db.query("select * from records")).rows.length, 0);
});

test("a password-only sign-in (no authenticator code) reaches nothing", async () => {
  await seed(A);
  assert.equal((await as(A, "select * from records", [], "aal1")).rows.length, 0);
  await assert.rejects(as(A, insertAthlete, [], "aal1"), /row-level security/);
});

// ── Archers ─────────────────────────────────────────────────────────────────────────────────────────────
const invite = (coach = A) => db.query(`insert into invites (code, coach_id, athlete_id, name) values ('ABCDEFGH', $1, 'a1', 'Sam')`, [coach]);
const claim = (who, code = "abcdefgh") => as(who, "select * from claim_invite($1)", [code], "aal1");
// as() rolls back, so a claim that must last is written directly.
const link = () => db.exec(`update invites set claimed_by = '${R}' where code = 'ABCDEFGH'`);
const upload = (who, coach = A, athlete = "a1") => as(who, `insert into archer_sessions (session_id, coach_id, athlete_id, data) values ('s1', $1, $2, '{"ends":[]}')`, [coach, athlete], "aal1");

test("an invite is made by a coach with both sign-in steps, and can't be pre-claimed", async () => {
  const make = `insert into invites (code, athlete_id, name) values ('ABCDEFGH', 'a1', 'Sam')`;
  await assert.rejects(as(A, make, [], "aal1"), /row-level security/);
  await as(A, make);
  await assert.rejects(as(A, `insert into invites (code, athlete_id, name, claimed_by) values ('ABCDEFGJ', 'a2', 'Kim', '${R}')`), /row-level security/);
  await assert.rejects(as(A, `insert into invites (code, athlete_id, name) values ('abc', 'a3', 'Lee')`), /violates check constraint/);
});

test("an archer claims with the code (any letter case), once; strangers can't read or guess invites", async () => {
  await invite();
  assert.equal((await as(R, "select * from invites", [], "aal1")).rows.length, 0, "unclaimed invites are invisible to archers");
  assert.equal((await claim(R, "WRONGCDE")).rows.length, 0);
  assert.deepEqual((await claim(R)).rows[0], { coach_id: A, athlete_id: "a1", name: "Sam" });
  await link();
  assert.equal((await claim(R2)).rows.length, 0, "a used code is dead");
  assert.equal((await as(R, "select * from invites", [], "aal1")).rows.length, 1);
  assert.equal((await as(R2, "select * from invites", [], "aal1")).rows.length, 0);
  await assert.rejects(claim(null), /permission denied/);
});

test("an expired code, or a coach's own code, can't be claimed; a linked archer can't take a second coach", async () => {
  await invite();
  assert.equal((await claim(A)).rows.length, 0, "own code");
  await db.exec(`update invites set expires_at = now() - interval '1 minute'`);
  assert.equal((await claim(R)).rows.length, 0, "expired");
  await db.exec(`update invites set expires_at = now() + interval '1 day'`);
  await link();
  await db.query(`insert into invites (code, coach_id, athlete_id, name) values ('ZZZZZZZZ', $1, 'b1', 'Sam')`, [B]);
  await assert.rejects(claim(R, "ZZZZZZZZ"), /already linked/);
});

test("a linked archer uploads only for their own coach and profile; only that coach reads it, with both steps", async () => {
  await invite(); await link();
  await assert.rejects(upload(R2), /row-level security/, "not linked");
  await assert.rejects(upload(R, B), /row-level security/, "another coach");
  await assert.rejects(upload(R, A, "a2"), /row-level security/, "another profile");
  await upload(R);
  await db.query(`insert into archer_sessions (archer_id, session_id, coach_id, athlete_id, data) values ($1, 's1', $2, 'a1', '{"ends":[]}')`, [R, A]);
  assert.equal((await as(A, "select * from archer_sessions")).rows.length, 1);
  assert.equal((await as(A, "select * from archer_sessions", [], "aal1")).rows.length, 0, "coach without the second step");
  assert.equal((await as(B, "select * from archer_sessions")).rows.length, 0);
  assert.equal((await as(R2, "select * from archer_sessions", [], "aal1")).rows.length, 0);
  assert.equal((await as(A, `update archer_sessions set data = '{"x":1}'`)).affectedRows, 0, "the coach can't rewrite an archer's session");
  await assert.rejects(as(null, "select * from archer_sessions"), /permission denied/);
});

test("when the coach removes the link, the archer can no longer upload", async () => {
  await invite(); await link();
  await db.exec("delete from invites");
  await assert.rejects(upload(R), /row-level security/);
});
