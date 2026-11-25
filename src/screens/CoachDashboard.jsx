import { useMemo } from "react";
import { getAthletes, getSessions, getAssessments, getGoals, getPlans } from "../storage";
import { isoDay } from "../stats";
import { dayFilled } from "../plan";
import { roster } from "../insights";
import Icon from "../icons";
import EndStrip from "../EndStrip";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const one = (n) => n.toFixed(1), two = (n) => n.toFixed(2);

// Today: who is shooting now, who needs the coach and why, and what is planned today. Everyone else is in Archers.
export default function CoachDashboard({ tr, lang, tick, live = [], onOpen, onGo, onPlan, onNew, onLive, onAll }) {
  const h = tr.home, t = tr.today;
  const { need, total } = useMemo(() => {
    const athletes = getAthletes();
    return { ...roster(athletes, { sessions: getSessions(), assessments: getAssessments(), goals: getGoals() }), total: athletes.length };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const planned = useMemo(() => {
    const iso = isoDay(new Date()), year = +iso.slice(0, 4);
    // Each plan of this season that has archers: today's session, or a rest day; and its competitions in the next 30 days.
    const names = Object.fromEntries(getAthletes().map((a) => [a.id, a.name]));
    return getPlans().filter((p) => p.year === year && p.archers.length).map((p) => ({ p, d: p.days?.[iso], who: p.archers.map((id) => names[id]).filter(Boolean),
      comps: (p.comps || []).filter((c) => c.date >= iso && (new Date(c.date) - new Date(iso)) / 864e5 <= 30) }));
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const today = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const shortDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "short" }); };

  if (!total) return (
    <div className="screen">
      <div className="empty">
        <Icon name="archer" size={56} />
        <h2>{h.emptyTitle}</h2>
        <p>{h.emptyText}</p>
        <button className="btn-primary" onClick={onNew}><Icon name="plus" size={18} />{h.emptyAction}</button>
      </div>
    </div>
  );

  // Each reason names what to do about it, and where.
  const why = (r) => ({
    none:   [h.whyNone, "range"],
    idle:   [fill(h.whyIdle, { days: r.days }), "planner"],
    rubric: [fill(h.whyRubric, { from: one(r.from ?? 0), to: one(r.to ?? 0) }), "rubric"],
    goal:   [fill(h.whyGoal, { name: r.name }), "goals"],
    score:  [fill(h.whyScore, { from: two(r.from ?? 0), to: two(r.to ?? 0) }), "session"],
  })[r.kind];


  return (
    <div className="screen flush">
      <div className="hero">
        <h2>{need.length === 0 ? h.needNone : need.length === 1 ? h.needOne : fill(h.needMany, { n: need.length })}</h2>
        <p>{today} · {total === 1 ? h.rosterOne : fill(h.rosterMany, { n: total })}</p>
      </div>

      <div className="list">
        {live.length > 0 && (
          <button className="today-live" onClick={onLive}>
            <span className="live-dot" />
            <span className="grow"><b>{fill(t.shooting, { names: live.map((x) => x.athlete.name).join(", ") })}</b><small>{t.shootingSub}</small></span>
            <Icon name="next" size={18} />
          </button>
        )}
        {need.length > 0 && <h3>{h.needs}</h3>}
        {need.map((f) => {
          const [text, to] = why(f.reasons[0]);
          return (
            <div key={f.athlete.id} className="row">
              <button className="row-main" onClick={() => onOpen(f.athlete.id)}>
                <span className="row-name">{f.athlete.name}</span>
                <span className="row-why">{text}{f.reasons.length > 1 && ` · ${fill(h.more, { n: f.reasons.length - 1 })}`}</span>
              </button>
              <button className="btn-ghost small" onClick={() => onGo(f.athlete.id, to)}>{h.act[to]}</button>
              {f.lastEnd && <span className="row-strip"><EndStrip scores={f.lastEnd} />{fill(h.lastEnd, { date: shortDate(f.lastEndDate) })}</span>}
            </div>
          );
        })}

        <h3>{t.planned}</h3>
        {planned.map(({ p, d, who }) => (
          <button key={p.id} className="today-plan" onClick={() => onPlan(p.id)}>
            <span className="today-plan-top"><b>{p.name}</b><span className="today-ppl" aria-label={who.join(", ")}>{who.slice(0, 4).map((n) => <i key={n}>{n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</i>)}</span></span>
            <span className={dayFilled(d) ? "" : "muted"}>{dayFilled(d) ? [d.focus, +d.arrows ? fill(t.arrows, { n: d.arrows }) : ""].filter(Boolean).join(" · ") || d.note : t.rest}</span>
          </button>
        ))}
        {planned.some((x) => x.comps.length) && <>
          <h3>{t.compsSoon}</h3>
          {planned.flatMap(({ p, comps }) => comps.map((c) => (
            <button key={p.id + c.date + c.name} className="row" onClick={() => onPlan(p.id)}>
              <span><span className="row-name" style={{ display: "block" }}>{c.priority} · {c.name}</span><span className="row-line">{c.date} · {p.name}</span></span>
              <Icon name="next" size={18} />
            </button>
          )))}
        </>}
        {!planned.length && <p className="muted">{t.nothingPlanned}</p>}
        <button className="btn-ghost" style={{ marginTop: 16 }} onClick={onAll}>{t.allArchers} · {total}</button>
      </div>
    </div>
  );
}
