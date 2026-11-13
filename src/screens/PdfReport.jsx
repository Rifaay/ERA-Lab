import { useState } from "react";
import { getAthletes, getSessions, getAssessments, getGoals, getExercises, getProgressLogs, calcWACategory } from "../storage";
import Icon from "../icons";

export default function PdfReport({ lang, tr, selectedId }) {
  const rp = tr.report;
  const pr = tr.profile;
  const athletes = getAthletes();
  const athlete = athletes.find((a) => a.id === selectedId) || null;

  const [sections, setSections] = useState({ profile: true, rubric: true, goals: true, sessions: true, exercises: false });
  const [generated, setGenerated] = useState(false);

  const toggleSection = (k) => setSections((s) => ({ ...s, [k]: !s[k] }));

  if (!athlete) return (
    <div className="screen">
      <div className="no-athlete">
        <div className="no-athlete-icon"><Icon name="file" size={56} /></div>
        <div className="no-athlete-text">{rp.noAthlete}</div>
      </div>
    </div>
  );

  const sessions    = getSessions().filter((s) => s.athleteId === selectedId);
  const assessments = getAssessments().filter((a) => a.athleteId === selectedId);
  const goals       = getGoals().filter((g) => g.athleteId === selectedId);
  const exercises   = getExercises().filter((e) => e.athleteId === selectedId);
  const logs        = getProgressLogs();

  const sorted = [...assessments].sort((a, b) => b.date.localeCompare(a.date));
  const latestAssessment = sorted[0] || null;
  const rubricAvg = latestAssessment
    ? (() => { const v = Object.values(latestAssessment.scores || {}).filter(Boolean); return v.length ? (v.reduce((a,b)=>a+b,0)/v.length).toFixed(2) : null; })()
    : null;

  const waCategory = calcWACategory(athlete.discipline, athlete.gender, athlete.ageBand);
  const today = new Date().toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB");

  const Report = () => (
    <div id="racm-report" style={{ background: "#fff", color: "#111", padding: 24, fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 13, lineHeight: 1.6, borderRadius: 6 }}>
      {/* Header */}
      <div style={{ borderBottom: "3px solid #D4FF00", paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "#141418" }}>RACM — Rifaay Archery Coaching</div>
        <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>{rp.generatedOn}: {today}</div>
      </div>

      {/* Profile */}
      {sections.profile && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "#D4FF00", background: "#141418", padding: "4px 10px", borderRadius: 4, marginBottom: 10, display: "inline-block" }}>
            {rp.sections.profile}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {[
                [pr.name, athlete.name],
                [pr.discipline, athlete.discipline === "barebow" ? pr.barebow : pr.recurve],
                [pr.stage, pr.stages[Number(athlete.stage || 0)]],
                [pr.ageBand, athlete.ageBand ? pr.ageBands[athlete.ageBand] : "—"],
                [pr.waCategory, waCategory || "—"],
                [pr.gender, athlete.gender ? pr.genders[athlete.gender] : "—"],
                [pr.startDate, athlete.startDate || "—"],
              ].map(([label, val]) => (
                <tr key={label} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "5px 8px", color: "#666", width: "40%" }}>{label}</td>
                  <td style={{ padding: "5px 8px", fontWeight: 600 }}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {athlete.coachNotes && <p style={{ marginTop: 8, color: "#444", fontStyle: "italic", padding: "8px", background: "#f8f8f8", borderRadius: 4 }}>{athlete.coachNotes}</p>}
        </section>
      )}

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          [rp.totalSessions, sessions.length],
          [rp.rubricAvg, rubricAvg || "—"],
          [rp.activeGoals, goals.length],
        ].map(([label, val]) => (
          <div key={label} style={{ flex: 1, minWidth: 80, background: "#f8f8f8", border: "1px solid #ddd", borderRadius: 6, padding: "10px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#141418" }}>{val}</div>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Rubric */}
      {sections.rubric && latestAssessment && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "#D4FF00", background: "#141418", padding: "4px 10px", borderRadius: 4, marginBottom: 10, display: "inline-block" }}>
            {rp.sections.rubric}
          </div>
          <p style={{ fontSize: 12, color: "#444", marginBottom: 8 }}>{tr.rubric.date}: {latestAssessment.date} · {rp.rubricAvg}: {rubricAvg}</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <tbody>
              {Object.entries(latestAssessment.scores || {}).slice(0, 15).map(([key, val]) => {
                const label = key.replace(/^\w+__/, "");
                return (
                  <tr key={key} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "4px 8px", color: "#444" }}>{label}</td>
                    <td style={{ padding: "4px 8px" }}>
                      <div style={{ width: `${val * 20}%`, height: 8, background: "#D4FF00", borderRadius: 4 }} />
                    </td>
                    <td style={{ padding: "4px 8px", fontWeight: 700, width: 30 }}>{val}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Goals */}
      {sections.goals && goals.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "#D4FF00", background: "#141418", padding: "4px 10px", borderRadius: 4, marginBottom: 10, display: "inline-block" }}>
            {rp.sections.goals}
          </div>
          {goals.map((g) => {
            const gLogs = logs.filter((l) => l.goalId === g.id);
            const latest = gLogs.length ? gLogs[gLogs.length - 1].value : null;
            const range = g.target - g.baseline;
            const pct = latest !== null && range !== 0 ? Math.min(100, Math.max(0, Math.round(((latest - g.baseline) / range) * 100))) : null;
            return (
              <div key={g.id} style={{ marginBottom: 10, padding: "10px", background: "#f8f8f8", borderRadius: 4 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{g.name} <span style={{ fontSize: 10, color: "#888", textTransform: "uppercase" }}>({g.type})</span></div>
                {g.specific && <p style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>{g.specific}</p>}
                {pct !== null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 8, background: "#ddd", borderRadius: 4 }}>
                      <div style={{ width: `${pct}%`, height: 8, background: "#D4FF00", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>{pct}%</span>
                  </div>
                )}
                {g.dueDate && <p style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Due: {g.dueDate}</p>}
              </div>
            );
          })}
        </section>
      )}

      {/* Sessions */}
      {sections.sessions && sessions.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "#D4FF00", background: "#141418", padding: "4px 10px", borderRadius: 4, marginBottom: 10, display: "inline-block" }}>
            {rp.sections.sessions}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                {[tr.session.date, tr.session.type, tr.session.duration, tr.session.arrows, tr.session.score].map((h) => (
                  <th key={h} style={{ padding: "5px 8px", textAlign: "left", fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "#666" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().slice(0, 20).map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "4px 8px" }}>{s.date}</td>
                  <td style={{ padding: "4px 8px" }}>{s.type}</td>
                  <td style={{ padding: "4px 8px" }}>{s.duration || "—"}</td>
                  <td style={{ padding: "4px 8px" }}>{s.arrows || "—"}</td>
                  <td style={{ padding: "4px 8px" }}>{s.score ? `${s.score}${s.outOf ? `/${s.outOf}` : ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Exercises */}
      {sections.exercises && exercises.length > 0 && (
        <section>
          <div style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "#D4FF00", background: "#141418", padding: "4px 10px", borderRadius: 4, marginBottom: 10, display: "inline-block" }}>
            {rp.sections.exercises}
          </div>
          {exercises.map((ex) => (
            <div key={ex.id} style={{ display: "flex", gap: 10, marginBottom: 6, padding: "6px 10px", background: "#f8f8f8", borderRadius: 4 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{ex.name}</div>
                <div style={{ fontSize: 11, color: "#666" }}>{ex.category} · {ex.sets && `${ex.sets} sets`} {ex.reps && `× ${ex.reps}`} {ex.frequency && `· ${ex.frequency}`}</div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );

  return (
    <div className="screen">
      <div className="card-header" style={{ marginBottom: 12 }}>
        <h2>{rp.title} — {athlete.name}</h2>
        {generated && (
          <button className="btn-primary small" onClick={() => window.print()}>{rp.print}</button>
        )}
      </div>

      {/* Section toggles */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>Sections</div>
        {Object.entries(rp.sections).map(([k, label]) => (
          <div key={k} className="pdf-section-toggle" onClick={() => toggleSection(k)}>
            <input type="checkbox" checked={sections[k]} onChange={() => {}} style={{ width: "auto", cursor: "pointer" }} />
            <span className="pdf-section-label">{label}</span>
          </div>
        ))}
        <button className="btn-primary" style={{ marginTop: 10, width: "100%" }} onClick={() => setGenerated(true)}>{rp.generate}</button>
      </div>

      {/* Report preview */}
      {generated && <Report />}
    </div>
  );
}
