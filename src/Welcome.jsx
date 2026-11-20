import { useEffect, useState } from "react";
import Account from "./screens/Account";
import Logo from "./Logo";
import { configured, account, signedIn, signOut, role, resetting } from "./sync";
import { claim, loadLink, myLink, INVITE_RE } from "./archer";
import { getUi, setUi } from "./ui";

// The sign-in page on a device nobody is signed in to. Signing in needs no role: the account says whether this is a
// coach or an archer and the right app opens. Creating an account asks which. A coach may also skip the account (the
// app then works on this device alone); an archer needs one, plus the coach's invite code.
export default function Welcome({ tr, lang, setLang, onDone }) {
  const w = tr.welcome;
  const [, setTick] = useState(0);
  const invited = getUi().invite || ""; // from the coach's invite link
  const [code, setCode] = useState(invited);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const finish = (r, local = false) => { setUi({ role: r, local, invite: "" }); onDone(); };

  // A signed-in archer still needs their coach's code, unless this account is linked already (a second phone).
  const signedArcher = Boolean(account()) && role() === "archer" && !resetting();
  const join = async (e) => {
    e?.preventDefault(); setBusy(true); setErr("");
    try { await claim(code); finish("archer"); }
    catch (x) { setErr(x.code === "bad_invite" ? w.badCode : /already linked/.test(x.message) ? w.already : navigator.onLine === false || x instanceof TypeError ? tr.sync.offline : x.message); }
    setBusy(false);
  };
  useEffect(() => {
    if (!signedArcher || myLink()) return;
    let live = true;
    loadLink().then((l) => { if (!live) return; if (l) finish("archer"); else if (INVITE_RE.test(invited)) join(); }).catch(() => {}); // came by link: join straight away
    return () => { live = false; };
  }, [signedArcher]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = () => { setTick((n) => n + 1); if (signedIn() && role() === "coach" && !resetting()) finish("coach"); };

  return (
    <main className="welcome" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="welcome-top">
        <span className="brand"><span className="logo-tile"><Logo size={36} /></span><span className="wordmark">ERA LAB</span></span>
        <button className="lang-toggle" onClick={() => setLang(lang === "en" ? "ar" : "en")} aria-label={tr.shell.language}>{tr.langToggle}</button>
      </header>
      <div className="welcome-body">
        {!signedArcher && <>
          <h1>{w.title}</h1>
          {invited && <p className="acct-ok">✓ {w.invited}</p>}
          {configured
            ? <div className="card"><Account tr={tr} onChange={changed} invited={Boolean(invited)} /></div>
            : <p className="muted">{w.noCloud}</p>}
          {!account() && <div className="welcome-local">
            <button className="btn-ghost wide-btn" onClick={() => finish("coach", true)}>{configured ? w.skip : w.open}</button>
            {configured && <p className="muted">{w.skipNote}</p>}
          </div>}
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
