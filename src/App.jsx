import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { configured, signedIn, syncNow } from "./sync";
import { pullArchers, isLinked } from "./archer";
import { getUi, setUi } from "./ui";
import ArcherSelect from "./ArcherSelect";
import LiveBoard from "./screens/Live";
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

// The bottom bar: five stages, each holding the screens that belong to it. Video analysis is the coach's own work, so it
// is the raised button in the middle. Archers plot on their own phones, so Range opens on their live scores and the
// coach's own plotting comes second.
const STAGES = [
  { key: "home",     icon: "home",     screens: ["dashboard", "archer", "profile", "settings", "legal"] },
  { key: "plan",     icon: "calendar", screens: ["planner", "goals", "exercises"] },
  { key: "review",   icon: "clip",     screens: ["clips", "review"] },
  { key: "range",    icon: "target",   screens: ["live", "range"] },
  { key: "progress", icon: "chart",    screens: ["stats", "report", "rubric", "session"] },
];
const CENTER = "review";
const stageOf = (screen) => STAGES.find((s) => s.screens.includes(screen));
const SCREENS = STAGES.flatMap((s) => s.screens);
// Screens about one archer. With none chosen they show the list of archers instead of a dead end.
const NEEDS_ARCHER = ["archer", "range", "session", "exercises", "planner"];
// Home has no tabs, so its inner screens get a way back: screen → where "back" goes.
const UP = { archer: "dashboard", profile: "archer", settings: "dashboard", legal: "settings" };

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

export default function App({ tr, lang, setLang, open }) {
  // The coach comes back to where they were: same screen, same archer.
  const [screen, setScreen] = useState(() => open || (SCREENS.includes(getUi().screen) ? getUi().screen : "dashboard"));
  const [selectedId, setSelectedId] = useState(() => getUi().selectedId || "");
  const lastIn = useRef({}); // the screen last open in each stage: tapping a stage returns there
  const [picking, setPicking] = useState(false);
  const [athletesTick, setAthletesTick] = useState(0); // bump to re-read after a save

  const athletes = useMemo(() => getAthletes(), [athletesTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = athletes.find((a) => a.id === selectedId) || null;
  const stage = stageOf(screen);
  const reviewDirty = useRef(null); // set by the Review screen while it is open
  const leaving = (next) => screen === "review" && next !== "review" && reviewDirty.current?.() && !window.confirm(tr.review.leave);
  const go = (next) => {
    if (next === screen) { setPicking(false); return; }
    if (leaving(next)) return;
    history.pushState({ screen: next }, ""); // the phone's Back button steps through screens instead of closing the app
    setPicking(false); setScreen(next);
  };
  const goStage = (s) => go(stage.key === s.key ? s.screens[0] : lastIn.current[s.key] || s.screens[0]);
  useEffect(() => {
    lastIn.current[stageOf(screen).key] = screen;
    setUi({ screen, selectedId });
  }, [screen, selectedId]);
  const screenRef = useRef(screen);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => {
    history.replaceState({ screen: screenRef.current }, "");
    const back = (e) => {
      const to = SCREENS.includes(e.state?.screen) ? e.state.screen : "dashboard";
      if (screenRef.current === "review" && to !== "review" && reviewDirty.current?.() && !window.confirm(tr.review.leave)) { history.pushState({ screen: "review" }, ""); return; }
      setPicking(false); setScreen(to);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openArcher = (id) => { setSelectedId(id); go("archer"); };
  const pickArcher = (id) => { setSelectedId(id); setPicking(false); if (screen === "dashboard" || screen === "settings") go("archer"); };
  const newArcher = () => { setSelectedId(""); go("profile"); };
  const handleAthleteSaved = () => {
    setAthletesTick((n) => n + 1);
    const latest = getAthletes();
    if (latest.length && !selectedId) setSelectedId(latest[latest.length - 1].id); // a new archer becomes the current one
  };

  // Cloud copy: sync when the app opens or comes back into view, when the connection returns, and 5 s after a change.
  // Data received from another device re-opens the current screen, except Range and Review, which hold work in progress.
  const [dataTick, setDataTick] = useState(0);
  const [, setLinkTick] = useState(0); // an archer joined or left: draw again, the Range screen may change
  useEffect(() => {
    if (!configured) return;
    let timer;
    // Sessions that linked archers finished on their own phones are copied in first, then everything syncs.
    const sync = () => {
      clearTimeout(timer);
      if (!signedIn() || !navigator.onLine) return;
      pullArchers().then((r) => { setLinkTick((n) => n + 1); if (r.copied) setAthletesTick((n) => n + 1); }).catch((e) => console.warn("Archer check failed", e))
        .finally(() => syncNow().catch((e) => console.warn("Sync failed", e)));
    };
    const later = () => { clearTimeout(timer); timer = setTimeout(sync, 5000); };
    const seen = () => document.visibilityState === "visible" && sync();
    const received = () => { setAthletesTick((n) => n + 1); if (!["range", "review"].includes(screenRef.current)) setDataTick((n) => n + 1); };
    sync();
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
  const linked = isLinked(selectedId); // read each time: an archer may have joined since the last screen
  const pickFirst = NEEDS_ARCHER.includes(screen) && !selected;
  const up = UP[screen] && (screen !== "profile" || selected ? UP[screen] : "dashboard");

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
            {up && screen !== "archer" && (
              <div className="backbar"><button className="btn-ghost small" onClick={() => go(up)}><Icon name="prev" size={16} />{tr.shell.backTo[up]}</button></div>
            )}
            <Fragment key={dataTick}>
            {pickFirst && (
              <div className="screen">
                <h2>{tr.nav[screen] || tr.stages[stage.key]}</h2>
                <ArcherSelect tr={tr} athletes={athletes} selectedId="" onPick={setSelectedId} prompt={tr.shell.pickFirst} />
                <button className="btn-ghost" onClick={newArcher}><Icon name="plus" size={18} />{tr.shell.newArcher}</button>
              </div>
            )}
            {screen === "live"      && <LiveBoard tr={tr} onCopied={() => setAthletesTick((n) => n + 1)} />}
            {screen === "range" && selected && linked && (
              <div className="screen">
                <h2>{selected.name}</h2>
                <div className="card"><p>{tr.live.ownPhone.replace("{name}", selected.name)}</p>
                  <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => go("live")}>{tr.live.watch}</button></div>
              </div>
            )}
            {screen === "dashboard" && <CoachDashboard   tr={tr} lang={lang} tick={athletesTick} onOpen={openArcher} onGo={(id, to) => { setSelectedId(id); go(to); }} onNew={newArcher} />}
            {screen === "archer"    && selected && <Archer tr={tr} lang={lang} selectedId={selectedId} onGo={go} onLink={() => setLinkTick((n) => n + 1)} />}
            {screen === "profile"   && <AthleteProfile    lang={lang} tr={tr} selectedId={selectedId} onSelect={setSelectedId} onSaved={handleAthleteSaved} />}
            {screen === "range"     && selected && !linked && <Range key={selectedId} tr={tr} lang={lang} selectedId={selectedId} />}
            {screen === "clips"     && <Clips key={selectedId} tr={tr} lang={lang} selectedId={selectedId} onGo={go} />}
            {screen === "review"    && <Review selectedId={selectedId} guardRef={reviewDirty} lang={lang} tr={tr} />}
            {screen === "session"   && selected && <SessionLogger key={selectedId} lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "rubric"    && <RubricAssessment key={selectedId} lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "exercises" && selected && <Exercises lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "goals"     && <GoalsTracker      lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "planner"   && selected && <PeriodizationPlanner lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "stats"     && <Stats key={selectedId} tr={tr} lang={lang} selectedId={selectedId} onGo={go} />}
            {screen === "report"    && <Report key={selectedId} tr={tr} lang={lang} selectedId={selectedId} />}
            {screen === "settings"  && <Settings          lang={lang} tr={tr} onDataCleared={() => { setSelectedId(""); setAthletesTick((n) => n + 1); }} onGo={go} />}
            {screen === "legal"     && <Legal lang={lang} />}
            </Fragment>
            {picking && <ArcherPicker athletes={athletes} selectedId={selectedId} tr={tr} onPick={pickArcher} onNew={newArcher} onClose={() => setPicking(false)} />}
          </div>

          <nav className="stage-nav" aria-label="ERA Lab">
            {STAGES.map((s) => (
              <button key={s.key} className={`stage-btn ${s.key === CENTER ? "go" : ""} ${stage.key === s.key ? "active" : ""}`}
                aria-current={stage.key === s.key ? "page" : undefined} onClick={() => goStage(s)}>
                {s.key === CENTER ? <span className="disc"><Icon name={s.icon} size={26} /></span> : <Icon name={s.icon} size={24} />}
                {tr.stages[s.key]}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </AppContext.Provider>
  );
}
