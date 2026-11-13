import { useState, useMemo } from "react";
import { getAthletes, getPlan, savePlan, uid } from "../storage";
import Icon from "../icons";

const PHASES = [
  { key: "gpp",        color: "#3498db" },
  { key: "spp",        color: "#9b59b6" },
  { key: "precomp",    color: "#f39c12" },
  { key: "comp",       color: "#e74c3c" },
  { key: "transition", color: "#2ecc71" },
  { key: "accum",      color: "#1abc9c" },
  { key: "intens",     color: "#e67e22" },
  { key: "realiz",     color: "#e74c3c" },
  { key: "taper",      color: "#95a5a6" },
];

function getWeekMondayISO(year, week) {
  const d = new Date(year, 0, 1 + (week - 1) * 7);
  const day = d.getDay();
  const offset = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).replace(" ", "");
}

export default function PeriodizationPlanner({ lang, tr, selectedId }) {
  const pl = tr.planner;
  const athletes = getAthletes();
  const athlete = athletes.find((a) => a.id === selectedId) || null;

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [plan, setPlan] = useState(() => getPlan(selectedId, year));
  const [armed, setArmed] = useState(null);
  const [saved, setSaved] = useState(false);
  const [tourName, setTourName] = useState("");
  const [tourWeek, setTourWeek] = useState("");

  const loadPlan = (y) => { setPlan(getPlan(selectedId, y)); setYear(y); };

  const paintWeek = (w) => {
    if (!armed) return;
    const weeks = { ...plan.weeks };
    if (weeks[w] === armed) delete weeks[w]; else weeks[w] = armed;
    setPlan((p) => ({ ...p, weeks }));
  };

  const clearAll = () => setPlan((p) => ({ ...p, weeks: {} }));

  const handleSave = () => {
    savePlan(plan);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addTournament = () => {
    if (!tourName || !tourWeek) return;
    const t = { id: uid(), name: tourName, week: Number(tourWeek) };
    setPlan((p) => ({ ...p, tournaments: [...(p.tournaments || []), t] }));
    setTourName(""); setTourWeek("");
  };

  const removeTournament = (id) => setPlan((p) => ({ ...p, tournaments: p.tournaments.filter((t) => t.id !== id) }));

  // Ramadan weeks for current year (approximate)
  const RAMADAN = useMemo(() => {
    if (year === 2026) return [9, 10, 11, 12, 13];
    if (year === 2025) return [1, 2, 3, 4, 5];
    return [];
  }, [year]);

  if (!athlete) return (
    <div className="screen">
      <div className="no-athlete">
        <div className="no-athlete-icon"><Icon name="calendar" size={56} /></div>
        <div className="no-athlete-text">{pl.noAthlete}</div>
      </div>
    </div>
  );

  const phaseMap = Object.fromEntries(PHASES.map((p) => [p.key, p]));

  return (
    <div className="screen">
      <div className="card-header" style={{ marginBottom: 12 }}>
        <h2>{pl.title} — {athlete.name}</h2>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select value={year} onChange={(e) => loadPlan(Number(e.target.value))} style={{ width: "auto" }}>
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => <option key={y}>{y}</option>)}
          </select>
          <button className="btn-ghost small" onClick={clearAll}>{pl.clear}</button>
          <button className="btn-primary small" onClick={handleSave}>{pl.save}</button>
        </div>
      </div>
      {saved && <p className="success-msg">{pl.saved}</p>}

      {/* Phase palette */}
      <p className="muted" style={{ marginBottom: 6, fontSize: 12 }}>{pl.clickHint}</p>
      <div className="phase-palette">
        {PHASES.map((ph) => (
          <button
            key={ph.key}
            className={`phase-chip ${armed === ph.key ? "armed" : ""}`}
            style={{ background: ph.color + "22", color: ph.color, borderColor: ph.color }}
            onClick={() => setArmed(armed === ph.key ? null : ph.key)}
          >{pl.phases[ph.key]}</button>
        ))}
        {armed && (
          <button className="btn-ghost small" onClick={() => setArmed(null)}><Icon name="x" size={16} />{armed}</button>
        )}
      </div>

      {/* 52-week grid */}
      <div className="week-grid" style={{ marginBottom: 16 }}>
        {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
          const phase = plan.weeks[w];
          const ph = phase ? phaseMap[phase] : null;
          const isTour = (plan.tournaments || []).some((t) => t.week === w);
          const isRam = RAMADAN.includes(w);
          return (
            <div
              key={w}
              className="week-cell"
              style={ph ? { background: ph.color + "33", borderColor: ph.color } : {}}
              onClick={() => paintWeek(w)}
            >
              <span className="wk-num" style={{ color: ph ? ph.color : "var(--txm)" }}>W{w}</span>
              <span className="wk-date" style={{ color: "var(--txh)" }}>{getWeekMondayISO(year, w)}</span>
              {isTour && <span className="wk-dot" title="Tournament">🏆</span>}
              {isRam && !isTour && <span className="wk-dot" title="Ramadan"><Icon name="moon" size={10} /></span>}
            </div>
          );
        })}
      </div>

      {/* Tournaments */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{pl.tournaments}</span>
        </div>
        <div className="form-row" style={{ marginBottom: 8 }}>
          <label style={{ flex: 2 }}>{pl.tournamentName}
            <input value={tourName} onChange={(e) => setTourName(e.target.value)} />
          </label>
          <label>{pl.tournamentWeek}
            <input type="number" value={tourWeek} onChange={(e) => setTourWeek(e.target.value)} min="1" max="52" />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 0 }}>
            <button className="btn-primary small" style={{ marginTop: 18 }} onClick={addTournament}>{pl.add}</button>
          </div>
        </div>
        {(plan.tournaments || []).length === 0 ? (
          <p className="muted">No tournaments added.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(plan.tournaments || []).map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "var(--bgp)", borderRadius: "var(--rad)" }}>
                <span className="badge amber">W{t.week}</span>
                <span style={{ fontSize: 13, flex: 1 }}>{t.name}</span>
                <button className="del-btn" onClick={() => removeTournament(t.id)}><Icon name="x" size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
        {PHASES.map((ph) => (
          <span key={ph.key} className="badge" style={{ background: ph.color + "22", color: ph.color }}>
            {pl.phases[ph.key]}
          </span>
        ))}
      </div>
    </div>
  );
}
