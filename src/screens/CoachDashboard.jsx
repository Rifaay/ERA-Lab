import { useState } from "react";
import { getAthletes, getSessions, getAssessments, getGoals, calcWACategory } from "../storage";

const STAGE_COLORS = ["#72728A", "#40A0FF", "#FFC020", "#D4FF00"];

function daysBetween(dateStr, now) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor((now - new Date(y, m - 1, d)) / 86400000);
}

export default function CoachDashboard({ lang, tr }) {
  const db = tr.dashboard;
  const [athletes] = useState(getAthletes);
  const sessions    = getSessions();
  const assessments = getAssessments();
  const goals       = getGoals();
  const now         = new Date();

  if (!athletes.length) return (
    <div className="screen">
      <div className="no-athlete">
        <div className="no-athlete-icon">📊</div>
        <div className="no-athlete-text">{db.noAthletes}</div>
      </div>
    </div>
  );

  const totalSessions30 = sessions.filter((s) => daysBetween(s.date, now) <= 30).length;
  const totalRamadan    = sessions.filter((s) => s.ramadan).length;
  const activeGoals     = goals.filter((g) => !g.completed).length;

  return (
    <div className="screen">
      <h2>{db.title}</h2>

      {/* Summary chips */}
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="stat-chip">
          <div className="stat-num">{athletes.length}</div>
          <div className="stat-label">{db.athletes}</div>
        </div>
        <div className="stat-chip">
          <div className="stat-num">{totalSessions30}</div>
          <div className="stat-label">{db.sessions30}</div>
        </div>
        <div className="stat-chip">
          <div className="stat-num">{activeGoals}</div>
          <div className="stat-label">{db.goalsActive}</div>
        </div>
        <div className="stat-chip">
          <div className="stat-num" style={{ color: "var(--a)" }}>{totalRamadan}</div>
          <div className="stat-label">{db.ramadanSessions}</div>
        </div>
      </div>

      {/* Per-athlete cards */}
      {athletes.map((athlete) => {
        const aSessions    = sessions.filter((s) => s.athleteId === athlete.id);
        const aAssessments = assessments.filter((a) => a.athleteId === athlete.id);
        const aGoals       = goals.filter((g) => g.athleteId === athlete.id);

        const sessions30 = aSessions.filter((s) => daysBetween(s.date, now) <= 30).length;
        const sessions90 = aSessions.filter((s) => daysBetween(s.date, now) <= 90).length;

        const lastSession = aSessions.length
          ? aSessions.reduce((l, s) => (s.date > l ? s.date : l), aSessions[0].date)
          : null;

        const sorted = [...aAssessments].sort((a, b) => b.date.localeCompare(a.date));
        const calcAvg = (a) => {
          if (!a) return null;
          const vals = Object.values(a.scores || {}).filter(Boolean);
          return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        };
        const latestAvg = calcAvg(sorted[0]);
        const prevAvg   = calcAvg(sorted[1]);
        const trend = latestAvg !== null && prevAvg !== null
          ? latestAvg > prevAvg + 0.1 ? "↑" : latestAvg < prevAvg - 0.1 ? "↓" : "→"
          : null;

        const stageNum = Number(athlete.stage || 0);
        const stageColor = STAGE_COLORS[stageNum] || STAGE_COLORS[0];
        const waCategory = calcWACategory(athlete.discipline, athlete.gender, athlete.ageBand);
        const initials = athlete.name.slice(0, 2).toUpperCase();
        const activeAGoals = aGoals.filter((g) => !g.completed).length;

        return (
          <div key={athlete.id} className="card" style={{ marginBottom: 10 }}>
            {/* Athlete header */}
            <div className="db-row" style={{ marginBottom: 10 }}>
              <div className="db-avatar" style={{ background: stageColor + "22", color: stageColor }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="db-name">{athlete.name}</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 2 }}>
                  <span className="badge" style={{ background: stageColor + "22", color: stageColor }}>S{stageNum + 1}</span>
                  {athlete.discipline && <span className="badge blue">{athlete.discipline === "barebow" ? "BB" : "RC"}</span>}
                  {athlete.ageBand && <span className="badge gray">{tr.profile.ageBands[athlete.ageBand]}</span>}
                  {waCategory && <span className="badge amber">{waCategory}</span>}
                </div>
              </div>
            </div>

            {/* Stage bar */}
            <div className="db-stage-bar" style={{ marginBottom: 10 }}>
              {[0,1,2,3].map((i) => (
                <div
                  key={i}
                  className="db-seg"
                  style={{ background: i <= stageNum ? stageColor : "var(--bgp)", height: 6, flex: 1, borderRadius: 3 }}
                />
              ))}
            </div>

            {/* Stats */}
            <div className="db-stats" style={{ gap: 8 }}>
              <div className="db-stat">
                <div className="db-stat-val">{sessions30}</div>
                <div className="db-stat-label">{db.sessions30}</div>
              </div>
              <div className="db-stat">
                <div className="db-stat-val">{sessions90}</div>
                <div className="db-stat-label">{db.sessions90}</div>
              </div>
              <div className="db-stat">
                <div className="db-stat-val" style={{ color: latestAvg ? (latestAvg >= 4 ? "var(--t)" : latestAvg >= 3 ? "var(--a)" : "var(--r)") : "var(--txm)" }}>
                  {latestAvg !== null ? latestAvg.toFixed(1) : db.noRubric}
                  {trend && <span style={{ fontSize: 11 }}>{trend}</span>}
                </div>
                <div className="db-stat-label">{db.latestRubric}</div>
              </div>
              <div className="db-stat">
                <div className="db-stat-val">{lastSession ? `${daysBetween(lastSession, now)}d` : db.noSession}</div>
                <div className="db-stat-label">{db.lastSession}</div>
              </div>
              <div className="db-stat">
                <div className="db-stat-val" style={{ color: activeAGoals > 0 ? "var(--p)" : "var(--txm)" }}>{activeAGoals}</div>
                <div className="db-stat-label">{db.goalsActive}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
