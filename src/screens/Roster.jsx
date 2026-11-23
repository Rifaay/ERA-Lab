import { useMemo, useState } from "react";
import { getAthletes, getSessions, getAssessments, getGoals } from "../storage";
import { roster } from "../insights";
import { isLinked } from "../archer";
import { isAdult } from "../sync";
import Icon from "../icons";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

// Archers tab: everyone the coach trains, those who need the coach first. Tapping one opens their page.
export default function Roster({ tr, lang, tick, live = [], onOpen, onNew }) {
  const r = tr.roster, h = tr.home;
  const [q, setQ] = useState("");
  const [show, setShow] = useState("all"); // all | need | linked
  const { rows, counts } = useMemo(() => {
    const { need, onTrack } = roster(getAthletes(), { sessions: getSessions(), assessments: getAssessments(), goals: getGoals() });
    const all = [...need, ...onTrack];
    return { rows: all, counts: { all: all.length, need: need.length, linked: all.filter((f) => isLinked(f.athlete.id)).length } };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const shooting = new Set(live.map((x) => x.athlete.id));
  const shown = rows.filter((f) => f.athlete.name.toLowerCase().includes(q.trim().toLowerCase())
    && (show === "all" || (show === "need" ? f.reasons.length : isLinked(f.athlete.id))));
  const line = (f) => {
    if (shooting.has(f.athlete.id)) return r.live;
    if (f.reasons.length) return null;
    if (!isAdult(f.athlete.dob)) return r.minor;
    const day = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short" }); };
    return f.last ? [f.last.date && day(f.last.date), f.last.score && `${f.last.score}${f.last.outOf ? ` / ${f.last.outOf}` : ""}`].filter(Boolean).join(" · ") : h.whyNone;
  };
  const reason = (x) => ({ none: h.whyNone, idle: fill(h.whyIdle, { days: x.days }), rubric: fill(h.whyRubric, { from: (x.from ?? 0).toFixed(1), to: (x.to ?? 0).toFixed(1) }),
    goal: fill(h.whyGoal, { name: x.name }), score: fill(h.whyScore, { from: (x.from ?? 0).toFixed(2), to: (x.to ?? 0).toFixed(2) }) })[x.kind];

  return (
    <div className="screen">
      <div className="picker-search roster-search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={r.search} aria-label={r.search} />
      </div>
      <div className="seg roster-filter" role="tablist">
        {["all", "need", "linked"].map((k) => (
          <button key={k} type="button" role="tab" aria-selected={show === k} className={show === k ? "active" : ""} onClick={() => setShow(k)}>{fill(r[k], { n: counts[k] })}</button>
        ))}
      </div>
      <div className="list">
        {shown.map((f) => (
          <button key={f.athlete.id} className="row" onClick={() => onOpen(f.athlete.id)}>
            <span>
              <span className="row-name" style={{ display: "block" }}>{f.athlete.name} <span className="stage-tag">S{Number(f.athlete.stage || 0) + 1}</span></span>
              {f.reasons.length ? <span className="row-why">{reason(f.reasons[0])}</span> : <span className={`row-line ${shooting.has(f.athlete.id) ? "live-line" : ""}`}>{line(f)}</span>}
            </span>
            {f.avg != null && <span className={`row-fig ${f.trend === "down" ? "down" : ""}`}>{f.avg.toFixed(2)}{f.trend && <Icon name={f.trend === "up" ? "up" : f.trend === "down" ? "fall" : "flat"} size={20} label={h[f.trend]} />}</span>}
          </button>
        ))}
        {!shown.length && <p className="muted">{r.none}</p>}
      </div>
      <button className="btn-ghost" onClick={onNew}><Icon name="plus" size={18} />{r.add}</button>
    </div>
  );
}
