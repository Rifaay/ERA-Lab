import { useState } from "react";
import { COLORS, monthGrid, dayFilled, phaseOfDay } from "../plan";
import { planWeek } from "../stats";
import Icon from "../icons";

// The season as a calendar: twelve months, then a month's days, then one day's plan. A day is coloured by its plan
// week's phase; what the coach writes for a day is kept in plan.days and goes into the plan sent to the archer.
export default function SeasonCalendar({ plan, year, lang, pl, comps, exercises, today, onDay, onWeek }) {
  const c = pl.cal, loc = lang === "ar" ? "ar-EG" : "en-GB";
  const [month, setMonth] = useState(null);
  const [day, setDay] = useState(null);
  const monthName = (m) => new Date(year, m, 1).toLocaleDateString(loc, { month: "long" });
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: "narrow" })); // 1 Jan 2024 was a Monday
  const compsOn = (iso) => comps.filter((x) => x.date === iso);
  const tint = (iso) => { const k = phaseOfDay(plan, iso); return k ? { background: COLORS[k] + "26", borderColor: COLORS[k] } : undefined; };

  if (month == null) return (
    <>
      <p className="muted">{c.hint}</p>
      <div className="cal-months">
        {Array.from({ length: 12 }, (_, m) => (
          <button key={m} type="button" className="cal-month" onClick={() => setMonth(m)} aria-label={monthName(m)}>
            <b>{monthName(m)}</b>
            <span className="cal-mini" aria-hidden="true">
              {monthGrid(year, m).map((iso, i) => (
                <i key={i} className={iso ? (dayFilled(plan.days?.[iso]) ? "f" : "") + (compsOn(iso).length ? " c" : "") + (iso === today ? " t" : "") : "x"} style={iso ? tint(iso) : undefined} />
              ))}
            </span>
          </button>
        ))}
      </div>
    </>
  );

  const go = (m) => { setDay(null); if (m < 0 || m > 11) setMonth(null); else setMonth(m); };
  return (
    <>
      <div className="cal-head">
        <button className="btn-ghost small" onClick={() => go(null)}><Icon name="prev" size={16} />{c.allMonths}</button>
        <span className="cal-nav">
          <button className="icon-btn" onClick={() => go(month - 1)} disabled={month === 0} aria-label={c.prevMonth}><Icon name="prev" size={18} /></button>
          <b>{monthName(month)} {year}</b>
          <button className="icon-btn" onClick={() => go(month + 1)} disabled={month === 11} aria-label={c.nextMonth}><Icon name="next" size={18} /></button>
        </span>
      </div>
      <div className="cal-grid" role="grid" aria-label={`${monthName(month)} ${year}`}>
        {weekdays.map((d, i) => <span key={i} className="cal-wd" role="columnheader">{d}</span>)}
        {monthGrid(year, month).map((iso, i) => {
          if (!iso) return <span key={i} />;
          const d = plan.days?.[iso], cs = compsOn(iso);
          return (
            <button key={iso} type="button" role="gridcell" aria-selected={day === iso} className={`cal-day ${day === iso ? "sel" : ""} ${iso === today ? "now" : ""}`} style={tint(iso)} onClick={() => setDay(day === iso ? null : iso)}>
              <span className="n">{+iso.slice(8)}</span>
              {cs.map((x) => <span key={x.id} className={`wk-comp p${x.priority}`}>{x.priority}</span>)}
              {d?.focus ? <span className="fx">{d.focus}</span> : dayFilled(d) ? <span className="dot" /> : null}
            </button>
          );
        })}
      </div>
      <p className="muted pz-key">{c.key}</p>
      {day && <DayEditor key={day} iso={day} {...{ plan, lang, pl, exercises, onWeek }} comps={compsOn(day)} onChange={(patch) => onDay(day, patch)} onClose={() => setDay(null)} />}
    </>
  );
}

function DayEditor({ iso, plan, lang, pl, exercises, comps, onChange, onWeek, onClose }) {
  const c = pl.cal, d = plan.days?.[iso] || {}, w = planWeek(iso), k = plan.weeks?.[w];
  const set = (patch) => onChange({ ...d, ...patch });
  const pick = (id) => { const list = d.exercises || []; set({ exercises: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] }); };
  const links = (d.materials || "").split(/\s+/).filter((x) => /^https?:\/\/\S+$/i.test(x)); // only web links become clickable
  const [y, mo, da] = iso.split("-").map(Number);
  return (
    <div className="card pz-week" role="region" aria-label={iso}>
      <div className="card-header">
        <div className="card-title">{new Date(y, mo - 1, da).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
        <button className="del-btn" onClick={onClose} aria-label={pl.close}><Icon name="x" size={16} /></button>
      </div>
      {comps.map((x) => <p key={x.id}><span className={`wk-comp p${x.priority}`}>{x.priority}</span> {x.name}</p>)}
      <button className="link-btn" style={{ justifySelf: "start" }} onClick={() => onWeek(w)}>
        {c.openWeek.replace("{w}", w).replace("{phase}", k ? pl.phases[k] : "—")}
      </button>
      <div className="form">
        <label>{c.focus}<input value={d.focus || ""} placeholder={c.focusHint} onChange={(e) => set({ focus: e.target.value })} /></label>
        <label>{c.arrows}<input type="number" min="0" step="6" value={d.arrows ?? ""} onChange={(e) => set({ arrows: e.target.value === "" ? "" : Math.max(0, +e.target.value) })} /></label>
        {exercises.length > 0 && <fieldset className="pz-pick"><legend>{pl.exercises}</legend>
          {exercises.map((x) => <label key={x.id} className="pz-check"><input type="checkbox" checked={(d.exercises || []).includes(x.id)} onChange={() => pick(x.id)} />{x.name}</label>)}
        </fieldset>}
        <label>{c.materials}<textarea rows={3} value={d.materials || ""} placeholder={c.materialsHint} onChange={(e) => set({ materials: e.target.value })} /></label>
        {links.length > 0 && <ul className="cal-links">{links.map((u, i) => <li key={i}><a href={u} target="_blank" rel="noopener noreferrer" dir="ltr">{u}</a></li>)}</ul>}
        <label>{c.note}<textarea rows={2} value={d.note || ""} onChange={(e) => set({ note: e.target.value })} /></label>
        {dayFilled(d) && <button className="btn-ghost small danger" style={{ alignSelf: "flex-start" }} onClick={() => window.confirm(c.confirmClear) && onChange(null)}>{c.clear}</button>}
      </div>
    </div>
  );
}
