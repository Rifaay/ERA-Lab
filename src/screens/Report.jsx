import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getAthletes, getSessions, getReviews, getAssessments, getGoals, getProgressLogs, getSettings, calcWACategory } from "../storage";
import { periodOf, shiftPeriod, isoDay } from "../stats";
import { reportData } from "../report";
import { useApp } from "../context";
import ArcherSelect from "../ArcherSelect";
import ReportDoc from "./ReportDoc";
import Icon from "../icons";
import "./report.css";

const KINDS = ["week", "month", "year", "custom", "all"];
const SECTIONS = ["points", "map", "progress", "technique", "video", "goals", "sessions"];

// The archer report: choose the archer, the period and the sections; the page below is the report itself.
// Save as PDF prints only that page (A4), never the app around it.
export default function Report({ tr, lang, selectedId }) {
  const rp = tr.rp;
  const { setSelectedId } = useApp();
  const athletes = getAthletes();
  const athlete = athletes.find((a) => a.id === selectedId);
  const sessions = useMemo(() => getSessions().filter((x) => x.athleteId === selectedId), [selectedId]);
  const today = isoDay(new Date());
  const latest = sessions.map((x) => x.date).sort().at(-1) || today;
  const first = sessions.map((x) => x.date).sort()[0] || today;

  const [kind, setKind] = useState("month");
  const [anchor, setAnchor] = useState(latest);
  const [custom, setCustom] = useState({ from: first, to: latest });
  const [show, setShow] = useState(SECTIONS);

  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const date = (iso, o = { day: "numeric", month: "short", year: "numeric" }) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(locale, o); };
  const base = kind === "custom" ? { kind, ...custom } : periodOf(kind, kind === "all" ? today : anchor, { first });
  const label = kind === "month" ? date(base.from, { month: "long", year: "numeric" }) : kind === "year" ? base.from.slice(0, 4) : `${date(base.from)} – ${date(base.to)}`;
  const period = { ...base, label };
  const valid = period.from <= period.to;
  const d = useMemo(() => athlete && valid && reportData(period, { athlete, sessions, reviews: getReviews(), assessments: getAssessments(), goals: getGoals(), logs: getProgressLogs() }),
    [athlete, period.from, period.to, sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (dir) => {
    const q = shiftPeriod(base, dir, { first });
    if (!q) return;
    if (kind === "custom") setCustom({ from: q.from, to: q.to }); else setAnchor(q.from);
  };
  const print = () => {
    const title = document.title;
    document.title = `ERA Lab report ${athlete.name} ${period.from} ${period.to}`; // the PDF's suggested file name
    document.documentElement.classList.add("rd-printing");
    const done = () => { document.documentElement.classList.remove("rd-printing"); document.title = title; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  };
  const toggle = (k) => setShow(show.includes(k) ? show.filter((x) => x !== k) : [...show, k]);
  const doc = d && <ReportDoc d={d} athlete={athlete} tr={tr} lang={lang} show={show} coach={getSettings().coachName}
    waCategory={calcWACategory(athlete.discipline, athlete.gender, athlete.ageBand)} />;

  return (
    <div className="screen rp">
      <h2>{rp.title}</h2>
      <ArcherSelect tr={tr} athletes={athletes} selectedId={selectedId} onPick={setSelectedId} prompt={rp.pick} />

      {athlete && (
        <>
          <div className="rp-controls">
            <div className="st-kinds" role="tablist" aria-label={tr.stats.periodLabel}>
              {KINDS.map((k) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{rp.kinds[k]}</button>)}
            </div>
            {kind === "custom" ? (
              <div className="rp-dates">
                <label>{rp.from}<input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /></label>
                <label>{rp.to}<input type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></label>
              </div>
            ) : (
              <div className="st-period">
                <button className="icon-btn" onClick={() => step(-1)} disabled={kind === "all"} aria-label={tr.stats.prev}><Icon name="prev" /></button>
                <div><h3>{label}</h3></div>
                <button className="icon-btn" onClick={() => step(1)} disabled={kind === "all" || period.to >= today} aria-label={tr.stats.next}><Icon name="next" /></button>
              </div>
            )}
            <fieldset className="rp-sections">
              <legend>{rp.include}</legend>
              {SECTIONS.map((k) => <button key={k} type="button" className={`chip ${show.includes(k) ? "active" : ""}`} aria-pressed={show.includes(k)} onClick={() => toggle(k)}>{show.includes(k) && <Icon name="check" size={14} />}{rp.sections[k]}</button>)}
            </fieldset>
            <button className="btn-primary rp-save" onClick={print} disabled={!d}><Icon name="download" size={20} />{rp.save}</button>
            <p className="st-note">{rp.saveHint}</p>
          </div>

          {!valid ? <p className="muted">{rp.badRange}</p> : <div className="rp-paper" key={`${period.from}|${period.to}`}>{doc}</div>}
          {doc && createPortal(<div className="rd-print-root">{doc}</div>, document.body)}
        </>
      )}
    </div>
  );
}
