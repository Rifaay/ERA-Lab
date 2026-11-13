// Runs the real migration on an in-process Postgres and tries to reach another coach's data. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";

const db = new PGlite();
// Minimal stand-in for what Supabase provides: its roles, auth.users and auth.uid() reading the login token.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create schema auth; grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
`);
for (const m of ["0001_records.sql", "0002_reviews_and_ping.sql"]) await db.exec(readFileSync(new URL(`./migrations/${m}`, import.meta.url), "utf8"));

// Every test starts from an empty table with both coaches present, even if an earlier one failed midway.
test.beforeEach(() => db.exec(`delete from records; insert into auth.users values ('${A}'), ('${B}') on conflict do nothing`));

// Each call runs as the given visitor and is rolled back, so tests can't leak into each other.
const as = async (who, sql, params) => {
  try {
    await db.exec("begin");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [who ? JSON.stringify({ sub: who }) : ""]);
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
