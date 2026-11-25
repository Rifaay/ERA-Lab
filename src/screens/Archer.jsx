import { getAthletes, getSessions, getAssessments, getGoals, planFor, getReviews, calcWACategory } from "../storage";
import { athleteFacts, daysSince } from "../insights";
import { reviewFacts } from "../review";
import Icon from "../icons";
import EndStrip from "../EndStrip";
import { isoDay as isoDayOf } from "../stats";
import { ArcherLink } from "./Live";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

function Row({ to, label, fact, sub, warn, fig, children, onGo }) {
  return (
  <button className="cycle-row" onClick={() => onGo(to)}>
    <span className="cycle-label">{label}</span>
    <span>
      <span className="cycle-fact" style={{ display: "block" }}>{fact}</span>
      {children}
      {sub && <span className={`cycle-sub ${warn ? "warn" : ""}`} style={{ display: "block" }}>{sub}</span>}
    </span>
    <span className="cycle-fig">{fig}</span>
    <Icon name="next" size={18} />
  </button>
  );
}

// One archer's coaching cycle on one screen: plan, range, assessment, goals, report. Each row opens its stage.
export default function Archer({ tr, lang, selectedId, onGo, onLink }) {
  const a = tr.archer, h = tr.home;
  const athlete = getAthletes().find((x) => x.id === selectedId);
  if (!athlete) return (
    <div className="screen"><div className="no-athlete"><div className="no-athlete-icon"><Icon name="archer" size={56} /></div><div className="no-athlete-text">{tr.session.noAthlete}</div></div></div>
  );

  const now = new Date();
  const f = athleteFacts(athlete, { sessions: getSessions(), assessments: getAssessments(), goals: getGoals() }, now);
  const rv = reviewFacts(getReviews(), athlete.id);
  const when = (days) => (days === 0 ? h.today : days === 1 ? h.yesterday : fill(h.daysAgo, { days }));
  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const shortDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "short" }); };

  // The planner numbers weeks 1 to 52 from 1 January.
  const week = Math.min(52, Math.floor((now - new Date(now.getFullYear(), 0, 1)) / (7 * 86400000)) + 1);
  const plan = planFor(athlete.id, now.getFullYear()); // the plan this archer follows this season, if any
  const phase = plan?.weeks?.[week];
  const todayIso = isoDayOf(now), nextEvent = (plan?.comps || []).filter((c) => c.date >= todayIso).sort((x, y) => x.date.localeCompare(y.date))[0];

  const stageNum = Number(athlete.stage || 0);
  const wa = calcWACategory(athlete.discipline, athlete.gender, athlete.ageBand);
  const meta = [`${fill(a.stage, { n: stageNum + 1 })} ${tr.profile.stages[stageNum]?.split("— ")[1] || ""}`.trim(),
    athlete.discipline === "barebow" ? tr.profile.barebow : tr.profile.recurve, wa].filter(Boolean).join(" · ");

  const goal = f.overdue[0] || [...f.openGoals].sort((x, y) => (x.dueDate || "9").localeCompare(y.dueDate || "9"))[0];
  const dueIn = goal?.dueDate ? -daysSince(goal.dueDate, now) : null;


  return (
    <div className="screen">
      <div className="archer-head">
        <h2>{athlete.name}</h2>
        <p>{meta}</p>
      </div>

      <div>
        <Row onGo={onGo} to="planner" label={a.plan}
          fact={plan ? `${plan.name}${phase ? ` · ${tr.planner.phases[phase] || phase}` : ""}` : a.noPlan}
          sub={nextEvent ? fill(a.nextComp, { name: nextEvent.name, date: nextEvent.date }) : plan ? null : a.planHint} />
        <Row onGo={onGo} to="session" label={a.range}
          fact={f.last ? [f.last.score ? `${f.last.score}${f.last.outOf ? ` / ${f.last.outOf}` : ""}` : f.last.type, when(f.lastDays)].join(" · ") : a.noSession}
          sub={f.last ? fill(a.sessions30, { n: f.sessions30 }) : a.noSessionHint}
          warn={f.reasons.some((r) => r.kind === "idle")}
          fig={f.avg != null ? f.avg.toFixed(2) : ""}>
          {f.lastEnd && <span style={{ display: "block", margin: "6px 0" }}><EndStrip scores={f.lastEnd} /></span>}
        </Row>
        <Row onGo={onGo} to="clips" label={a.review}
          fact={!rv.count ? a.noReview : rv.count === 1 ? a.reviewOne : fill(a.reviewMany, { n: rv.count })}
          sub={rv.waiting ? fill(a.clipsWaiting, { n: rv.waiting }) : !rv.count ? a.noReviewHint : rv.topFault ? fill(a.topFault, { name: rv.topFault.name, n: rv.topFault.count }) : a.noFaults}
          warn={rv.faulty > 0 && rv.faulty === rv.count}
          fig={rv.count || ""} />
        <Row onGo={onGo} to="rubric" label={a.assess}
          fact={f.rubric == null ? a.noRubric : f.prevRubric == null ? fill(a.rubricIs, { to: f.rubric.toFixed(1) }) : fill(a.rubricFrom, { to: f.rubric.toFixed(1), from: f.prevRubric.toFixed(1) })}
          sub={f.rubricDate ? fill(a.assessed, { when: when(daysSince(f.rubricDate, now)).toLowerCase() }) : null}
          warn={f.rubricTrend === "down"}
          fig={f.rubric != null ? f.rubric.toFixed(1) : ""} />
        <Row onGo={onGo} to="goals" label={a.goals}
          fact={goal ? goal.name : a.noGoals}
          sub={!goal ? null : f.overdue.length ? fill(a.overdue, { name: shortDate(goal.dueDate) }) : dueIn != null ? fill(a.due, { when: shortDate(goal.dueDate) }) : f.openGoals.length === 1 ? a.goalOne : fill(a.goalsOpen, { n: f.openGoals.length })}
          warn={f.overdue.length > 0}
          fig={f.openGoals.length || ""} />
        <Row onGo={onGo} to="stats" label={a.stats} fact={a.statsFact} sub={a.statsHint} />
        <Row onGo={onGo} to="report" label={a.report} fact={a.reportFact} sub={a.reportHint} />
      </div>

      <button className="btn-primary wide-btn" onClick={() => onGo("range")}><Icon name="target" size={22} />{a.start}</button>
      <button className="btn-ghost" style={{ width: "100%" }} onClick={() => onGo("profile")}>{a.profile}</button>
      <ArcherLink tr={tr} athlete={athlete} onChange={onLink} />
    </div>
  );
}
