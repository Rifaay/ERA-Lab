import { useEffect, useState } from "react";
import Account from "./screens/Account";
import Logo from "./Logo";
import Icon from "./icons";
import { configured, account, signedIn, signOut } from "./sync";
import { claim, loadLink, myLink } from "./archer";
import { setUi } from "./ui";

// First screen on a new device: who is this, a coach or an archer? Then that person's sign-in.
// A coach may skip the account (the app works on the device alone); an archer needs one, plus the coach's invite code.
export default function Welcome({ tr, lang, setLang, start = "", onDone }) {
  const w = tr.welcome;
  const [step, setStep] = useState(start); // "" choose | coach | archer
  const [, setTick] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const finish = (role) => { setUi({ role }); onDone(); };

  // An archer who is signed in may already be linked (a second phone, or after clearing the app).
  const signedArcher = step === "archer" && Boolean(account());
  useEffect(() => {
    if (!signedArcher || myLink()) return;
    let live = true;
    loadLink().then((l) => { if (live && l) finish("archer"); }).catch(() => {});
    return () => { live = false; };
  }, [signedArcher]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await claim(code); finish("archer"); }
    catch (x) { setErr(x.code === "bad_invite" ? w.badCode : /already linked/.test(x.message) ? w.already : navigator.onLine === false || x instanceof TypeError ? tr.sync.offline : x.message); }
    setBusy(false);
  };

  return (
    <main className="welcome" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="welcome-top">
        <span className="brand"><span className="logo-tile"><Logo size={36} /></span><span className="wordmark">ERA LAB</span></span>
        <button className="lang-toggle" onClick={() => setLang(lang === "en" ? "ar" : "en")} aria-label={tr.shell.language}>{tr.langToggle}</button>
      </header>
      <div className="welcome-body">
        {step === "" && <>
          <h1>{w.title}</h1>
          <p className="muted">{w.sub}</p>
          <button className="role-card" onClick={() => setStep("coach")}>
            <Icon name="assess" size={32} /><span><b>{w.coach}</b><small>{w.coachSub}</small></span><Icon name="next" size={20} />
          </button>
          <button className="role-card" onClick={() => setStep("archer")} disabled={!configured}>
            <Icon name="archer" size={32} /><span><b>{w.archer}</b><small>{configured ? w.archerSub : w.archerOff}</small></span><Icon name="next" size={20} />
          </button>
        </>}

        {step !== "" && <button className="btn-ghost small welcome-back" onClick={() => { setStep(""); setErr(""); }}><Icon name="prev" size={16} />{w.back}</button>}

        {step === "coach" && <>
          <h1>{w.coachTitle}</h1>
          {configured
            ? <div className="card"><Account tr={tr} as="coach" onChange={() => { setTick((n) => n + 1); if (signedIn()) finish("coach"); }} /></div>
            : <p className="muted">{w.noCloud}</p>}
          <button className="btn-ghost wide-btn" onClick={() => finish("coach")}>{configured ? w.skip : w.open}</button>
          {configured && <p className="muted">{w.skipNote}</p>}
        </>}

        {step === "archer" && !signedArcher && <>
          <h1>{w.archerTitle}</h1>
          <div className="card"><Account tr={tr} as="archer" onChange={() => setTick((n) => n + 1)} /></div>
        </>}

        {signedArcher && <>
          <h1>{w.codeTitle}</h1>
          <p className="muted">{w.codeIntro}</p>
          <form className="card form" onSubmit={join}>
            <label>{w.code}
              <input className="code-input" dir="ltr" autoCapitalize="characters" autoComplete="off" spellCheck="false" maxLength={8}
                value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            </label>
            <button className="btn-primary wide-btn" disabled={busy || code.length !== 8}>{w.join}</button>
            {err && <p className="error-msg" role="alert">{err}</p>}
          </form>
          <p className="muted">{tr.sync.signedIn.replace("{email}", account())}</p>
          <button className="link-btn" onClick={() => signOut().then(() => setTick((n) => n + 1))}>{w.otherAccount}</button>
        </>}
      </div>
    </main>
  );
}
