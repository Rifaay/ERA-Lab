import { useEffect, useState } from "react";
import { AppContext } from "./context";
import { getAthletes, saveAthlete, getRange, getSessions } from "./storage";
import { account } from "./sync";
import { myLink, uploadSessions, waiting, leaveCoach, coachWatching, latestNote } from "./archer";
import Range from "./screens/Range";
import Stats from "./screens/Stats";
import ArcherPlan from "./screens/ArcherPlan";
import Notifications from "./screens/Notifications";
import Legal from "./screens/Legal";
import Account from "./screens/Account";
import { LockSettings } from "./DeviceLock";
import Logo from "./Logo";
import Icon from "./icons";

const TABS = [["range", "target"], ["plan", "calendar"], ["results", "chart"], ["me", "archer"]];

// The archer's own app: plot arrows, see your own results. Every arrow is sent to the coach as it is plotted;
// with no signal it waits on the phone and goes when the connection is back.
export default function ArcherApp({ tr, lang, setLang, onLeft }) {
  const w = tr.welcome, link = myLink();
  const [tab, setTab] = useState("range");
  const [legal, setLegal] = useState(false);
  const [left, setLeft] = useState(0); // sessions still to send
  const [, setTick] = useState(0);
  const [watched, setWatched] = useState(false); // the coach has Live scores open
  const [note, setNote] = useState(null); // the coach's newest quick note, until tapped away or 20 s have passed

  // Asks every 20 s; every 5 s while the coach is watching, when a note is likely. A note older than 10 minutes when it
  // arrives (the app was closed) is skipped; the last one shown is remembered so it doesn't come back.
  useEffect(() => {
    let live = true, timer, on = false;
    const seen = () => Number(localStorage.getItem("racm_note_seen")) || 0;
    const ask = async () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) {
        on = await coachWatching().catch(() => false);
        const n = await latestNote(seen()).catch(() => null);
        if (live) setWatched(on);
        if (live && n) {
          localStorage.setItem("racm_note_seen", String(n.id));
          if (Date.now() - Date.parse(n.created_at) < 10 * 60_000) setNote(n);
        }
      }
      if (live) timer = setTimeout(ask, on ? 5000 : 20000);
    };
    ask();
    return () => { live = false; clearTimeout(timer); };
  }, []);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 20000); return () => clearTimeout(t); }, [note]);

  // Range and Stats read the archer from storage like the coach's app does: keep one profile, the archer's own.
  useState(() => { if (!getAthletes().some((a) => a.id === link.athlete_id)) saveAthlete({ id: link.athlete_id, name: link.name }); });

  useEffect(() => {
    let timer, busy = false, again = false;
    const count = () => setLeft(waiting(getRange().live, getSessions()));
    const send = async () => {
      if (busy) { again = true; return; }
      busy = true;
      try { if (navigator.onLine !== false) await uploadSessions(getRange().live, getSessions()); } catch (e) { console.warn("Upload failed", e); }
      busy = false; count();
      if (again) { again = false; send(); }
    };
    const soon = () => { count(); clearTimeout(timer); timer = setTimeout(send, 1200); }; // one request for a quick run of taps
    const seen = () => document.visibilityState === "visible" && send();
    send();
    window.addEventListener("racm-change", soon);
    window.addEventListener("online", send);
    document.addEventListener("visibilitychange", seen);
    return () => { clearTimeout(timer); window.removeEventListener("racm-change", soon); window.removeEventListener("online", send); document.removeEventListener("visibilitychange", seen); };
  }, []);

  const ctx = { selectedId: link.athlete_id, setSelectedId: () => {}, lang, setLang, archer: true };
  const leave = async () => {
    if (!window.confirm(w.confirmLeave)) return;
    try { await leaveCoach(); onLeft(); } catch { window.alert(tr.sync.offline); }
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className="app archer-app" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
        <header className="topbar">
          <span className="brand"><span className="logo-tile"><Logo size={36} /></span><span className="wordmark">ERA LAB</span></span>
          <span className="topbar-spacer" />
          {watched && <span className="watching" role="status" title={tr.live.watchingNow}><Icon name="eye" size={18} label={tr.live.watchingNow} /></span>}
          <span className={`send-state ${left ? "wait" : ""}`} role="status">{left ? w.waiting.replace("{n}", left) : w.sent}</span>
          <button className="lang-toggle" onClick={() => setLang(lang === "en" ? "ar" : "en")} aria-label={tr.shell.language}>{tr.langToggle}</button>
        </header>
        {note && (
          <button key={note.id} className="coach-note" role="status" aria-label={`${tr.live.fromCoach}: ${note.body}`} onClick={() => setNote(null)}>
            <small>{tr.live.fromCoach}</small>{note.body}
          </button>
        )}
        <div className="app-body">
          <div className="main-area">
            {tab === "range" && <Range tr={tr} lang={lang} selectedId={link.athlete_id} />}
            {tab === "plan" && <ArcherPlan tr={tr} lang={lang} />}
            {tab === "results" && <Stats tr={tr} lang={lang} selectedId={link.athlete_id} onGo={() => {}} />}
            {tab === "me" && !legal && (
              <div className="screen">
                <h2>{link.name}</h2>
                <div className="card settings-section">
                  <div className="settings-label">{w.coachLink}</div>
                  <p>{w.linked}</p>
                  <p className="muted">{left ? w.waitingLong.replace("{n}", left) : w.sentLong}</p>
                  <button className="btn-ghost small danger" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={leave}>{w.leave}</button>
                </div>
                <div className="card settings-section">
                  <div className="settings-label">{tr.push.title}</div>
                  <Notifications tr={tr} />
                </div>
                <div className="card settings-section">
                  <div className="settings-label">{tr.settings.security}</div>
                  <h3 className="settings-sub">{tr.lock.title}</h3>
                  <LockSettings tr={tr} />
                  <h3 className="settings-sub">{w.account}</h3>
                  <Account tr={tr} as="archer" onChange={() => { setTick((n) => n + 1); if (!account()) onLeft(); }} />
                </div>
                <div className="card settings-section">
                  <div className="settings-label">{tr.settings.legal}</div>
                  <button className="btn-ghost small" onClick={() => setLegal(true)}>{tr.settings.legalOpen}</button>
                </div>
              </div>
            )}
            {tab === "me" && legal && <>
              <div className="backbar"><button className="btn-ghost small" onClick={() => setLegal(false)}><Icon name="prev" size={16} />{w.back}</button></div>
              <Legal lang={lang} />
            </>}
          </div>
          <nav className="stage-nav four" aria-label="ERA Lab">
            {TABS.map(([k, icon]) => (
              <button key={k} className={`stage-btn ${k === "range" ? "go" : ""} ${tab === k ? "active" : ""}`} aria-current={tab === k ? "page" : undefined} onClick={() => { setTab(k); setLegal(false); }}>
                {k === "range" ? <span className="disc"><Icon name={icon} size={26} /></span> : <Icon name={icon} size={24} />}
                {w.tabs[k]}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </AppContext.Provider>
  );
}
