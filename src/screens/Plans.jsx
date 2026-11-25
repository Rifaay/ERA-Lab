import { useState } from "react";
import { getPlans, getAthletes, newPlan, deletePlan, LEVELS } from "../storage";
import { COLORS, compsIn } from "../plan";
import { isoDay, planWeek } from "../stats";
import SwipeRow from "../SwipeRow";
import Icon from "../icons";

const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// Plan tab: every plan the coach has made, each with its season at a glance, who follows it and what comes next.
// A plan is made once (name, level, season) and then given to archers from inside it.
export default function Plans({ tr, onOpen }) {
  const p = tr.plans, pl = tr.planner;
  const today = isoDay(new Date()), year = +today.slice(0, 4), week = planWeek(today);
  const [making, setMaking] = useState(false);
  const [form, setForm] = useState({ name: "", level: "performance", year });
  const [, setTick] = useState(0);
  const athletes = getAthletes(), byId = Object.fromEntries(athletes.map((a) => [a.id, a]));
  const plans = getPlans().sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
  const planned = new Set(plans.filter((x) => x.year === year).flatMap((x) => x.archers));
  const without = athletes.filter((a) => !planned.has(a.id));

  const create = () => {
    if (!form.name.trim()) return;
    onOpen(newPlan(form).id);
  };
  const remove = (x) => {
    if (!window.confirm(fill(p.confirmDelete, { name: x.name }))) return false;
    deletePlan(x.id); setTick((n) => n + 1);
  };

  if (making) return (
    <div className="screen plans-new">
      <button className="btn-ghost small pz-back" onClick={() => setMaking(false)}><Icon name="prev" size={16} />{p.title}</button>
      <h2>{p.newTitle}</h2>
      <label className="pn-field">{p.name}
        <input value={form.name} placeholder={fill(p.namePh, { year: form.year })} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      </label>
      <div className="pn-field"><span>{p.forWho}</span>
        <div className="pn-levels" role="radiogroup" aria-label={p.forWho}>
          {Object.keys(LEVELS).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={form.level === k} className={form.level === k ? "on" : ""} onClick={() => setForm({ ...form, level: k })}>
              <b>{p.levels[k]}</b><small>{p.levelSub[k]}</small>
            </button>
          ))}
        </div>
        <small className="muted">{p.levelNote}</small>
      </div>
      <div className="pn-field"><span>{p.season}</span>
        <div className="seg" role="radiogroup" aria-label={p.season}>
          {[year, year + 1].map((y) => <button key={y} type="button" role="radio" aria-checked={form.year === y} className={form.year === y ? "active" : ""} onClick={() => setForm({ ...form, year: y })}>{y}</button>)}
        </div>
      </div>
      <button className="btn-primary wide-btn" onClick={create} disabled={!form.name.trim()}>{p.create}</button>
      <p className="muted">{p.afterCreate}</p>
    </div>
  );

  return (
    <div className="screen plans">
      <div className="plans-head">
        <h2>{p.title}</h2>
        <button className="btn-primary small" onClick={() => setMaking(true)}><Icon name="plus" size={18} />{p.new}</button>
      </div>
      {!plans.length && <div className="card"><p>{p.none}</p></div>}
      <div className="plans-list">
        {plans.map((x) => {
          const k = x.year === year ? x.weeks?.[week] : null;
          const next = compsIn(x.comps, x.year).filter((c) => c.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
          const inWeeks = next ? Math.max(0, Math.round((new Date(next.date) - new Date(today)) / 6048e5)) : null;
          return (
            <SwipeRow key={x.id} label={p.delete} onDelete={() => remove(x)}>
              <button type="button" className={`plan-card ${x.archers.length ? "" : "draft"}`} onClick={() => onOpen(x.id)}>
                <span className="plan-top">
                  <span><b>{x.name}</b><small>{k ? `${pl.phases[k]} · ${pl.wk}${week}` : x.year !== year ? String(x.year) : p.notStarted}</small></span>
                  <span className="plan-ppl" aria-label={fill(p.archersN, { n: x.archers.length })}>
                    {x.archers.slice(0, 3).map((id) => <i key={id}>{initials(byId[id]?.name || "?")}</i>)}
                    {x.archers.length > 3 && <i>+{x.archers.length - 3}</i>}
                  </span>
                </span>
                <span className="plan-strip" aria-hidden="true">
                  {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => <i key={w} className={x.year === year && w === week ? "now" : ""} style={{ background: x.weeks?.[w] ? COLORS[x.weeks[w]] : undefined }} />)}
                </span>
                <small className="muted">{!x.archers.length ? p.draft : next ? fill(p.next, { prio: next.priority, name: next.name, n: inWeeks }) : p.noComps}</small>
              </button>
            </SwipeRow>
          );
        })}
      </div>
      {plans.length > 0 && without.length > 0 && (
        <div className="card plans-without">
          <b>{fill(without.length === 1 ? p.withoutOne : p.withoutN, { n: without.length })}</b>
          <small className="muted">{without.map((a) => a.name).join(", ")}</small>
        </div>
      )}
      {plans.length > 0 && <p className="muted swipe-hint">{p.swipe}</p>}
    </div>
  );
}
