import { useEffect, useState } from "react";
import {
  account, signedIn, resetting, passwordProblem, signIn, signUp, sendReset, setPassword,
  factors, enrollApp, verifyApp, signOut, syncNow, deleteCloudCopy, lastSync, conflicts,
} from "../sync";
import { digits } from "../lock";

// Coach profile → Security → Cloud copy. Two-step sign-in: email + password, then a code from an authenticator app.
// Until both steps are done the database answers nothing (migrations/0003), and the app doesn't try to sync.
export default function Account({ tr, onChange }) {
  const s = tr.sync;
  const [, setTick] = useState(0);
  const refresh = () => { setTick((n) => n + 1); onChange?.(); };
  const [mode, setMode] = useState("in"); // signed out: in | up | reset
  const [email, setEmail] = useState(account);
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [app, setApp] = useState(null); // step 2: { id, qr?, secret? }
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { // the session was ended from another device
    const gone = () => { setApp(null); setTick((n) => n + 1); onChange?.(); };
    window.addEventListener("racm-signed-out", gone);
    return () => window.removeEventListener("racm-signed-out", gone);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stage = !account() ? "out" : !signedIn() ? "step2" : resetting() ? "newpw" : "in";

  const why = (e) => {
    if (e.status === 429) return s.tooMany;
    if (navigator.onLine === false || e instanceof TypeError) return s.offline;
    return { invalid_credentials: s.badLogin, email_not_confirmed: s.notConfirmed, weak_password: s.weak, mfa_verification_failed: s.badCode }[e.code]
      || (stage === "step2" && /totp|code/i.test(e.message) ? s.badCode : e.message);
  };
  const run = async (fn) => {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); } catch (e) { setErr(why(e)); }
    setBusy(false);
  };
  const weak = (p) => ({ short: s.short, email: s.emailInPw, common: s.common })[passwordProblem(p, email)] || "";
  const report = (r) => setMsg(s.done.replace("{sent}", r.sent).replace("{received}", r.received));

  // Step 2: find the coach's authenticator, or start setting one up.
  useEffect(() => {
    if (stage !== "step2" || app) return;
    let live = true;
    factors()
      .then(async (list) => { const ok = list.find((x) => x.status === "verified"); const next = ok ? { id: ok.id } : await enrollApp(); if (live) setApp(next); })
      .catch((e) => live && setErr(why(e)));
    return () => { live = false; };
  }, [stage, app]); // eslint-disable-line react-hooks/exhaustive-deps

  const out = async (everywhere) => { await signOut(everywhere); setApp(null); setCode(""); setPw(""); setChanging(false); refresh(); };
  const msgs = <>
    {msg && <p className="success-msg" role="status">{msg}</p>}
    {err && <p className="error-msg" role="alert">{err}</p>}
  </>;
  const pwField = (label, auto) => (
    <label>{label}
      <input type="password" autoComplete={auto} value={pw} onChange={(e) => setPw(e.target.value)} />
    </label>
  );

  if (stage === "out") return (
    <div className="acct">
      <p className="muted">{s.intro}</p>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        const em = email.trim();
        if (mode === "reset") return run(async () => { await sendReset(em); setMsg(s.resetSent); });
        if (mode === "up") { const w = weak(pw); if (w) return setErr(w); return run(async () => { if (await signUp(em, pw)) { setMsg(s.confirmSent); setMode("in"); setPw(""); } else refresh(); }); }
        run(async () => { await signIn(em, pw); setPw(""); refresh(); });
      }}>
        <label>{s.email}
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {mode !== "reset" && pwField(mode === "up" ? s.newPassword : s.password, mode === "up" ? "new-password" : "current-password")}
        <div className="btn-row">
          <button className="btn-primary small" disabled={busy || !email.includes("@") || (mode !== "reset" && !pw)}>
            {mode === "in" ? s.signIn : mode === "up" ? s.signUp : s.sendReset}
          </button>
          {mode === "in" && <button type="button" className="btn-ghost small" onClick={() => { setMode("reset"); setErr(""); }}>{s.forgot}</button>}
          {mode !== "in" && <button type="button" className="btn-ghost small" onClick={() => { setMode("in"); setErr(""); }}>{s.back}</button>}
        </div>
        {mode === "in" && <button type="button" className="link-btn" onClick={() => { setMode("up"); setErr(""); setMsg(""); }}>{s.toSignUp}</button>}
        {msgs}
      </form>
    </div>
  );

  if (stage === "step2") return (
    <div className="acct">
      <p className="acct-step">{app?.qr ? s.setup : s.step2}</p>
      <p className="muted">{app?.qr ? s.setupIntro : s.step2Intro}</p>
      {app?.qr && <div className="acct-qr">
        <img src={app.qr} alt="" width="180" height="180" />
        <p className="muted">{s.secret} <code dir="ltr">{app.secret}</code></p>
      </div>}
      <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { await verifyApp(app.id, code); setCode(""); refresh(); report(await syncNow()); }); }}>
        <label>{s.code}
          <input inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={(e) => setCode(digits(e.target.value, 6))} />
        </label>
        <div className="btn-row">
          <button className="btn-primary small" disabled={busy || !app || code.length !== 6}>{s.verify}</button>
          <button type="button" className="btn-ghost small" onClick={() => run(() => out(false))}>{s.back}</button>
        </div>
        {msgs}
      </form>
    </div>
  );

  const newPw = (title, intro) => (
    <form className="form" onSubmit={(e) => {
      e.preventDefault();
      const w = weak(pw); if (w) return setErr(w);
      run(async () => { await setPassword(pw); setPw(""); setChanging(false); setMsg(s.pwChanged); refresh(); });
    }}>
      <p className="acct-step">{title}</p>
      {intro && <p className="muted">{intro}</p>}
      {pwField(s.newPassword, "new-password")}
      <div className="btn-row">
        <button className="btn-primary small" disabled={busy || !pw}>{s.changePw}</button>
        {changing && <button type="button" className="btn-ghost small" onClick={() => { setChanging(false); setPw(""); setErr(""); }}>{tr.lock.cancel}</button>}
      </div>
    </form>
  );

  if (stage === "newpw") return <div className="acct">{newPw(s.setNew, s.setNewIntro)}{msgs}</div>;

  const kept = conflicts().length;
  return (
    <div className="acct">
      <p><b>{s.signedIn.replace("{email}", account())}</b></p>
      <p className="acct-ok">✓ {s.twoStep}</p>
      <p className="muted">{lastSync() ? s.last.replace("{when}", new Date(lastSync()).toLocaleString()) : s.never}</p>
      <p className="muted">{s.minors}</p>
      {kept > 0 && <p className="muted">{s.conflicts.replace("{n}", kept)}</p>}
      <div className="btn-row">
        <button className="btn-primary small" disabled={busy} onClick={() => run(async () => report(await syncNow()))}>{busy ? s.syncing : s.syncNow}</button>
        {!changing && <button className="btn-ghost small" disabled={busy} onClick={() => { setChanging(true); setMsg(""); }}>{s.changePw}</button>}
        <button className="btn-ghost small" disabled={busy} onClick={() => run(() => out(false))}>{s.signOut}</button>
        <button className="btn-ghost small" disabled={busy} onClick={() => window.confirm(s.confirmAll) && run(() => out(true))}>{s.signOutAll}</button>
      </div>
      {changing && newPw(s.changePw)}
      {msgs}
      <div className="btn-row acct-danger">
        <button className="btn-ghost small danger" disabled={busy}
          onClick={() => window.confirm(s.confirmDelete) && run(async () => { await deleteCloudCopy(); await out(false); setMsg(s.deleted); })}>{s.deleteCloud}</button>
      </div>
    </div>
  );
}
