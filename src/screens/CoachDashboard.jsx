import { useMemo } from "react";
import { getAthletes, getSessions, getAssessments, getGoals, getPlan } from "../storage";
import { isoDay } from "../stats";
import { dayFilled } from "../plan";
import { roster } from "../insights";
import Icon from "../icons";
import EndStrip from "../EndStrip";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const one = (n) => n.toFixed(1), two = (n) => n.toFixed(2);

// Today: who is shooting now, who needs the coach and why, and what is planned today. Everyone else is in Archers.
export default function CoachDashboard({ tr, lang, tick, live = [], onOpen, onGo, onNew, onLive, onAll }) {
  const h = tr.home, t = tr.today;
  const { need, total } = useMemo(() => {
    const athletes = getAthletes();
    return { ...roster(athletes, { sessions: getSessions(), assessments: getAssessments(), goals: getGoals() }), total: athletes.length };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const planned = useMemo(() => {
    const iso = isoDay(new Date()), year = +iso.slice(0, 4);
    return getAthletes().map((a) => ({ a, d: getPlan(a.id, year).days?.[iso] })).filter((x) => dayFilled(x.d));
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
        {planned.map(({ a, d }) => (
          <button key={a.id} className="row" onClick={() => onGo(a.id, "planner")}>
            <span>
              <span className="row-name" style={{ display: "block" }}>{a.name}</span>
              <span className="row-line">{[d.focus, +d.arrows ? fill(t.arrows, { n: d.arrows }) : ""].filter(Boolean).join(" · ") || d.note}</span>
            </span>
            <Icon name="next" size={18} />
          </button>
        ))}
        {!planned.length && <p className="muted">{t.nothingPlanned}</p>}
        <button className="btn-ghost" style={{ marginTop: 16 }} onClick={onAll}>{t.allArchers} · {total}</button>
      </div>
    </div>
  );
}
