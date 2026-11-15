// Archers with their own sign-in. A coach makes an invite code for an adult archer; the archer's phone then uploads the
// range sessions it plots, and the coach's app shows them live and copies finished ones into the coach's records.
// Only archers aged 18 or over can be invited: the owner's rule is no children's data on a server.
import { api, token, userId, hash, isAdult } from "./sync.js";
import { finish } from "./range.js";
import { getAthletes, getSessions, saveSession, uid } from "./storage.js";

const LINK = "racm_link", SENT = "racm_uploaded", INVITES = "racm_invites";
const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const rest = async (path, opt = {}) => api("/rest/v1/" + path, { ...opt, token: await token() });

// ── Archer's phone ──────────────────────────────────────────────────────────────────────────────────────
export const myLink = () => get(LINK, null); // { coach_id, athlete_id, name } once joined
export const claim = async (code) => {
  const rows = await rest("rpc/claim_invite", { method: "POST", body: { invite_code: code.trim() } });
  if (!rows?.length) throw Object.assign(new Error("That code isn't valid"), { code: "bad_invite" });
  put(LINK, rows[0]);
  return rows[0];
};
// After signing in on a new phone: the link lives on the server.
export const loadLink = async () => {
  const rows = await rest(`invites?select=coach_id,athlete_id,name&claimed_by=eq.${userId()}`);
  if (rows[0]) put(LINK, rows[0]); else localStorage.removeItem(LINK);
  return rows[0] || null;
};
export const leaveCoach = async () => { await rest(`invites?claimed_by=eq.${userId()}`, { method: "DELETE" }); localStorage.removeItem(LINK); };

// Sends the session being shot and any finished one that changed since it was last sent. Returns how many went.
export const uploadSessions = async (live, sessions) => {
  const link = myLink();
  if (!link) return 0;
  const sent = get(SENT, {});
  const all = [live, ...sessions.map((x) => x.range)].filter((x) => x?.session_id && x.athlete_id === link.athlete_id);
  const rows = all.filter((x) => sent[x.session_id] !== hash(JSON.stringify(x)));
  if (!rows.length) return 0;
  await rest("archer_sessions?on_conflict=archer_id,session_id", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: rows.map((x) => ({ session_id: x.session_id, coach_id: link.coach_id, athlete_id: link.athlete_id, data: x })),
  });
  for (const x of rows) sent[x.session_id] = hash(JSON.stringify(x));
  put(SENT, sent);
  return rows.length;
};
export const waiting = (live, sessions) => {
  const link = myLink(), sent = get(SENT, {});
  if (!link) return 0;
  return [live, ...sessions.map((x) => x.range)].filter((x) => x?.session_id && x.athlete_id === link.athlete_id && sent[x.session_id] !== hash(JSON.stringify(x))).length;
};

// ── Coach's side ────────────────────────────────────────────────────────────────────────────────────────
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, 8 of them: 40 bits, and none that look alike
export const newCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => LETTERS[b % 32]).join("");
export const canInvite = (athlete, today) => isAdult(athlete?.dob, today);

export const invites = () => get(INVITES, []);
export const linkOf = (athleteId) => invites().find((i) => i.athlete_id === athleteId) || null;
export const isExpired = (link, now = Date.now()) => Boolean(link && !link.claimed_by && Date.parse(link.expires_at) < now);
export const isLinked = (athleteId) => Boolean(linkOf(athleteId)?.claimed_by);
export const refreshInvites = async () => {
  const rows = await rest(`invites?select=code,athlete_id,name,claimed_by,expires_at&coach_id=eq.${userId()}`);
  put(INVITES, rows);
  return rows;
};
export const createInvite = async (athlete) => {
  if (!canInvite(athlete)) throw Object.assign(new Error("Only archers aged 18 or over"), { code: "minor" });
  await rest(`invites?athlete_id=eq.${encodeURIComponent(athlete.id)}&coach_id=eq.${userId()}&claimed_by=is.null`, { method: "DELETE" }); // an old, unused code
  const code = newCode();
  await rest("invites", { method: "POST", prefer: "return=minimal", body: { code, athlete_id: athlete.id, name: athlete.name.slice(0, 100) } });
  await refreshInvites();
  return code;
};
export const unlink = async (athleteId) => {
  await rest(`invites?athlete_id=eq.${encodeURIComponent(athleteId)}&coach_id=eq.${userId()}`, { method: "DELETE" });
  await rest(`archer_sessions?athlete_id=eq.${encodeURIComponent(athleteId)}&coach_id=eq.${userId()}`, { method: "DELETE" });
  await refreshInvites();
};

// What an archer's phone sent is outside input: keep only the shape the app understands, and bind it to the coach's
// own archer profile whatever the file claims. Returns null when it isn't a range session.
const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const SCORES = new Set(["X", "M", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1"]);
export const cleanSession = (d, athlete) => {
  if (!d || d.schema !== "racm.session.v1" || !Array.isArray(d.ends) || d.ends.length > 80 || typeof d.context !== "object" || !d.context) return null;
  if (typeof d.session_id !== "string" || !d.session_id || d.session_id.length > 120 || !Number.isFinite(d.start_ms)) return null;
  const c = d.context, obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const eq = obj(d.equipment), mp = obj(d.mental_pre), post = obj(d.post);
  return {
    schema: d.schema, session_id: d.session_id, athlete: athlete.name, athlete_id: athlete.id, type: text(d.type, 40),
    start_ms: d.start_ms, end_ms: Number.isFinite(d.end_ms) ? d.end_ms : null, tz_offset_min: num(d.tz_offset_min, -900, 900) ?? 0,
    context: {
      distance_m: num(c.distance_m, 1, 150) ?? 18, face: ["122", "80", "80r", "40", "40s"].includes(c.face) ? c.face : "122",
      arrows_per_end: num(c.arrows_per_end, 1, 12) ?? 6, place: text(c.place, 120), wind: text(c.wind, 20) || null, wind_from: text(c.wind_from, 20) || null,
      temp_c: num(c.temp_c, -40, 60), light: text(c.light, 20),
    },
    equipment: { bow: text(eq.bow, 80), draw_weight_lb: num(eq.draw_weight_lb, 0, 100), arrows: text(eq.arrows, 80), draw_length_in: num(eq.draw_length_in, 0, 40), notes: text(eq.notes, 500) },
    mental_pre: { readiness: num(mp.readiness, 1, 10), confidence: num(mp.confidence, 1, 10), focus: num(mp.focus, 1, 10), energy: num(mp.energy, 1, 10), sleep_h: num(mp.sleep_h, 0, 24), goal: text(mp.goal, 300) },
    ends: d.ends.map((e, i) => ({
      end: i + 1, focus: num(e?.focus, 1, 5), routine: text(e?.routine, 20) || null, notes: text(e?.notes, 500),
      arrows: (Array.isArray(e?.arrows) ? e.arrows : []).slice(0, 12).map((a, j) => {
        const x = num(a?.x, -1.08, 1.08), y = num(a?.y, -1.08, 1.08), spot = num(a?.spot, 0, 2);
        return {
          arrow: j + 1, plot_ms: Number.isFinite(a?.plot_ms) ? a.plot_ms : d.start_ms, score: SCORES.has(String(a?.score)) ? String(a.score) : null,
          x: y == null ? null : x, y: x == null ? null : y, feel: num(a?.feel, 1, 5), notes: text(a?.notes, 300), ...(spot != null && { spot: Math.round(spot) }),
        };
      }),
    })),
    post: { rating: num(post.rating, 1, 10), effort: num(post.effort, 1, 10) }, coach_notes: text(d.coach_notes, 1000),
  };
};

// Rows from archer_sessions, newest first. A row counts as live while unfinished and touched in the last 30 minutes.
export const fetchArcherRows = () => rest(`archer_sessions?select=archer_id,session_id,athlete_id,data,updated_at&coach_id=eq.${userId()}&order=updated_at.desc&limit=60`);
export const liveOf = (rows, athletes, now = Date.now()) =>
  rows.map((r) => ({ row: r, athlete: athletes.find((a) => a.id === r.athlete_id) }))
    .filter((x) => x.athlete && isLinked(x.athlete.id))
    .map((x) => ({ athlete: x.athlete, updated: Date.parse(x.row.updated_at), session: cleanSession(x.row.data, x.athlete) }))
    .filter((x) => x.session && !x.session.end_ms && now - x.updated < 30 * 60_000);

// Copies each finished session the coach doesn't have yet into the coach's own sessions. Returns how many.
export const importFinished = (rows, { athletes, sessions, saveSession, uid }) => {
  let n = 0;
  const have = new Set(sessions.map((x) => x.range?.session_id).filter(Boolean));
  for (const r of rows) {
    const athlete = athletes.find((a) => a.id === r.athlete_id);
    if (!athlete || !isLinked(athlete.id) || have.has(r.session_id)) continue;
    const s = cleanSession(r.data, athlete);
    if (!s || !s.end_ms || s.session_id !== r.session_id || !s.ends.some((e) => e.arrows.length)) continue;
    saveSession({ ...finish(s, uid()), fromArcher: true });
    have.add(r.session_id); n++;
  }
  return n;
};

// One pass for the coach: who is linked, what their phones have sent, and finished sessions copied into the coach's
// own records. Returns the rows and how many sessions were copied.
export const pullArchers = async () => {
  await refreshInvites();
  if (!invites().some((i) => i.claimed_by)) return { rows: [], copied: 0 };
  const rows = await fetchArcherRows();
  return { rows, copied: importFinished(rows, { athletes: getAthletes(), sessions: getSessions(), saveSession, uid }) };
};
