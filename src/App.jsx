import { useState, useMemo } from "react";
import { t } from "./i18n";
import { getAthletes, calcAgeBand, calcWACategory } from "./storage";
import { AppContext } from "./context";
import AthleteProfile    from "./screens/AthleteProfile";
import Range             from "./screens/Range";
import SessionLogger     from "./screens/SessionLogger";
import RubricAssessment  from "./screens/RubricAssessment";
import Exercises         from "./screens/Exercises";
import GoalsTracker      from "./screens/GoalsTracker";
import PeriodizationPlanner from "./screens/PeriodizationPlanner";
import CoachDashboard    from "./screens/CoachDashboard";
import PdfReport         from "./screens/PdfReport";
import Settings          from "./screens/Settings";
import "./index.css";

const NAV_ROW1 = ["profile", "range", "session", "rubric", "exercises"];
const NAV_ROW2 = ["goals", "planner", "dashboard", "report", "settings"];

const STAGE_COLORS = ["#72728A", "#40A0FF", "#FFC020", "#D4FF00"];

function Sidebar({ athletes, selectedId, onSelect, lang, tr, sidebarOpen }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() =>
    athletes.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())),
    [athletes, q]
  );

  const selected = athletes.find((a) => a.id === selectedId);

  return (
    <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
      <div className="sb-header">
        <input
          className="sb-search"
          placeholder={tr.searchAthletes}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="sb-add-btn"
          title={tr.newAthlete}
          onClick={() => onSelect("__new__")}
        >+</button>
      </div>
      <div className="sb-list">
        {filtered.length === 0 && (
          <p className="sb-empty">{tr.searchAthletes}</p>
        )}
        {filtered.map((a) => {
          const stageNum = Number(a.stage || 0);
          const color = STAGE_COLORS[stageNum] || STAGE_COLORS[0];
          const initials = a.name.slice(0, 2).toUpperCase();
          const waLabel = calcWACategory(a.discipline, a.gender, a.ageBand);

          return (
            <div
              key={a.id}
              className={`sb-item ${selectedId === a.id ? "active" : ""}`}
              onClick={() => onSelect(a.id)}
            >
              <div className="sb-avatar" style={{ background: color + '22', color }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="sb-name">{a.name}</div>
                <div className="sb-meta">
                  <span className="sb-pill">S{stageNum + 1}</span>
                  {a.discipline && (
                    <span className="sb-pill teal">
                      {a.discipline === "barebow" ? "BB" : "RC"}
                    </span>
                  )}
                  {waLabel && <span className="sb-pill amber">{waLabel}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export default function App() {
  const [lang, setLang] = useState("en");
  const [screen, setScreen] = useState("dashboard");
  const [selectedId, setSelectedId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 600); // on a phone the list would cover the screen
  const [athletesTick, setAthletesTick] = useState(0); // force re-read after save

  const tr = t[lang];
  const isRtl = lang === "ar";
  const athletes = useMemo(() => getAthletes(), [athletesTick]);
  const selectedAthlete = athletes.find((a) => a.id === selectedId) || null;

  const handleSelectAthlete = (id) => {
    if (id === "__new__") {
      setSelectedId("");
      setScreen("profile");
    } else {
      setSelectedId(id); // stay on the current screen, just change athlete
    }
    // On mobile, close sidebar after selection
    if (window.innerWidth <= 600) setSidebarOpen(false);
  };

  const handleAthleteSaved = () => {
    setAthletesTick((n) => n + 1);
    // If a new athlete was just created, auto-select them
    const latest = getAthletes();
    if (latest.length && !selectedId) {
      setSelectedId(latest[latest.length - 1].id);
    }
  };

  const ctx = { selectedId, setSelectedId, lang, setLang };

  return (
    <AppContext.Provider value={ctx}>
      <div className={`app`} dir={isRtl ? "rtl" : "ltr"}>
        {/* ── TOP BAR ── */}
        <div className="topbar">
          <button className="sb-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div>
            <div className="topbar-logo">{tr.appTitle}</div>
            <div className="topbar-sub">{tr.appSub}</div>
          </div>
          <div className="topbar-spacer" />
          {selectedAthlete ? (
            <div className="topbar-athlete" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <div>
                <div className="topbar-athlete-name">{selectedAthlete.name}</div>
                <div className="topbar-athlete-sub">
                  S{Number(selectedAthlete.stage || 0) + 1} · {selectedAthlete.discipline === "barebow" ? "BB" : "RC"}
                </div>
              </div>
            </div>
          ) : (
            <span className="topbar-no-athlete">{tr.noAthlete}</span>
          )}
          <button
            className="lang-toggle"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
          >{tr.langToggle}</button>
        </div>

        {/* ── BODY ── */}
        <div className="app-body">
          <Sidebar
            athletes={athletes}
            selectedId={selectedId}
            onSelect={handleSelectAthlete}
            lang={lang}
            tr={tr}
            sidebarOpen={sidebarOpen}
          />

          <div className="main-area">
            {/* ── SCREEN NAV ── */}
            <nav className="screen-nav">
              <div className="nav-row">
                {NAV_ROW1.map((s) => (
                  <button
                    key={s}
                    className={`nav-btn ${screen === s ? "active" : ""}`}
                    onClick={() => setScreen(s)}
                  >{tr.nav[s]}</button>
                ))}
              </div>
              <div className="nav-row">
                {NAV_ROW2.map((s) => (
                  <button
                    key={s}
                    className={`nav-btn ${screen === s ? "active" : ""}`}
                    onClick={() => setScreen(s)}
                  >{tr.nav[s]}</button>
                ))}
              </div>
            </nav>

            {/* ── SCREEN CONTENT ── */}
            {screen === "profile"   && <AthleteProfile   lang={lang} tr={tr} selectedId={selectedId} onSelect={setSelectedId} onSaved={handleAthleteSaved} />}
            {screen === "range"     && <Range key={selectedId} tr={tr} selectedId={selectedId} />}
            {screen === "session"   && <SessionLogger     lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "rubric"    && <RubricAssessment  lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "exercises" && <Exercises         lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "goals"     && <GoalsTracker      lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "planner"   && <PeriodizationPlanner lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "dashboard" && <CoachDashboard    lang={lang} tr={tr} />}
            {screen === "report"    && <PdfReport         lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "settings"  && <Settings          lang={lang} tr={tr} onDataCleared={() => { setSelectedId(""); setAthletesTick((n) => n + 1); }} />}
          </div>
        </div>
      </div>
    </AppContext.Provider>
  );
}
