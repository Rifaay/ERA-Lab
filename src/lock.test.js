import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { setPin, checkPin, hasPin, pinOk, removePin } = await import("./lock.js");

test("PIN rules refuse short, repeated and counting PINs", () => {
  assert.equal(pinOk("483920"), true);
  for (const p of ["12345", "111111", "123456", "987654", "12a456"]) assert.equal(pinOk(p), false, p);
});

test("the right PIN opens; the PIN itself is never stored; wrong guesses lock out for longer each time", async () => {
  await setPin("483920");
  assert.equal(hasPin(), true);
  assert.ok(!mem.get("racm_lock").includes("483920"));
  assert.equal((await checkPin("483920", 0)).ok, true);
  for (let i = 0; i < 4; i++) assert.deepEqual(await checkPin("000001", 0), { ok: false, wait: 0 });
  assert.deepEqual(await checkPin("000001", 0), { ok: false, wait: 30_000 }, "5th wrong PIN: wait 30 s");
  assert.deepEqual(await checkPin("483920", 10_000), { ok: false, wait: 20_000 }, "even the right PIN waits");
  assert.equal((await checkPin("000001", 30_000)).wait, 60_000, "6th: 1 min");
  assert.equal((await checkPin("483920", 90_000)).ok, true);
  assert.deepEqual(await checkPin("000001", 90_000), { ok: false, wait: 0 }, "a right PIN resets the count");
  removePin();
  assert.equal(hasPin(), false);
});
