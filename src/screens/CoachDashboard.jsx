import { useMemo } from "react";
import { getAthletes, getSessions, getAssessments, getGoals } from "../storage";
import { roster } from "../insights";
import Icon from "../icons";
import EndStrip from "../EndStrip";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const one = (n) => n.toFixed(1), two = (n) => n.toFixed(2);

// Home: who needs the coach this week, and why. Then everyone on track.
export default function CoachDashboard({ tr, lang, tick, onOpen, onGo, onNew }) {
  const h = tr.home;
  const { need, onTrack, total } = useMemo(() => {
    const athletes = getAthletes();
    return { ...roster(athletes, { sessions: getSessions(), assessments: getAssessments(), goals: getGoals() }), total: athletes.length };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const today = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  const shortDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "short" }); };
  const when = (days) => (days === 0 ? h.today : days === 1 ? h.yesterday : fill(h.daysAgo, { days }));

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

  const sessionLine = (f) => !f.last ? h.whyNone
    : [when(f.lastDays), f.last.score ? `${f.last.score}${f.last.outOf ? ` / ${f.last.outOf}` : ""}` : null, +f.last.arrows ? fill(h.arrows, { n: f.last.arrows }) : null].filter(Boolean).join(" · ");

  return (
    <div className="screen flush">
      <div className="hero">
        <h2>{need.length === 0 ? h.needNone : need.length === 1 ? h.needOne : fill(h.needMany, { n: need.length })}</h2>
        <p>{today} · {total === 1 ? h.rosterOne : fill(h.rosterMany, { n: total })}</p>
      </div>

      <div className="list">
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

        {onTrack.length > 0 && <h3>{h.onTrack}</h3>}
        {onTrack.map((f) => (
          <button key={f.athlete.id} className="row" onClick={() => onOpen(f.athlete.id)}>
            <span>
              <span className="row-name" style={{ display: "block" }}>{f.athlete.name}</span>
              <span className="row-line">{sessionLine(f)}</span>
            </span>
            {f.avg != null
              ? <span className={`row-fig ${f.trend === "down" ? "down" : ""}`}>{two(f.avg)}{f.trend && <Icon name={f.trend === "up" ? "up" : f.trend === "down" ? "fall" : "flat"} size={20} label={h[f.trend]} />}</span>
              : <span className="row-line">{h.noScore}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
