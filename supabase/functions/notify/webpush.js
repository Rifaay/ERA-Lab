// Web push with nothing but WebCrypto, so the same file runs in the Supabase Edge Function (Deno) and in the tests
// (Node). Payload encryption is RFC 8291 (aes128gcm, RFC 8188); the sender proves who it is with VAPID (RFC 8292).
const te = new TextEncoder();
const S = crypto.subtle;

export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
const hkdf = async (salt, ikm, info, bytes) => new Uint8Array(await S.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await S.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bytes * 8));

// The server's signing key pair, made once and kept by the function. `publicKey` is what browsers subscribe with.
export const newVapidKeys = async () => {
  const k = await S.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { privateJwk: await S.exportKey("jwk", k.privateKey), publicKey: b64u(await S.exportKey("raw", k.publicKey)) };
};

// The message, encrypted for one browser subscription ({ endpoint, keys: { p256dh, auth } }).
export const encrypt = async (sub, text, { salt = crypto.getRandomValues(new Uint8Array(16)), local } = {}) => {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  local ||= await S.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const as = new Uint8Array(await S.exportKey("raw", local.publicKey));
  const shared = new Uint8Array(await S.deriveBits({ name: "ECDH", public: await S.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []) }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(te.encode("WebPush: info\0"), ua, as), 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const body = new Uint8Array(await S.encrypt({ name: "AES-GCM", iv: nonce }, await S.importKey("raw", cek, "AES-GCM", false, ["encrypt"]), cat(te.encode(text), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt); new DataView(head.buffer).setUint32(16, 4096); head[20] = as.length;
  return cat(head, as, body);
};

// Signed note saying this server sends to that push service, valid for 12 hours.
export const vapidHeader = async (endpoint, keys, subject, now = Date.now()) => {
  const enc = (o) => b64u(te.encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const key = await S.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await S.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(unsigned));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${keys.publicKey}`;
};

// Sends one notification. Returns the push service's status: 201 delivered, 404/410 the subscription is gone.
export const send = async (sub, message, keys, subject, f = fetch) => {
  const res = await f(sub.endpoint, {
    method: "POST",
    headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal", Authorization: await vapidHeader(sub.endpoint, keys, subject) },
    body: await encrypt(sub, JSON.stringify(message)),
  });
  return res.status;
};
