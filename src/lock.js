// Device lock: the app opens only after the coach's PIN, so a lost or borrowed phone doesn't show athletes' data.
// The PIN is never stored, only a slow salted hash of it (PBKDF2). Wrong guesses make the next try wait longer.
// shortcut: this locks the screen, it doesn't encrypt the stored data; someone with the browser's developer tools can
// still read it. Encrypt localStorage with a key from the PIN if the app ever holds data that needs that.
const KEY = "racm_lock"; // racm_ prefix: "Clear all data" removes the lock with the data it guards
const ITER = 310_000;
const get = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const put = (v) => localStorage.setItem(KEY, JSON.stringify(v));
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const derive = async (pin, salt, iter) => {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, k, 256));
};

// "٤٨٢" or "۴۸۲" → "482", everything else dropped: PINs and codes typed on an Arabic or Persian keyboard still work.
export const digits = (v, max) => [...String(v)].map((c) => { const i = "٠١٢٣٤٥٦٧٨٩".indexOf(c), j = "۰۱۲۳۴۵۶۷۸۹".indexOf(c); return i >= 0 ? i : j >= 0 ? j : c; }).join("").replace(/\D/g, "").slice(0, max);
export const LOCK_EVENT = "racm-lock";
export const lockNow = () => window.dispatchEvent(new Event(LOCK_EVENT));
export const canLock = () => Boolean(globalThis.crypto?.subtle);
export const hasPin = () => Boolean(get()?.hash);
export const pinOk = (pin) => /^\d{6,12}$/.test(pin) && !/^(\d)\1+$/.test(pin) && !"01234567890123".includes(pin) && !"98765432109876".includes(pin);
export const lockAfter = () => get()?.after ?? 5; // minutes away from the app before it locks again
export const setLockAfter = (m) => put({ ...get(), after: m });

export const setPin = async (pin) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  put({ salt: b64(salt), hash: await derive(pin, salt, ITER), iter: ITER, fails: 0, until: 0, after: lockAfter() });
};
export const removePin = () => localStorage.removeItem(KEY);

// {ok} on the right PIN; {wait: ms} while locked out after repeated wrong PINs.
export const checkPin = async (pin, now = Date.now()) => {
  const l = get();
  if (!l?.hash) return { ok: true };
  if (now < (l.until || 0)) return { ok: false, wait: l.until - now };
  const ok = (await derive(pin, unb64(l.salt), l.iter)) === l.hash;
  const fails = ok ? 0 : (l.fails || 0) + 1;
  const until = fails >= 5 ? now + Math.min(3_600_000, 30_000 * 2 ** (fails - 5)) : 0; // 30 s, 1 min, 2 min … up to 1 h
  put({ ...l, fails, until });
  return { ok, wait: until ? until - now : 0 };
};
