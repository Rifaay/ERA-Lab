import { useState } from "react";
import { getAthletes, getAssessments, saveAssessment, uid } from "../storage";

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

const DOMAIN_COLORS = { technical: "#40A0FF", physical: "#FFC020", mental: "#D4FF00", competition: "#00E5A0" };

function ScoreBtn({ val, current, onClick }) {
  return (
    <button
      className={`score-btn ${current === val ? "selected" : ""}`}
      onClick={() => onClick(val)}
      style={current === val ? { background: DOMAIN_COLORS["technical"] || "var(--p)", color: "var(--bgp)" } : {}}
    >{val}</button>
  );
}

export default function RubricAssessment({ lang, tr, selectedId }) {
  const r = tr.rubric;
  const athletes = getAthletes();
  const athlete = athletes.find((a) => a.id === selectedId) || null;
  const discipline = athlete?.discipline || "recurve";

  const [tab, setTab] = useState("technical");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
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

  if (!athlete) return (
    <div className="screen">
      <div className="no-athlete">
        <div className="no-athlete-icon">📊</div>
        <div className="no-athlete-text">{r.noAthlete || "Select an athlete first."}</div>
      </div>
    </div>
  );

  const domains = Object.keys(DOMAIN_MAP[discipline]);
  const elements = DOMAIN_MAP[discipline][tab] || [];

  return (
    <div className="screen">
      <h2>{r.title} — {athlete.name}</h2>

      <div className="card">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8, margin: 0, textTransform: "none", letterSpacing: 0 }}>
            <span style={{ fontSize: 12, color: "var(--txm)", fontWeight: 600 }}>{r.date}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto", marginTop: 0 }} />
          </label>
          {overallAvg() && <span className="badge lime">Avg: {overallAvg()}</span>}
        </div>

        {/* Domain tabs */}
        <div className="tabs">
          {domains.map((d) => {
            const avg = domainAvg(d);
            return (
              <button key={d} className={`tab ${tab === d ? "active" : ""}`} onClick={() => setTab(d)}
                style={tab === d ? { color: DOMAIN_COLORS[d] || "var(--p)" } : {}}>
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
                <span className="rubric-label">{el}</span>
                <div className="rubric-score">
                  {[1,2,3,4,5].map((n) => (
                    <button
                      key={n}
                      className={`score-btn ${cur === n ? "selected" : ""}`}
                      style={cur === n ? { background: DOMAIN_COLORS[tab] || "var(--p)", color: "var(--bgp)", borderColor: DOMAIN_COLORS[tab] || "var(--p)" } : {}}
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
