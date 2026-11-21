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
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
`);
// …and for 0006: the Vault, pg_net (each call is recorded in net.calls instead of sent) and pg_cron.
await db.exec(`
  create role service_role nologin; grant usage on schema public to service_role;
  create schema extensions; create function extensions.gen_random_bytes(int) returns bytea language sql as $$ select decode(repeat('ab', $1), 'hex') $$;
  create schema vault; create table vault.decrypted_secrets (name text, decrypted_secret text);
  create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$ insert into vault.decrypted_secrets values (n, s); select gen_random_uuid() $$;
  create schema net; create table net.calls (url text, headers jsonb, body jsonb);
  create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ insert into net.calls values (url, headers, body); select 1::bigint $$;
  create schema cron; create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ select 1::bigint $$;
`);
for (const m of ["0001_records.sql", "0002_reviews_and_ping.sql", "0003_require_second_step.sql", "0004_archers.sql", "0005_roles.sql", "0006_push.sql"])
  await db.exec(readFileSync(new URL(`./migrations/${m}`, import.meta.url), "utf8").replace(/^create extension .*$/gm, ""));

// Every test starts from an empty table with both coaches present, even if an earlier one failed midway.
test.beforeEach(() => db.exec(`delete from net.calls; delete from push_subs; delete from shared_plans; delete from archer_sessions; delete from invites; delete from records; insert into auth.users values ('${A}', null), ('${B}', '{"role":"coach"}'), ('${R}', '{"role":"archer"}'), ('${R2}', '{"role":"archer"}') on conflict do nothing`));

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
  await assert.rejects(claim(A), /archers only/, "a coach's account can't join");
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

// ── Roles ───────────────────────────────────────────────────────────────────────────────────────────────
test("the role is set once at sign-up and its owner can't change it", async () => {
  assert.deepEqual((await as(R, "select role from profiles", [], "aal1")).rows, [{ role: "archer" }], "sees only their own");
  assert.equal((await as(A, "select public.my_role() as r")).rows[0].r, "coach", "no role chosen: coach");
  await assert.rejects(as(R, `update profiles set role = 'coach'`, [], "aal1"), /permission denied/);
  await assert.rejects(as(R, `insert into profiles values ('${R}', 'coach')`, [], "aal1"), /permission denied/);
  await db.exec(`update auth.users set raw_user_meta_data = '{"role":"coach"}' where id = '${R}'`); // the owner edits the note on their account
  assert.equal((await as(R, "select public.my_role() as r", [], "aal1")).rows[0].r, "archer", "nothing changes");
});

test("an archer's account can't act as a coach, even with both sign-in steps; a coach's can't upload as an archer", async () => {
  await assert.rejects(as(R, insertAthlete), /row-level security/, "keep records");
  await assert.rejects(as(R, `insert into invites (code, athlete_id, name) values ('ABCDEFGH', 'a1', 'Sam')`), /row-level security/, "make invites");
  await invite(); await link();
  await db.query(`insert into archer_sessions (archer_id, session_id, coach_id, athlete_id, data) values ($1, 's9', $2, 'a1', '{}')`, [R2, R]);
  assert.equal((await as(R, "select * from archer_sessions where session_id = 's9'")).rows.length, 0, "read another archer's sessions as their coach");
  await db.exec(`update invites set claimed_by = '${B}' where code = 'ABCDEFGH'`); // a coach account wrongly holding a link
  await assert.rejects(upload(B), /row-level security/);
});

// ── Notifications ───────────────────────────────────────────────────────────────────────────────────────
const P256 = "B".repeat(87), AUTHK = "a".repeat(22);
const phone = (who, prefs = "{}") => db.query(`insert into push_subs (user_id, endpoint, p256dh, auth, prefs) values ($1, $2, $3, $4, $5)`, [who, `https://push.example/${who}`, P256, AUTHK, prefs]);
const calls = async () => (await db.query("select body from net.calls")).rows.map((r) => r.body);

test("each account sees and changes only its own phones; push keys and the secret check are out of reach", async () => {
  await phone(A);
  const mine = `insert into push_subs (endpoint, p256dh, auth) values ('https://push.example/r', '${P256}', '${AUTHK}') returning user_id`;
  assert.equal((await as(R, mine, [], "aal1")).rows[0].user_id, R, "an archer signs up a phone without the second step");
  assert.equal((await as(B, "select * from push_subs")).rows.length, 0);
  assert.equal((await as(B, "delete from push_subs")).affectedRows, 0);
  await assert.rejects(as(B, `insert into push_subs (user_id, endpoint, p256dh, auth) values ('${A}', 'https://x', '${P256}', '${AUTHK}')`), /row-level security/);
  await assert.rejects(as(null, "select * from push_subs"), /permission denied/);
  await assert.rejects(as(A, "select * from push_keys"), /permission denied/);
  await assert.rejects(as(A, "select public.notify_secret_ok('x')"), /permission denied/);
  await assert.rejects(as(A, "select public.push_notify('joined', null, '{}')"), /permission denied/);
});

test("the coach hears when an archer joins, starts and finishes; nothing is sent to an account with no phone", async () => {
  await invite(); await link();
  assert.deepEqual(await calls(), [], "no phone signed up: no call");
  await db.exec(`update invites set claimed_by = null`); await phone(A); await link();
  const send = (sql) => db.query(sql, [R, A]);
  await send(`insert into archer_sessions (archer_id, session_id, coach_id, athlete_id, data) values ($1, 's1', $2, 'a1', '{"context":{"distance_m":70},"ends":[]}')`);
  await send(`update archer_sessions set data = '{"context":{"distance_m":70},"ends":[{"arrows":[{"score":"X"},{"score":"9"}]}]}' where archer_id = $1 and coach_id = $2`);
  await send(`update archer_sessions set data = '{"end_ms":5,"context":{"distance_m":70},"ends":[{"arrows":[{"score":"X"},{"score":"9"},{"score":"M"},{"score":"bad"},{"score":null}]},{"arrows":"oops"}]}' where archer_id = $1 and coach_id = $2`);
  await send(`update archer_sessions set data = data || '{"coach_notes":"x"}' where archer_id = $1 and coach_id = $2`);
  assert.deepEqual((await calls()).map((b) => [b.kind, b.to, b.args]), [
    ["joined", A, { name: "Sam" }],
    ["started", A, { name: "Sam", dist: 70 }],
    ["finished", A, { name: "Sam", dist: 70, arrows: 4, total: 19 }],
  ], "one call each, a strange score counts as a miss and never stops the upload");
  const h = (await db.query("select headers from net.calls limit 1")).rows[0].headers;
  assert.equal((await db.query("select public.notify_secret_ok($1) as ok", [h["x-notify-secret"]])).rows[0].ok, true, "the call carries the secret");
  assert.equal((await db.query("select public.notify_secret_ok('nope') as ok")).rows[0].ok, false);
});

test("a coach sends a season plan only to the archer linked to that profile; only that archer reads it", async () => {
  await invite(); await link(); await phone(R, '{"plan":true}');
  const sendPlan = (who, archer, athlete = "a1", aal = "aal2") => as(who, `insert into shared_plans (athlete_id, archer_id, year, data) values ($1, $2, 2027, '{"days":{}}')`, [athlete, archer], aal);
  await assert.rejects(sendPlan(A, R2), /row-level security/, "an archer who isn't linked");
  await assert.rejects(sendPlan(A, R, "a2"), /row-level security/, "another profile");
  await assert.rejects(sendPlan(B, R), /row-level security/, "another coach");
  await assert.rejects(sendPlan(A, R, "a1", "aal1"), /row-level security/, "without the second step");
  await assert.rejects(sendPlan(R, R), /row-level security/, "an archer's own account");
  await db.query(`insert into shared_plans (coach_id, athlete_id, archer_id, year, data) values ($1, 'a1', $2, 2027, '{"days":{}}')`, [A, R]);
  assert.equal((await as(R, "select year from shared_plans", [], "aal1")).rows.length, 1);
  assert.equal((await as(R2, "select year from shared_plans", [], "aal1")).rows.length, 0);
  assert.deepEqual((await calls()).at(-1), { kind: "plan", to: R, args: { year: 2027 } });
  await db.exec("delete from invites");
  assert.equal((await as(R, "select year from shared_plans", [], "aal1")).rows.length, 0, "unlinked: the plan is gone from the archer's view");
});
