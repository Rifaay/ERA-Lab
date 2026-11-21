// Sends ERA Lab's phone notifications. The database calls it (migrations/0006_push.sql) with a secret it made itself;
// a browser only ever GETs the public key to subscribe with. Deploy: npx supabase functions deploy notify --no-verify-jwt
import { send, newVapidKeys } from "./webpush.js";
import { message, dueReminders } from "./messages.js";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUBJECT = "https://rifaay.github.io/ERA-Lab/"; // who to contact about these pushes, as push services ask
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, apikey, authorization" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const db = async (path: string, init: RequestInit = {}) => {
  const auth = KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}; // a legacy JWT key; a new secret key goes in apikey only
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, ...auth, "Content-Type": "application/json", ...(init.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
};

// The server's signing keys: made on first use and kept in push_keys, which only this function can read.
let cached: { privateJwk: JsonWebKey; publicKey: string } | null = null;
const keys = async () => {
  if (cached) return cached;
  const read = async () => (await db("push_keys?select=private_jwk,public_key&id=eq.1"))[0];
  let row = await read();
  if (!row) {
    const k = await newVapidKeys();
    await db("push_keys", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ id: 1, private_jwk: k.privateJwk, public_key: k.publicKey }) });
    row = await read(); // two first calls at once: both keep the one that was stored
  }
  return (cached = { privateJwk: row.private_jwk, publicKey: row.public_key });
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return json({ publicKey: (await keys()).publicKey });

  const ok = await db("rpc/notify_secret_ok", { method: "POST", body: JSON.stringify({ s: req.headers.get("x-notify-secret") || "" }) });
  if (ok !== true) return json({ error: "not allowed" }, 401);

  const { kind, to, args } = await req.json();
  let jobs: { sub: Record<string, any>; msg: Record<string, string> }[] = [];
  if (kind === "reminders") {
    const subs = await db("push_subs?select=*&prefs->>reminder=eq.true");
    const ids = [...new Set(subs.map((s: any) => s.user_id))];
    const plans = ids.length ? await db(`shared_plans?select=archer_id,year,data&archer_id=in.(${ids.join(",")})`) : [];
    jobs = dueReminders(subs, plans);
  } else if (["joined", "started", "finished", "plan"].includes(kind) && UUID.test(to)) {
    const subs = await db(`push_subs?select=*&user_id=eq.${to}`);
    jobs = subs.filter((s: any) => s.prefs?.[kind]).map((s: any) => ({ sub: s, msg: message(kind, args, s.lang) }));
  } else return json({ error: "unknown kind" }, 400);

  const k = await keys();
  let sent = 0;
  for (const { sub, msg } of jobs) {
    try {
      const status = await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, msg, k, SUBJECT);
      if (status === 404 || status === 410) await db(`push_subs?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" }); // the phone unsubscribed
      else if (status < 300) sent++;
      else console.warn("push refused", status, new URL(sub.endpoint).host);
    } catch (e) { console.warn("push failed", (e as Error).message); }
  }
  return json({ sent, of: jobs.length });
});
