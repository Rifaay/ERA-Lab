import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { configured, account, syncNow, finishLinkSignIn } from "./sync";
import { t } from "./i18n";
import { getAthletes } from "./storage";
import { AppContext } from "./context";
import Icon from "./icons";
import Logo from "./Logo";
import AthleteProfile    from "./screens/AthleteProfile";
import Range             from "./screens/Range";
import Review            from "./screens/Review";
import SessionLogger     from "./screens/SessionLogger";
import RubricAssessment  from "./screens/RubricAssessment";
import Exercises         from "./screens/Exercises";
import GoalsTracker      from "./screens/GoalsTracker";
import PeriodizationPlanner from "./screens/PeriodizationPlanner";
import CoachDashboard    from "./screens/CoachDashboard";
import Archer            from "./screens/Archer";
import Report            from "./screens/Report";
import Stats             from "./screens/Stats";
import Clips             from "./screens/Clips";
import Settings          from "./screens/Settings";
import Legal             from "./screens/Legal";
import "./index.css";
import "./motion.css";

// The coaching cycle is the navigation: six stages, each holding the screens that belong to it.
const STAGES = [
  { key: "home",   icon: "home",   screens: ["dashboard", "archer", "profile", "settings", "legal"] },
  { key: "plan",   icon: "calendar", screens: ["planner", "goals", "exercises"] },
  { key: "range",  icon: "target",   screens: ["range"] },
  { key: "review", icon: "clip",     screens: ["clips", "review"] },
  { key: "assess", icon: "assess",   screens: ["rubric", "session"] },
  { key: "report", icon: "chart",    screens: ["stats", "report"] },
];
const stageOf = (screen) => STAGES.find((s) => s.screens.includes(screen));

function ArcherPicker({ athletes, selectedId, tr, onPick, onNew, onClose }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => athletes.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())), [athletes, q]);
  return (
    <div className="picker" role="dialog" aria-label={tr.shell.chooseArcher}>
      <div className="picker-head">
        <div className="picker-search">
          <Icon name="search" size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.shell.searchArchers} aria-label={tr.shell.searchArchers} />
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={tr.shell.close}><Icon name="x" /></button>
      </div>
      <div className="picker-list">
        {shown.map((a) => (
          <button key={a.id} className={`picker-row ${a.id === selectedId ? "active" : ""}`} onClick={() => onPick(a.id)}>
            <b>{a.name}</b>
            <small>{tr.archer.stage.replace("{n}", Number(a.stage || 0) + 1)} · {a.discipline === "barebow" ? tr.profile.barebow : tr.profile.recurve}</small>
          </button>
        ))}
        {!shown.length && <p style={{ padding: "24px 0" }}>{tr.shell.noArchers}</p>}
        <button className="btn-ghost" style={{ marginTop: 16 }} onClick={onNew}><Icon name="plus" size={18} />{tr.shell.newArcher}</button>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState("en");
  const [screen, setScreen] = useState("dashboard");
  const [selectedId, setSelectedId] = useState("");
  const [picking, setPicking] = useState(false);
  const [athletesTick, setAthletesTick] = useState(0); // bump to re-read after a save

  const tr = t[lang];
  const athletes = useMemo(() => getAthletes(), [athletesTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = athletes.find((a) => a.id === selectedId) || null;
  const stage = stageOf(screen);
  const reviewDirty = useRef(null); // set by the Review screen while it is open
  const go = (next) => {
    if (screen === "review" && next !== "review" && reviewDirty.current?.() && !window.confirm(tr.review.leave)) return;
    setPicking(false); setScreen(next);
  };

  const openArcher = (id) => { setSelectedId(id); go("archer"); };
  const pickArcher = (id) => { setSelectedId(id); setPicking(false); if (screen === "dashboard" || screen === "settings") setScreen("archer"); };
  const newArcher = () => { setSelectedId(""); go("profile"); };
  const handleAthleteSaved = () => {
    setAthletesTick((n) => n + 1);
    const latest = getAthletes();
    if (latest.length && !selectedId) setSelectedId(latest[latest.length - 1].id); // a new archer becomes the current one
  };

  // Cloud copy: sync when the app opens or comes back into view, when the connection returns, and 5 s after a change.
  // Data received from another device re-opens the current screen, except Range and Review, which hold work in progress.
  const [dataTick, setDataTick] = useState(0);
  const screenRef = useRef(screen);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => {
    if (!configured) return;
    let timer;
    const sync = () => { clearTimeout(timer); if (account() && navigator.onLine) syncNow().catch((e) => console.warn("Sync failed", e)); };
    const later = () => { clearTimeout(timer); timer = setTimeout(sync, 5000); };
    const seen = () => document.visibilityState === "visible" && sync();
    const received = () => { setAthletesTick((n) => n + 1); if (!["range", "review"].includes(screenRef.current)) setDataTick((n) => n + 1); };
    finishLinkSignIn() // arriving from the emailed sign-in link
      .then((r) => { if (r === true) setScreen("settings"); else if (r) window.alert(r); })
      .catch((e) => console.warn("Sign-in link failed", e))
      .finally(sync);
    window.addEventListener("racm-change", later);
    window.addEventListener("online", sync);
    window.addEventListener("racm-synced", received);
    document.addEventListener("visibilitychange", seen);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("racm-change", later);
      window.removeEventListener("online", sync);
      window.removeEventListener("racm-synced", received);
      document.removeEventListener("visibilitychange", seen);
    };
  }, []);

  const ctx = { selectedId, setSelectedId, lang, setLang };
  const subs = stage.key === "home" ? [] : stage.screens;

  return (
    <AppContext.Provider value={ctx}>
      <div className="app" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
        <header className="topbar">
          <span className="brand"><span className="logo-tile"><Logo size={36} /></span><span className="wordmark">ERA LAB</span></span>
          <span className="topbar-spacer" />
          <button className="archer-btn" onClick={() => setPicking(!picking)} aria-expanded={picking}>
            <span>{selected ? selected.name : tr.shell.chooseArcher}</span><Icon name="down" size={16} />
          </button>
          <button className="lang-toggle" onClick={() => setLang(lang === "en" ? "ar" : "en")} aria-label={tr.shell.language}>{tr.langToggle}</button>
          <button className="icon-btn" onClick={() => go("settings")} aria-label={tr.shell.settings}><Icon name="settings" /></button>
        </header>

        <div className="app-body">
          <div className="main-area">
            {subs.length > 1 && (
              <nav className="subnav" aria-label={tr.stages[stage.key]}>
                {subs.map((s) => <button key={s} className={screen === s ? "active" : ""} aria-current={screen === s ? "page" : undefined} onClick={() => go(s)}>{tr.nav[s]}</button>)}
              </nav>
            )}
            <Fragment key={dataTick}>
            {screen === "dashboard" && <CoachDashboard   tr={tr} lang={lang} tick={athletesTick} onOpen={openArcher} onGo={(id, to) => { setSelectedId(id); go(to); }} onNew={newArcher} />}
            {screen === "archer"    && <Archer            tr={tr} lang={lang} selectedId={selectedId} onGo={go} />}
            {screen === "profile"   && <AthleteProfile    lang={lang} tr={tr} selectedId={selectedId} onSelect={setSelectedId} onSaved={handleAthleteSaved} />}
            {screen === "range"     && <Range key={selectedId} tr={tr} lang={lang} selectedId={selectedId} />}
            {screen === "clips"     && <Clips key={selectedId} tr={tr} lang={lang} selectedId={selectedId} onGo={go} />}
            {screen === "review"    && <Review selectedId={selectedId} guardRef={reviewDirty} lang={lang} tr={tr} />}
            {screen === "session"   && <SessionLogger     lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "rubric"    && <RubricAssessment key={selectedId} lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "exercises" && <Exercises         lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "goals"     && <GoalsTracker      lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "planner"   && <PeriodizationPlanner lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "stats"     && <Stats key={selectedId} tr={tr} lang={lang} selectedId={selectedId} onGo={go} />}
            {screen === "report"    && <Report key={selectedId} tr={tr} lang={lang} selectedId={selectedId} />}
            {screen === "settings"  && <Settings          lang={lang} tr={tr} onDataCleared={() => { setSelectedId(""); setAthletesTick((n) => n + 1); }} onGo={go} />}
            {screen === "legal"     && <Legal lang={lang} />}
            </Fragment>
            {picking && <ArcherPicker athletes={athletes} selectedId={selectedId} tr={tr} onPick={pickArcher} onNew={newArcher} onClose={() => setPicking(false)} />}
          </div>

          <nav className="stage-nav" aria-label="ERA Lab">
            {STAGES.map((s) => (
              <button key={s.key} className={`stage-btn ${s.key === "range" ? "go" : ""} ${stage.key === s.key ? "active" : ""}`}
                aria-current={stage.key === s.key ? "page" : undefined} onClick={() => go(s.screens[0])}>
                {s.key === "range" ? <span className="disc"><Icon name={s.icon} size={26} /></span> : <Icon name={s.icon} size={24} />}
                {tr.stages[s.key]}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </AppContext.Provider>
  );
}
