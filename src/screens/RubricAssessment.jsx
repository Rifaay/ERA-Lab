import { useState } from "react";
import { getAthletes, getAssessments, saveAssessment, uid } from "../storage";
import { useApp } from "../context";
import { isoDay } from "../stats";

const DOMAIN_MAP = {
  recurve: {
    technical:   ["Stance", "Hook", "Grip", "Set-up", "Draw", "Anchor", "Transfer / Hold", "Aim", "Release", "Follow-through"],
    physical:    ["Core stability", "Draw weight capacity", "Shoulder endurance", "Fitness level"],
    mental:      ["Focus / concentration", "Pre-shot routine", "Competition nerves", "Resilience"],
    competition: ["Strategy", "Score management", "Pressure performance", "Adaptability"],
  },
  barebow: {
    technical:   ["Stance", "Hook", "Grip", "Set-up", "Draw", "Anchor", "Transfer / Hold", "Aim", "Release", "Follow-through", "String Walking", "Face Walking", "Barebow Aiming System"],
    physical:    ["Core stability", "Draw weight capacity", "Shoulder endurance", "Fitness level"],
    mental:      ["Focus / concentration", "Pre-shot routine", "Competition nerves", "Resilience"],
    competition: ["Strategy", "Score management", "Pressure performance", "Adaptability"],
  },
};


export default function RubricAssessment({ tr, selectedId }) {
  const r = tr.rubric;
  const { setSelectedId } = useApp();
  const athletes = getAthletes();
  const athlete = athletes.find((a) => a.id === selectedId) || null;
  const discipline = athlete?.discipline || "recurve";

  const [tab, setTab] = useState("technical");
  const [date, setDate] = useState(isoDay(new Date()));
  const [scores, setScores] = useState({});
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState(() => getAssessments().filter((a) => a.athleteId === selectedId).reverse().slice(0, 5));

  const setScore = (key, val) => setScores((s) => ({ ...s, [key]: val }));

  const domainAvg = (domain) => {
    const els = DOMAIN_MAP[discipline][domain] || [];
    const vals = els.map((e) => scores[`${domain}__${e}`]).filter(Boolean);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
  };

  const overallAvg = () => {
    const all = Object.values(scores).filter(Boolean);
    return all.length ? (all.reduce((a, b) => a + b, 0) / all.length).toFixed(2) : null;
  };

  const handleSave = () => {
    if (saved) return; // a double tap must not create two assessments
    saveAssessment({ id: uid(), athleteId: selectedId, date, scores, discipline });
    setHistory(getAssessments().filter((a) => a.athleteId === selectedId).reverse().slice(0, 5));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // No archer chosen yet: list everyone with a profile so the coach picks who to assess here.
  if (!athlete) return (
    <div className="screen">
      <h2>{r.title}</h2>
      <div className="card">
        <h3>{r.pickArcher}</h3>
        {athletes.map((a) => (
          <button key={a.id} className="picker-row" onClick={() => setSelectedId(a.id)}>
            <b>{a.name}</b>
            <small>{tr.archer.stage.replace("{n}", Number(a.stage || 0) + 1)} · {a.discipline === "barebow" ? tr.profile.barebow : tr.profile.recurve}</small>
          </button>
        ))}
        {!athletes.length && <p>{tr.shell.noArchers}</p>}
      </div>
    </div>
  );

  const domains = Object.keys(DOMAIN_MAP[discipline]);
  const elements = DOMAIN_MAP[discipline][tab] || [];

  return (
    <div className="screen">
      <h2>{r.title}</h2>

      <div className="card">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <label style={{ margin: 0 }}>{r.date}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} />
          </label>
          {overallAvg() && <span className="badge lime">Avg: {overallAvg()}</span>}
        </div>

        {/* Domain tabs */}
        <div className="tabs">
          {domains.map((d) => {
            const avg = domainAvg(d);
            return (
              <button key={d} className={`tab ${tab === d ? "active" : ""}`} onClick={() => setTab(d)}>
                {r.domains[d]} {avg && <span style={{ opacity: .7 }}>({avg})</span>}
              </button>
            );
          })}
        </div>

        {/* Elements */}
        <div className="rubric-grid">
          {elements.map((el) => {
            const key = `${tab}__${el}`;
            const cur = scores[key] || 0;
            return (
              <div key={el} className="rubric-item">
                <span className="rubric-label">{(tab === "technical" ? tr.rubric[discipline === "barebow" ? "bareboweElements" : "recurveElements"] : tr.rubric.elements[tab])?.[elements.indexOf(el)] ?? el}</span>
                <div className="rubric-score">
                  {[1,2,3,4,5].map((n) => (
                    <button
                      key={n}
                      className={`score-btn ${cur === n ? "selected" : ""}`}
                      onClick={() => setScore(key, n)}
                    >{n}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={handleSave}>{r.save}</button>
        </div>
        {saved && <p className="success-msg">{r.saved}</p>}
      </div>

      {/* History */}
      {history.length > 0 && (
        <>
          <h3 style={{ color: "var(--txm)", marginTop: 4, marginBottom: 8 }}>{r.history}</h3>
          {history.map((a) => {
            const vals = Object.values(a.scores || {}).filter(Boolean);
            const avg = vals.length ? (vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(2) : "—";
            return (
              <div key={a.id} className="card" style={{ padding: "8px 12px", marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="badge gray">{a.date}</span>
                  <span className="badge lime">{r.average}: {avg}</span>
                  <span className="badge blue">{a.discipline === "barebow" ? "BB" : "RC"}</span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
