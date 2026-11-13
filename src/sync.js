// Cloud copy on Supabase: the device stays the working copy (the app runs offline), and sync makes the coach's
// devices agree. Each record is compared with what both sides held at the last sync (a hash per record), so a change
// on one side wins, a deletion on one side is carried over, and when both sides changed the same record this device
// wins and the other version is kept in racm_sync_conflicts (it goes into the backup file).
// Athletes under 18, or with no birth date, and everything about them never leave the device: the owner's rule is no
// children's data on a server until guardian consent is settled.
import { readKind, writeKind } from "./storage.js";

const env = import.meta.env || {};
const URL_ = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const configured = Boolean(URL_ && KEY);

export const KINDS = ["athletes", "sessions", "assessments", "plans", "goals", "progressLogs", "checkIns", "exercises", "goalTemplates", "reviews", "settings"];
const AUTH = "racm_auth", STATE = "racm_sync", CONFLICTS = "racm_sync_conflicts";

const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// cyrb53: a fast 53-bit hash, enough to tell whether a record changed.
export const hash = (str) => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};

export const isAdult = (dob, today = new Date()) => {
  if (!dob) return false;
  const b = new Date(dob);
  if (isNaN(b)) return false;
  const age = today.getFullYear() - b.getFullYear() - (today < new Date(today.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
  return age >= 18;
};

// The records allowed to sync, by kind and id. `lists` holds every kind as stored on the device.
export const shareable = (lists, today) => {
  const adults = new Set(lists.athletes.filter((a) => isAdult(a.dob, today)).map((a) => a.id));
  const goals = new Set(lists.goals.filter((g) => adults.has(g.athleteId)).map((g) => g.id));
  const ok = (kind, x) => {
    if (kind === "athletes") return adults.has(x.id);
    if (kind === "progressLogs" || kind === "checkIns") return goals.has(x.goalId);
    if ("athleteId" in x) return adults.has(x.athleteId);
    return true; // exercises, goal templates, settings
  };
  const out = {};
  for (const kind of KINDS) {
    out[kind] = {};
    const items = kind === "settings" ? [{ ...lists.settings, id: "main" }] : lists[kind];
    for (const x of items) if (x && typeof x.id === "string" && x.id && ok(kind, x)) out[kind][x.id] = x;
  }
  return out;
};

// Three-way comparison of one kind. local/remote: {id: record}; base: {id: hash at last sync}.
export const plan = (local, remote, base) => {
  const push = [], drop = [], take = [], remove = [], conflicts = [], next = {};
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)])) {
    const L = id in local ? hash(JSON.stringify(local[id])) : null;
    const R = id in remote ? hash(JSON.stringify(remote[id])) : null;
    const B = base[id] ?? null;
    if (L === R) { if (L) next[id] = L; continue; }
    if (L === B) { if (R) take.push(id); else remove.push(id); if (R) next[id] = R; continue; } // only the cloud changed
    if (R !== B && R) conflicts.push(id); // both changed: this device wins, the cloud's version is kept aside
    if (L) push.push(id); else drop.push(id);
    if (L) next[id] = L;
  }
  return { push, drop, take, remove, conflicts, next };
};

// ── Supabase calls (plain fetch: sign-in by emailed code and one table need no client library) ──────────
const call = async (path, { method = "GET", body, token, prefer } = {}, f = fetch) => {
  const res = await f(URL_ + path, {
    method,
    headers: { apikey: KEY, "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }), ...(prefer && { Prefer: prefer }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) { const e = new Error((text && (JSON.parse(text).msg || JSON.parse(text).message)) || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return text ? JSON.parse(text) : null;
};

export const account = () => get(AUTH, null)?.email || "";
export const sendCode = (email) => call("/auth/v1/otp", { method: "POST", body: { email, create_user: true } });
export const verifyCode = async (email, code) => {
  const s = await call("/auth/v1/verify", { method: "POST", body: { type: "email", email, token: code.trim() } });
  if (get(STATE, {}).user !== s.user.id) { put(STATE, { user: s.user.id, base: {} }); } // another account: compare from scratch
  put(AUTH, { email: s.user.email, token: s.access_token, refresh: s.refresh_token, expires: Date.now() + s.expires_in * 1000 });
};
const token = async (f) => {
  const a = get(AUTH, null);
  if (!a) throw new Error("Not signed in");
  if (Date.now() < a.expires - 60_000) return a.token;
  const s = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: a.refresh } }, f);
  put(AUTH, { ...a, token: s.access_token, refresh: s.refresh_token, expires: Date.now() + s.expires_in * 1000 });
  return s.access_token;
};
export const signOut = async () => {
  try { await call("/auth/v1/logout", { method: "POST", token: await token() }); } catch { /* offline or expired: forget it here anyway */ }
  localStorage.removeItem(AUTH);
};
// Erases this coach's whole cloud copy. The device keeps its data.
export const deleteCloudCopy = async () => {
  await call(`/rest/v1/records?coach_id=eq.${get(STATE, {}).user}`, { method: "DELETE", token: await token() });
  put(STATE, { ...get(STATE, {}), base: {} });
};

const pullAll = async (t, f) => {
  const rows = [];
  for (let from = 0; ; from += 1000) { // Supabase returns at most 1000 rows per request
    const page = await call(`/rest/v1/records?select=kind,id,data&order=kind,id&limit=1000&offset=${from}`, { token: t }, f);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
};

let running = null;
// One sync at a time in this tab. shortcut: two open tabs can sync at once; the next sync settles it.
export const syncNow = (f = fetch, today) => (running ||= runSync(f, today).finally(() => { running = null; }));

const runSync = async (f, today) => {
  const t = await token(f);
  const lists = Object.fromEntries(KINDS.map((k) => [k, readKind(k)]));
  const local = shareable(lists, today);
  const remote = Object.fromEntries(KINDS.map((k) => [k, {}]));
  for (const r of await pullAll(t, f)) if (remote[r.kind]) remote[r.kind][r.id] = r.data;

  const state = get(STATE, { base: {} });
  const base = { ...state.base };
  let changedHere = 0, sent = 0;
  const kept = get(CONFLICTS, []);
  for (const kind of KINDS) {
    // A record that became private here (e.g. a birth date corrected to under 18) is replaced in the cloud by a stub
    // holding only its id. Other devices then keep their own copy and never upload it again, instead of deleting it.
    const was = { ...(state.base[kind] || {}) };
    const stubs = new Set(Object.keys(remote[kind]).filter((id) => remote[kind][id]?.private === true));
    const hidden = Object.keys(was).filter((id) => !(id in local[kind]) && !stubs.has(id) && lists[kind].some?.((x) => x.id === id));
    if (hidden.length) await call("/rest/v1/records?on_conflict=coach_id,kind,id", { method: "POST", body: hidden.map((id) => ({ kind, id, data: { id, private: true } })), token: t, prefer: "resolution=merge-duplicates,return=minimal" }, f);
    for (const id of [...stubs, ...hidden]) { delete local[kind][id]; delete remote[kind][id]; delete was[id]; }

    const p = plan(local[kind], remote[kind], was);
    for (const id of p.conflicts) kept.push({ kind, id, data: remote[kind][id], at: new Date().toISOString() });

    const rows = p.push.map((id) => ({ kind, id, data: local[kind][id] }));
    for (let i = 0; i < rows.length; i += 200) {
      await call("/rest/v1/records?on_conflict=coach_id,kind,id", { method: "POST", body: rows.slice(i, i + 200), token: t, prefer: "resolution=merge-duplicates,return=minimal" }, f);
    }
    for (const id of p.drop) await call(`/rest/v1/records?kind=eq.${kind}&id=eq.${encodeURIComponent(id)}`, { method: "DELETE", token: t }, f);
    sent += rows.length + p.drop.length;

    if (p.take.length || p.remove.length) {
      changedHere += p.take.length + p.remove.length;
      if (kind === "settings") writeKind(kind, (({ id, ...s }) => s)(remote.settings.main)); // eslint-disable-line no-unused-vars
      else {
        const gone = new Set([...p.take, ...p.remove]);
        writeKind(kind, [...lists[kind].filter((x) => !gone.has(x.id)), ...p.take.map((id) => remote[kind][id])]);
      }
    }
    base[kind] = p.next;
    put(STATE, { ...state, base }); // after each kind, so a failure part-way doesn't make the next sync redo or undo it
  }
  if (kept.length) put(CONFLICTS, kept.slice(-50));
  const at = new Date().toISOString();
  put(STATE, { ...get(STATE, {}), base, at });
  return { sent, received: changedHere, conflicts: kept.length, at };
};

export const lastSync = () => get(STATE, {}).at || "";
export const conflicts = () => get(CONFLICTS, []);
