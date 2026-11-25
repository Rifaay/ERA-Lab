import { AREAS, dayFilled } from "../plan";
import { planWeek } from "../stats";
import Icon from "../icons";

// One day of a plan: what the coach writes for it is kept in plan.days and goes into the plan sent to the archers.
export function DayEditor({ iso, plan, lang, pl, exercises, comps, onChange, onWeek, onClose }) {
  const c = pl.cal, d = plan.days?.[iso] || {}, w = planWeek(iso), k = plan.weeks?.[w];
  const set = (patch) => onChange({ ...d, ...patch });
  const toggle = (field, id) => { const list = d[field] || []; set({ [field]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] }); };
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
        <div><label>{c.areasLabel}</label>
          <div className="chip-list" role="group" aria-label={c.areasLabel}>
            {AREAS.map((a) => <button key={a} type="button" className={`chip ${d.areas?.includes(a) ? "active" : ""}`} aria-pressed={!!d.areas?.includes(a)} onClick={() => toggle("areas", a)}>{c.areas[a]}</button>)}
          </div>
        </div>
        <label>{c.focus}<input value={d.focus || ""} placeholder={c.focusHint} onChange={(e) => set({ focus: e.target.value })} /></label>
        <label>{c.arrows}<input type="number" min="0" step="6" value={d.arrows ?? ""} onChange={(e) => set({ arrows: e.target.value === "" ? "" : Math.max(0, +e.target.value) })} /></label>
        {exercises.length > 0 && <fieldset className="pz-pick"><legend>{pl.exercises}</legend>
          {exercises.map((x) => <label key={x.id} className="pz-check"><input type="checkbox" checked={(d.exercises || []).includes(x.id)} onChange={() => toggle("exercises", x.id)} />{x.name}</label>)}
        </fieldset>}
        <label>{c.materials}<textarea rows={3} value={d.materials || ""} placeholder={c.materialsHint} onChange={(e) => set({ materials: e.target.value })} /></label>
        {links.length > 0 && <ul className="cal-links">{links.map((u, i) => <li key={i}><a href={u} target="_blank" rel="noopener noreferrer" dir="ltr">{u}</a></li>)}</ul>}
        <label>{c.note}<textarea rows={2} value={d.note || ""} onChange={(e) => set({ note: e.target.value })} /></label>
        {dayFilled(d) && <button className="btn-ghost small danger" style={{ alignSelf: "flex-start" }} onClick={() => window.confirm(c.confirmClear) && onChange(null)}>{c.clear}</button>}
      </div>
    </div>
  );
}
