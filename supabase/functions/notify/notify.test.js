import test from "node:test";
import assert from "node:assert/strict";
import { encrypt, vapidHeader, newVapidKeys, b64u, unb64u, send } from "./webpush.js";
import { message, dueReminders, localNow } from "./messages.js";

const S = crypto.subtle, te = new TextEncoder();
const hkdf = async (salt, ikm, info, n) => new Uint8Array(await S.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await S.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), n * 8));

// The browser's side of RFC 8291, written out separately so a mistake in encrypt() can't cancel itself out.
// (Checked once against the reference http_ece library too.)
const browserDecrypt = async (body, ua, auth) => {
  const salt = body.slice(0, 16), idlen = body[20], as = body.slice(21, 21 + idlen), uaPub = new Uint8Array(await S.exportKey("raw", ua.publicKey));
  const shared = new Uint8Array(await S.deriveBits({ name: "ECDH", public: await S.importKey("raw", as, { name: "ECDH", namedCurve: "P-256" }, false, []) }, ua.privateKey, 256));
  const ikm = await hkdf(auth, shared, new Uint8Array([...te.encode("WebPush: info\0"), ...uaPub, ...as]), 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16), nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const plain = new Uint8Array(await S.decrypt({ name: "AES-GCM", iv: nonce }, await S.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), body.slice(21 + idlen)));
  assert.equal(plain.at(-1), 2, "last-record delimiter");
  return new TextDecoder().decode(plain.slice(0, -1));
};

test("a message encrypted for a browser opens with that browser's keys", async () => {
  const ua = await S.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]), auth = crypto.getRandomValues(new Uint8Array(16));
  const sub = { endpoint: "https://web.push.apple.com/abc", keys: { p256dh: b64u(await S.exportKey("raw", ua.publicKey)), auth: b64u(auth) } };
  const body = await encrypt(sub, '{"title":"تدريب اليوم"}');
  assert.equal(new DataView(body.buffer).getUint32(16), 4096);
  assert.equal(await browserDecrypt(body, ua, auth), '{"title":"تدريب اليوم"}');
});

test("the VAPID header is a valid ES256 token for the push service's origin", async () => {
  const keys = await newVapidKeys();
  const h = await vapidHeader("https://fcm.googleapis.com/fcm/send/x", keys, "https://rifaay.github.io/ERA-Lab/", 1_000_000_000_000);
  const [, t, k] = h.match(/^vapid t=(\S+), k=(\S+)$/), [a, b, sig] = t.split(".");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(unb64u(b))), { aud: "https://fcm.googleapis.com", exp: 1_000_000_000 + 43200, sub: "https://rifaay.github.io/ERA-Lab/" });
  const pub = await S.importKey("raw", unb64u(k), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.ok(await S.verify({ name: "ECDSA", hash: "SHA-256" }, pub, unb64u(sig), te.encode(`${a}.${b}`)));
});

test("send posts the encrypted body with the push headers and reports the status", async () => {
  const ua = await S.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const sub = { endpoint: "https://push.example/1", keys: { p256dh: b64u(await S.exportKey("raw", ua.publicKey)), auth: b64u(new Uint8Array(16)) } };
  let seen;
  const status = await send(sub, { title: "x" }, await newVapidKeys(), "https://e.x", async (url, init) => { seen = { url, init }; return { status: 410 }; });
  assert.equal(status, 410);
  assert.equal(seen.url, sub.endpoint);
  assert.equal(seen.init.headers["Content-Encoding"], "aes128gcm");
  assert.match(seen.init.headers.Authorization, /^vapid t=/);
});

test("messages read naturally in both languages", () => {
  assert.deepEqual(message("finished", { name: "Sam", dist: 70, arrows: 36, total: 312 }), { title: "Sam finished", body: "312 / 360 from 36 arrows at 70 m", tag: "era-finished-Sam" });
  assert.equal(message("joined", { name: "سام" }, "ar").body, "انضم سام عبر دعوتك");
  assert.equal(message("started", {}).title, "– is shooting", "no name: a dash, never 'undefined'");
  assert.equal(message("plan", { year: 2027 }, "xx").title, "New season plan", "unknown language falls back to English");
});

test("a training reminder goes at 07:00 on the archer's phone, only on a planned day", () => {
  const at = new Date("2027-03-10T05:00:00Z"); // 07:00 in Cairo (UTC+2), 05:00 in London
  const plans = [{ archer_id: "r1", year: 2027, data: { days: { "2027-03-10": { focus: "Back tension", arrows: 90 } } } }, { archer_id: "r2", year: 2027, data: { days: {} } }];
  const sub = (user_id, tz, lang = "en") => ({ user_id, tz, lang, endpoint: `https://p/${user_id}${tz}` });
  const due = dueReminders([sub("r1", "Africa/Cairo"), sub("r1", "Europe/London"), sub("r2", "Africa/Cairo"), sub("r1", "Not/AZone"), sub("r3", "Africa/Cairo")], plans, at);
  assert.deepEqual(due.map((d) => [d.sub.tz, d.msg.body]), [["Africa/Cairo", "Back tension · 90 arrows"]]);
  assert.equal(dueReminders([sub("r1", "Africa/Cairo", "ar")], [{ ...plans[0], data: { days: { "2027-03-10": { note: "x" } } } }], at)[0].msg.body, "خطط مدربك لتدريب اليوم");
  assert.deepEqual(localNow("Africa/Cairo", at), { iso: "2027-03-10", year: 2027, hour: 7 });
});
