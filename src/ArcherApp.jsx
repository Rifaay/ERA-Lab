import { useEffect, useState } from "react";
import { AppContext } from "./context";
import { getAthletes, saveAthlete, getRange, saveRange, getSessions } from "./storage";
import { account } from "./sync";
import { myLink, uploadSessions, waiting, leaveCoach, coachWatching, latestNote, endedByCoach, dropUpload } from "./archer";
import Range from "./screens/Range";
import ArcherResults from "./screens/ArcherResults";
import ArcherPlan from "./screens/ArcherPlan";
import Notifications from "./screens/Notifications";
import Legal from "./screens/Legal";
import Account from "./screens/Account";
import { LockSettings } from "./DeviceLock";
import { hasPin } from "./lock";
import Logo from "./Logo";
import Icon from "./icons";

const TABS = [["range", "target"], ["plan", "calendar"], ["results", "chart"], ["me", "archer"]];

// The archer's own app: plot arrows, see your own results. Every arrow is sent to the coach as it is plotted;
// with no signal it waits on the phone and goes when the connection is back.
export default function ArcherApp({ tr, lang, setLang, onLeft }) {
  const w = tr.welcome, m = tr.me, link = myLink();
  const [tab, setTab] = useState("range");
  const [me, setMe] = useState(null); // Me: null is the list; otherwise the one screen open
  const [left, setLeft] = useState(0); // sessions still to send
  const [, setTick] = useState(0);
  const [watched, setWatched] = useState(false); // the coach has Live scores open
  const [note, setNote] = useState(null); // the coach's newest quick note, until tapped away or 20 s have passed
  const [rangeKey, setRangeKey] = useState(0); // a new key reopens Range after the coach ended its session

  // Asks every 20 s; every 5 s while the coach is watching, when a note is likely. A note that arrives while the app is
  // open always shows. One already waiting when it opens shows only if under 10 minutes old by this phone's clock: the
  // only place the phone's clock counts, so a phone set to the wrong time still gets every new note.
  useEffect(() => {
    let live = true, timer, on = false, first = true;
    const seen = () => Number(localStorage.getItem("racm_note_seen")) || 0;
    const ask = async () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) {
        on = await coachWatching().catch(() => false);
        const n = await latestNote(seen()).catch(() => undefined); // undefined: no answer (offline)
        if (live) setWatched(on);
        if (live && n) {
          localStorage.setItem("racm_note_seen", String(n.id));
          if (!first || Date.now() - Date.parse(n.created_at) < 10 * 60_000) setNote(n);
        }
        if (n !== undefined) first = false;
        const cur = getRange().live; // the coach ended this session from Live scores: close it here too
        if (cur && live && await endedByCoach(cur.session_id).catch(() => false) && getRange().live?.session_id === cur.session_id) {
          saveRange({ ...getRange(), live: null });
          dropUpload(cur.session_id).catch(() => {});
          setRangeKey((k) => k + 1);
          setNote({ id: `end-${cur.session_id}`, ended: true });
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
          <button key={note.id} className="coach-note" role="status" aria-label={`${tr.live.fromCoach}: ${note.ended ? tr.live.endedByCoach : note.body}`} onClick={() => setNote(null)}>
            <small>{tr.live.fromCoach}</small>{note.ended ? tr.live.endedByCoach : note.body}
          </button>
        )}
        <div className="app-body">
          <div className="main-area">
            {tab === "range" && <Range key={rangeKey} tr={tr} lang={lang} selectedId={link.athlete_id} />}
            {tab === "plan" && <ArcherPlan tr={tr} lang={lang} onStart={() => setTab("range")} />}
            {tab === "results" && <ArcherResults tr={tr} lang={lang} selectedId={link.athlete_id} />}
            {tab === "me" && !me && (
              <div className="screen">
                <h2>{link.name}</h2>
                <div className="list settings-list">
                  {[["coach", w.coachLink, left ? w.waiting.replace("{n}", left) : w.sentLong], ["notify", tr.push.title, m.notifySub],
                    ["lock", tr.lock.title, hasPin() ? m.lockOn : m.lockOff], ["account", w.account, account()], ["legal", tr.settings.legal, m.privacySub],
                    ["delete", m.del, m.delSub]].map(([k, name, line]) => (
                    <button key={k} className={`row ${k === "delete" ? "danger-row" : ""}`} onClick={() => setMe(k)}>
                      <span><span className="row-name" style={{ display: "block" }}>{name}</span><span className="row-line">{line}</span></span>
                      <Icon name="next" size={18} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tab === "me" && me && <>
              <div className="backbar"><button className="btn-ghost small" onClick={() => setMe(null)}><Icon name="prev" size={16} />{w.tabs.me}</button></div>
              {me === "legal" ? <Legal lang={lang} /> : (
                <div className="screen">
                  {me === "coach" && <div className="card settings-section">
                    <div className="settings-label">{w.coachLink}</div>
                    <p>{w.linked}</p>
                    <p className="muted">{left ? w.waitingLong.replace("{n}", left) : w.sentLong}</p>
                    <button className="btn-ghost small danger" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={leave}>{w.leave}</button>
                  </div>}
                  {me === "notify" && <div className="card settings-section"><div className="settings-label">{tr.push.title}</div><Notifications tr={tr} /></div>}
                  {me === "lock" && <div className="card settings-section"><div className="settings-label">{tr.lock.title}</div><LockSettings tr={tr} onChange={() => setTick((n) => n + 1)} /></div>}
                  {(me === "account" || me === "delete") && <div className="card settings-section">
                    <div className="settings-label">{me === "delete" ? m.del : w.account}</div>
                    {me === "delete" && <p className="muted">{m.delLong}</p>}
                    <Account tr={tr} as="archer" onChange={() => { setTick((n) => n + 1); if (!account()) onLeft(); }} />
                  </div>}
                </div>
              )}
            </>}
          </div>
          <nav className="stage-nav four" aria-label="ERA Lab">
            {TABS.map(([k, icon]) => (
              <button key={k} className={`stage-btn ${k === "range" ? "go" : ""} ${tab === k ? "active" : ""}`} aria-current={tab === k ? "page" : undefined} onClick={() => { setTab(k); setMe(null); }}>
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
