import { useEffect, useState } from "react";
import { sharedPlans, loadSharedPlans } from "../archer";
import { isoDay, planWeek } from "../stats";
import { dayFilled, COLORS } from "../plan";

const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const links = (s) => (s || "").split(/\s+/).filter((x) => /^https?:\/\/\S+$/i.test(x)); // only web links become clickable

// The archer's app → Plan: the season plan the coach sent. Today first, then the next planned days and competitions.
export default function ArcherPlan({ tr, lang }) {
  const p = tr.archerPlan, pl = tr.planner, loc = lang === "ar" ? "ar-EG" : "en-GB";
  const [rows, setRows] = useState(sharedPlans);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const pull = () => loadSharedPlans().then((r) => { setRows(r); setOffline(false); }).catch(() => setOffline(true));
    const seen = () => document.visibilityState === "visible" && pull();
    pull();
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, []);

  const today = isoDay(new Date()), year = +today.slice(0, 4);
  const plan = rows.find((r) => r.year === year) || rows.find((r) => r.year > year) || null;
  if (!plan) return <div className="screen"><h2>{p.title}</h2>{offline && <p className="muted">{p.offline}</p>}<div className="card"><p>{p.none}</p></div></div>;

  const d = plan.data || {}, days = d.days || {};
  const ahead = Object.keys(days).filter((iso) => iso > today && dayFilled(days[iso])).sort().slice(0, 14);
  const comps = (d.comps || []).filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const date = (iso, opt = { weekday: "long", day: "numeric", month: "long" }) => { const [y, m, n] = iso.split("-").map(Number); return new Date(y, m - 1, n).toLocaleDateString(loc, opt); };
  const phase = (iso) => { const w = planWeek(iso), k = d.weeks?.[w]; return { w, k, label: fill(p.week, { w, phase: k ? pl.phases[k] : "—" }) }; };

  const day = (iso, open) => {
    const x = days[iso] || {}, ph = phase(iso);
    return (
      <div key={iso} className="card form" style={ph.k ? { borderInlineStart: `4px solid ${COLORS[ph.k]}` } : undefined}>
        <div className="card-title">{open ? p.today : date(iso)}</div>
        <p className="muted">{open ? `${date(iso)} · ` : ""}{ph.label}</p>
        {!dayFilled(x) ? <p>{p.nothingToday}</p> : <>
          {x.areas?.length > 0 && <div className="chip-list">{x.areas.map((a) => <span key={a} className="chip active">{pl.cal.areas[a] || a}</span>)}</div>}
          {(x.focus || x.arrows) && <p><b>{x.focus}</b>{x.focus && x.arrows ? " · " : ""}{x.arrows ? fill(p.arrows, { n: x.arrows }) : ""}</p>}
          {x.exercises?.length > 0 && <p>{pl.exercises}: {x.exercises.join(", ")}</p>}
          {x.materials && <p style={{ whiteSpace: "pre-wrap" }}>{x.materials}</p>}
          {links(x.materials).length > 0 && <ul className="cal-links">{links(x.materials).map((u, i) => <li key={i}><a href={u} target="_blank" rel="noopener noreferrer" dir="ltr">{u}</a></li>)}</ul>}
          {x.note && <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{x.note}</p>}
        </>}
      </div>
    );
  };

  return (
    <div className="screen">
      <h2>{p.title} {plan.year}</h2>
      <p className="muted">{fill(p.sentOn, { date: new Date(plan.updated_at).toLocaleDateString(loc) })}{offline ? ` · ${p.offline}` : ""}</p>
      {plan.year === year && day(today, true)}
      {comps.length > 0 && <div className="card">
        <div className="card-title">{p.comps}</div>
        {comps.map((c, i) => <p key={i}><span className={`wk-comp p${c.priority}`} style={{ position: "static", display: "inline-grid" }}>{c.priority}</span> {c.name} · {date(c.date, { day: "numeric", month: "long" })}</p>)}
      </div>}
      {ahead.length > 0 && <h3 className="settings-group">{p.next}</h3>}
      {ahead.map((iso) => day(iso, false))}
    </div>
  );
}
