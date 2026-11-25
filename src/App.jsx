import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { configured, signedIn, syncNow } from "./sync";
import { pullArchers, isLinked, liveOf } from "./archer";
import { getUi, setUi } from "./ui";
import ArcherSelect from "./ArcherSelect";
import LiveBoard from "./screens/Live";
import { getAthletes, planFor } from "./storage";
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
import Plans             from "./screens/Plans";
import CoachDashboard    from "./screens/CoachDashboard";
import Roster            from "./screens/Roster";
import Archer            from "./screens/Archer";
import Report            from "./screens/Report";
import Stats             from "./screens/Stats";
import Clips             from "./screens/Clips";
import Settings          from "./screens/Settings";
import Legal             from "./screens/Legal";
import "./index.css";
import "./motion.css";

// The bottom bar: five stages, each holding the screens that belong to it. Range is what a coach does most at the range
// (live scores from archers' phones, plotting for the rest), so it is the raised button in the middle. Everything about
// one archer (progress, sessions, assessment, goals, report) lives in Archers, on that archer's own page.
const STAGES = [
  { key: "today",   icon: "home",     screens: ["dashboard", "settings", "legal"] },
  { key: "archers", icon: "archer",   screens: ["roster", "archer", "session", "rubric", "goals", "stats", "report", "profile"] },
  { key: "range",   icon: "target",   screens: ["live", "range"] },
  { key: "plan",    icon: "calendar", screens: ["plans", "planner", "exercises"] },
  { key: "review",  icon: "clip",     screens: ["clips", "review"] },
];
const CENTER = "range";
const HUB = ["archer", "session", "rubric", "goals"]; // one archer's page: one switch between its four views
const stageOf = (screen) => STAGES.find((s) => s.screens.includes(screen));
const SCREENS = STAGES.flatMap((s) => s.screens);
// Screens about one archer. With none chosen they show the list of archers instead of a dead end.
const NEEDS_ARCHER = ["archer", "session"]; // the rest work for every archer, or ask for one where it matters
// Screens with no tabs of their own get a way back: screen → where "back" goes.
const UP = { range: "live", profile: "archer", stats: "archer", report: "archer", settings: "dashboard", legal: "settings" };

export default function App({ tr, lang, setLang, open }) {
  // The coach comes back to where they were: same screen, same archer.
  const [screen, setScreen] = useState(() => open || (SCREENS.includes(getUi().screen) ? getUi().screen : "dashboard"));
  const [selectedId, setSelectedId] = useState(() => getUi().selectedId || "");
  const lastIn = useRef({}); // the screen last open in each stage: tapping a stage returns there
  const [planId, setPlanId] = useState(() => getUi().planId || null); // the plan open in the planner
  const [athletesTick, setAthletesTick] = useState(0); // bump to re-read after a save

  const athletes = useMemo(() => getAthletes(), [athletesTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = athletes.find((a) => a.id === selectedId) || null;
  const stage = stageOf(screen);
  const go = (next) => {
    if (next === screen) return;
    history.pushState({ screen: next }, ""); // the phone's Back button steps through screens instead of closing the app
    setScreen(next);
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
      setScreen(to);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  const openArcher = (id) => { setSelectedId(id); go("archer"); };
  const openPlan = (id) => { setPlanId(id); setUi({ planId: id }); go(id ? "planner" : "plans"); };
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
  const [liveRows, setLiveRows] = useState([]); // linked archers' sessions, for "shooting now" on Today and Archers
  useEffect(() => {
    if (!configured) return;
    let timer;
    // Sessions that linked archers finished on their own phones are copied in first, then everything syncs.
    const sync = () => {
      clearTimeout(timer);
      if (!signedIn() || !navigator.onLine) return;
      pullArchers().then((r) => { setLinkTick((n) => n + 1); setLiveRows(r.rows); if (r.copied) setAthletesTick((n) => n + 1); }).catch((e) => console.warn("Archer check failed", e))
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
  const subs = ["today", "archers", "range", "review"].includes(stage.key) || screen === "planner" ? [] : stage.screens.filter((s) => s !== "planner"); // Range, Video and an open plan lead to their own next step, no tabs
  const hub = HUB.includes(screen) && selected;
  const live = liveOf(liveRows, athletes);
  const linked = isLinked(selectedId); // read each time: an archer may have joined since the last screen
  const pickFirst = NEEDS_ARCHER.includes(screen) && !selected;
  const up = UP[screen] && (screen !== "profile" || selected ? UP[screen] : "dashboard");

  return (
    <AppContext.Provider value={ctx}>
      <div className="app" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
        <header className="topbar">
          <span className="brand"><span className="logo-tile"><Logo size={36} /></span><span className="wordmark">ERA LAB</span></span>
          <span className="topbar-spacer" />
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
            {hub && (
              <>
                <div className="backbar"><button className="btn-ghost small" onClick={() => go("roster")}><Icon name="prev" size={16} />{tr.shell.backTo.roster}</button></div>
                <nav className="hub-nav seg" aria-label={selected.name}>
                  {HUB.map((s) => <button key={s} className={screen === s ? "active" : ""} aria-current={screen === s ? "page" : undefined} onClick={() => go(s)}>{tr.shell.hub[s]}</button>)}
                </nav>
              </>
            )}
            {up && (
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
            {screen === "live"      && <LiveBoard tr={tr} onCopied={() => setAthletesTick((n) => n + 1)} onPlot={() => go("range")} />}
            {screen === "range" && selected && linked && (
              <div className="screen">
                <h2>{selected.name}</h2>
                <div className="card"><p>{tr.live.ownPhone.replace("{name}", selected.name)}</p>
                  <div className="btn-row" style={{ marginTop: 12 }}><button className="btn-primary" onClick={() => go("live")}>{tr.live.watch}</button><button className="btn-ghost" onClick={() => setSelectedId("")}>{tr.live.someoneElse}</button></div></div>
              </div>
            )}
            {screen === "dashboard" && <CoachDashboard   tr={tr} lang={lang} tick={athletesTick} live={live} onOpen={openArcher} onPlan={openPlan} onGo={(id, to) => { setSelectedId(id); go(to); }} onNew={newArcher} onLive={() => go("live")} onAll={() => go("roster")} />}
            {screen === "roster"    && <Roster tr={tr} lang={lang} tick={athletesTick} live={live} onOpen={openArcher} onNew={newArcher} />}
            {screen === "archer"    && selected && <Archer tr={tr} lang={lang} selectedId={selectedId} onGo={(to) => (to === "planner" ? openPlan(planFor(selectedId, new Date().getFullYear())?.id) : go(to))} onLink={() => setLinkTick((n) => n + 1)} />}
            {screen === "profile"   && <AthleteProfile    lang={lang} tr={tr} selectedId={selectedId} onSelect={setSelectedId} onSaved={handleAthleteSaved} />}
            {screen === "range"     && (!selected || !linked) && <Range key={selectedId} tr={tr} lang={lang} selectedId={selectedId} />}
            {screen === "clips"     && <Clips key={selectedId} tr={tr} lang={lang} selectedId={selectedId} onGo={go} />}
            {screen === "review"    && <Review selectedId={selectedId} tr={tr} onBack={() => go("clips")} />}
            {screen === "session"   && selected && <SessionLogger key={selectedId} lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "rubric"    && <RubricAssessment key={selectedId} lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "exercises" && <Exercises lang={lang} tr={tr} />}
            {screen === "goals"     && <GoalsTracker      lang={lang} tr={tr} selectedId={selectedId} />}
            {screen === "plans"     && <Plans tr={tr} onOpen={openPlan} />}
            {screen === "planner"   && <PeriodizationPlanner key={planId || "none"} lang={lang} tr={tr} planId={planId} onBack={() => go("plans")} />}
            {screen === "stats"     && <Stats key={selectedId} tr={tr} lang={lang} selectedId={selectedId} onGo={go} />}
            {screen === "report"    && <Report key={selectedId} tr={tr} lang={lang} selectedId={selectedId} />}
            {screen === "settings"  && <Settings          lang={lang} tr={tr} onDataCleared={() => { setSelectedId(""); setAthletesTick((n) => n + 1); }} onGo={go} />}
            {screen === "legal"     && <Legal lang={lang} />}
            </Fragment>
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
