// Phone notifications (web push). This phone subscribes with the server's public key and leaves the subscription in
// push_subs, with which kinds it wants; the server (supabase/functions/notify) sends them. On iPhone this only works
// in the app opened from the Home Screen.
import { api, token, userId, role } from "./sync.js";
import { KINDS } from "../supabase/functions/notify/messages.js";

const PUSH = "racm_push";
const get = () => { try { return JSON.parse(localStorage.getItem(PUSH)); } catch { return null; } };
const rest = async (path, opt = {}) => api("/rest/v1/" + path, { ...opt, token: await token() });
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

export const kindsFor = (r = role()) => KINDS[r === "archer" ? "archer" : "coach"];
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
// iPhone Safari offers push only to the app added to the Home Screen and opened from there.
export const needsHomeScreen = (nav = navigator) => /iPhone|iPad|iPod/.test(nav.userAgent) && !nav.standalone;
export const pushState = () => get(); // { endpoint, prefs } once this phone is signed up

const save = async (sub, prefs, lang) => {
  const j = sub.toJSON();
  await rest("push_subs?on_conflict=user_id,endpoint", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, prefs, lang, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" },
  });
  localStorage.setItem(PUSH, JSON.stringify({ endpoint: j.endpoint, prefs }));
};
const current = async () => (await navigator.serviceWorker.ready).pushManager.getSubscription();

// Asks the phone's permission (it must follow a tap), subscribes, and turns on every kind for this account's role.
export const turnOn = async (lang) => {
  if ((await Notification.requestPermission()) !== "granted") throw Object.assign(new Error("denied"), { code: "denied" });
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api("/functions/v1/notify");
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey && b64u(sub.options.applicationServerKey) !== publicKey) { await sub.unsubscribe(); sub = null; } // made for another server key
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(publicKey) });
  await save(sub, Object.fromEntries(kindsFor().map((k) => [k, true])), lang);
};

export const setKind = async (kind, on, lang) => {
  const sub = await current();
  if (!sub) { localStorage.removeItem(PUSH); throw Object.assign(new Error("gone"), { code: "gone" }); } // the phone dropped it
  await save(sub, { ...get()?.prefs, [kind]: on }, lang);
};

// This phone stops getting them. Also run on signing out, so the next person on this phone doesn't get yours.
export const turnOff = async () => {
  const s = get();
  localStorage.removeItem(PUSH);
  if (s?.endpoint && userId()) try { await rest(`push_subs?user_id=eq.${userId()}&endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" }); } catch { /* offline: the server drops it when the push service refuses it */ }
  if (s) try { await (await current())?.unsubscribe(); } catch { /* no service worker here */ } // only when signed up: `ready` never settles without a worker
};
