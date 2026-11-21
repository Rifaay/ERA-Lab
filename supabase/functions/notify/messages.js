// What each notification says, in the reader's language, and which archers get a training reminder this hour.
// Plain JS so the tests run it in Node; the Edge Function (index.ts) imports it in Deno.
export const KINDS = { coach: ["joined", "started", "finished"], archer: ["plan", "reminder"] };
export const REMINDER_HOUR = 7; // local time on the archer's phone

const T = {
  en: {
    joined: ["Archer joined", "{name} joined with your invite"],
    started: ["{name} is shooting", "Started a session at {dist} m. Range → Live shows it as it happens"],
    finished: ["{name} finished", "{total} / {outOf} from {arrows} arrows at {dist} m"],
    plan: ["New season plan", "Your coach sent your {year} plan. Open Plan to see it"],
    reminder: ["Training today", "{what}"],
    arrows: "{n} arrows", planned: "Your coach planned training for today",
  },
  ar: {
    joined: ["انضم رامٍ", "انضم {name} عبر دعوتك"],
    started: ["{name} يرمي الآن", "بدأ جلسة على مسافة {dist} م. تابعها مباشرة من الميدان ← مباشر"],
    finished: ["أنهى {name} الجلسة", "{total} / {outOf} من {arrows} سهمًا على مسافة {dist} م"],
    plan: ["خطة موسم جديدة", "أرسل مدربك خطة {year}. افتح الخطة لرؤيتها"],
    reminder: ["تدريب اليوم", "{what}"],
    arrows: "{n} سهمًا", planned: "خطط مدربك لتدريب اليوم",
  },
};
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? "–"));
const clip = (s, n) => String(s ?? "").slice(0, n);

export const message = (kind, args = {}, lang = "en") => {
  const t = T[lang] || T.en, [title, body] = t[kind];
  const v = { ...args, name: clip(args.name, 60) || "–", outOf: (Number(args.arrows) || 0) * 10 };
  return { title: fill(title, v), body: fill(body, v), tag: `era-${kind}-${v.name}` }; // one per archer and kind: a newer one replaces the older
};

const dayFilled = (d) => Boolean(d && (d.focus || d.arrows || d.note || d.materials || d.exercises?.length));
// The archer's local date and hour, from the time zone their phone reported.
export const localNow = (tz, now = new Date()) => {
  let p;
  try { p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value])); }
  catch { return null; } // an unknown time zone: no reminder rather than one at the wrong hour
  return { iso: `${p.year}-${p.month}-${p.day}`, year: +p.year, hour: +p.hour };
};

// subs: push_subs rows with reminders on; plans: shared_plans rows. One reminder per subscription whose archer has
// something planned today and for whom it is REMINDER_HOUR now.
export const dueReminders = (subs, plans, now = new Date()) => subs.flatMap((s) => {
  const at = localNow(s.tz, now);
  if (!at || at.hour !== REMINDER_HOUR) return [];
  const d = plans.find((p) => p.archer_id === s.user_id && p.year === at.year)?.data?.days?.[at.iso];
  if (!dayFilled(d)) return [];
  const t = T[s.lang] || T.en;
  const what = [clip(d.focus, 80), d.arrows ? fill(t.arrows, { n: d.arrows }) : ""].filter(Boolean).join(" · ") || t.planned;
  return [{ sub: s, msg: message("reminder", { what }, s.lang) }];
});
