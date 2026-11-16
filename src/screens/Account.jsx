import { useEffect, useState } from "react";
import {
  account, signedIn, resetting, loadRole, passwordProblem, signIn, signUp, sendReset, setPassword, verifyEmailCode,
  factors, enrollApp, verifyApp, verifyAny, signOut, syncNow, deleteCloudCopy, lastSync, conflicts,
} from "../sync";
import { digits } from "../lock";

// The sign-in form, for a coach (`as="coach"`) or an archer (`as="archer"`).
// Coach: email + password, then a code from an authenticator app; until both are done the database answers nothing
// (migrations/0003) and the app doesn't sync. Archer: email + password only; an archer's account can reach nothing
// but the sessions their own phone uploads (migrations/0004).
export default function Account({ tr, as = "coach", onChange }) {
  const s = tr.sync, coach = as === "coach";
  const [, setTick] = useState(0);
  const refresh = () => { setTick((n) => n + 1); onChange?.(); };
  const [mode, setMode] = useState("in"); // signed out: in | up | reset, then signup | recovery while waiting for the emailed code
  const [email, setEmail] = useState(account);
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [app, setApp] = useState(null); // step 2: { id, qr?, secret? }
  const [backup, setBackup] = useState(null); // signed in, adding a second authenticator: { id, qr, secret }
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { // the session was ended from another device
    const gone = () => { setApp(null); setTick((n) => n + 1); onChange?.(); };
    window.addEventListener("racm-signed-out", gone);
    return () => window.removeEventListener("racm-signed-out", gone);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const done = coach ? signedIn() : Boolean(account());
  const stage = !account() ? "out" : !done ? "step2" : resetting() ? "newpw" : "in";

  const why = (e) => {
    if (e.status === 429) return s.tooMany;
    if (navigator.onLine === false || e instanceof TypeError) return s.offline;
    return { invalid_credentials: s.badLogin, email_not_confirmed: s.notConfirmed, weak_password: s.weak, mfa_verification_failed: s.badCode, otp_expired: s.badCode, signup_disabled: s.signupOff }[e.code]
      || (stage === "step2" && /totp|code/i.test(e.message) ? s.badCode : e.message);
  };
  const run = async (fn) => {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); } catch (e) { setErr(e.shown || why(e)); }
    setBusy(false);
  };
  const weak = (p) => ({ short: s.short, email: s.emailInPw, common: s.common })[passwordProblem(p, email)] || "";
  const report = (r) => setMsg(s.done.replace("{sent}", r.sent).replace("{received}", r.received));
  // An archer's account can't be used as a coach's, or the other way round: the two apps keep different data.
  const sameRole = async () => { if ((await loadRole()) !== as) { await signOut(); throw Object.assign(new Error("role"), { shown: coach ? s.isArcher : s.isCoach }); } };

  // Step 2: find the coach's authenticator, or start setting one up.
  useEffect(() => {
    if (stage !== "step2" || app) return;
    let live = true;
    factors()
      .then(async (list) => { const ok = list.find((x) => x.status === "verified"); const next = ok ? { id: ok.id } : await enrollApp(); if (live) setApp(next); })
      .catch((e) => live && setErr(why(e)));
    return () => { live = false; };
  }, [stage, app]); // eslint-disable-line react-hooks/exhaustive-deps

  const out = async (everywhere) => { await signOut(everywhere); setApp(null); setBackup(null); setCode(""); setPw(""); setChanging(false); refresh(); };
  const msgs = <>
    {msg && <p className="success-msg" role="status">{msg}</p>}
    {err && <p className="error-msg" role="alert">{err}</p>}
  </>;
  const pwField = (label, auto) => (
    <label>{label}
      <input type="password" autoComplete={auto} value={pw} onChange={(e) => setPw(e.target.value)} />
    </label>
  );
  const codeField = (
    <label>{s.code}
      <input inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={(e) => setCode(digits(e.target.value, 6))} />
    </label>
  );
  const qr = (x) => (
    <div className="acct-qr">
      <img src={x.qr} alt="" width="180" height="180" />
      <p className="muted">{s.secret} <code dir="ltr">{x.secret}</code></p>
    </div>
  );
  // Where the coach is in signing in. Archers have one step, so they get no stepper.
  const steps = coach && stage !== "in" && (
    <ol className="acct-steps" aria-label={s.stepsLabel}>
      {[s.stepAccount, s.stepApp].map((label, i) => {
        const at = stage === "out" ? 0 : 1;
        return <li key={label} className={i < at ? "done" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}><b>{i < at ? "✓" : i + 1}</b>{label}</li>;
      })}
    </ol>
  );

  const emailed = mode === "signup" || mode === "recovery";
  if (stage === "out" && emailed) return (
    <div className="acct">
      {steps}
      <p className="muted">{mode === "signup" ? s.confirmSent : s.resetSent}</p>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        run(async () => { await verifyEmailCode(email.trim(), code, mode); setCode(""); if (mode === "signup") await sameRole(); refresh(); });
      }}>
        <label>{s.emailCode}
          <input inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={(e) => setCode(digits(e.target.value, 8))} />
        </label>
        <button className="btn-primary wide-btn" disabled={busy || code.length < 6}>{s.useCode}</button>
        <button type="button" className="link-btn" onClick={() => { setMode("in"); setCode(""); setErr(""); }}>{s.back}</button>
        {err && <p className="error-msg" role="alert">{err}</p>}
      </form>
    </div>
  );

  if (stage === "out") return (
    <div className="acct">
      {steps}
      {mode !== "reset" && (
        <div className="seg" role="tablist">
          {[["in", s.signIn], ["up", s.signUp]].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? "active" : ""} onClick={() => { setMode(k); setErr(""); setMsg(""); }}>{label}</button>
          ))}
        </div>
      )}
      <p className="muted">{mode === "reset" ? s.resetIntro : mode === "up" ? (coach ? s.upIntroCoach : s.upIntroArcher) : (coach ? s.intro : s.introArcher)}</p>
      <form className="form" onSubmit={(e) => {
        e.preventDefault();
        const em = email.trim();
        if (mode === "reset") return run(async () => { await sendReset(em); setMode("recovery"); });
        if (mode === "up") { const w = weak(pw); if (w) return setErr(w); return run(async () => { if (await signUp(em, pw, as)) { setMode("signup"); setPw(""); } else refresh(); }); }
        run(async () => { await signIn(em, pw); setPw(""); await sameRole(); refresh(); });
      }}>
        <label>{s.email}
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {mode !== "reset" && pwField(mode === "up" ? s.newPassword : s.password, mode === "up" ? "new-password" : "current-password")}
        <button className="btn-primary wide-btn" disabled={busy || !email.includes("@") || (mode !== "reset" && !pw)}>
          {mode === "in" ? s.signIn : mode === "up" ? s.signUp : s.sendReset}
        </button>
        {mode === "in" && <button type="button" className="link-btn" onClick={() => { setMode("reset"); setErr(""); }}>{s.forgot}</button>}
        {mode === "reset" && <button type="button" className="link-btn" onClick={() => { setMode("in"); setErr(""); }}>{s.back}</button>}
        {msgs}
      </form>
    </div>
  );

  if (stage === "step2") return (
    <div className="acct">
      {steps}
      <p className="acct-step">{app?.qr ? s.setup : s.step2}</p>
      <p className="muted">{app?.qr ? s.setupIntro : s.step2Intro}</p>
      {app?.qr && qr(app)}
      <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { await (app.qr ? verifyApp(app.id, code) : verifyAny(code)); setCode(""); await sameRole(); refresh(); report(await syncNow()); }); }}>
        {codeField}
        <button className="btn-primary wide-btn" disabled={busy || !app || code.length !== 6}>{s.verify}</button>
        <button type="button" className="link-btn" onClick={() => run(() => out(false))}>{s.back}</button>
        {!app?.qr && <p className="muted">{s.lostApp}</p>}
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
      {coach && <>
        <p className="acct-ok">✓ {s.twoStep}</p>
        <p className="muted">{lastSync() ? s.last.replace("{when}", new Date(lastSync()).toLocaleString()) : s.never}</p>
        <p className="muted">{s.minors}</p>
        {kept > 0 && <p className="muted">{s.conflicts.replace("{n}", kept)}</p>}
      </>}
      <div className="btn-row">
        {coach && <button className="btn-primary small" disabled={busy} onClick={() => run(async () => report(await syncNow()))}>{busy ? s.syncing : s.syncNow}</button>}
        {!changing && <button className="btn-ghost small" disabled={busy} onClick={() => { setChanging(true); setMsg(""); }}>{s.changePw}</button>}
        {coach && !backup && <button className="btn-ghost small" disabled={busy} onClick={() => run(async () => { setCode(""); setBackup(await enrollApp()); })}>{s.addBackup}</button>}
        <button className="btn-ghost small" disabled={busy} onClick={() => run(() => out(false))}>{s.signOut}</button>
        <button className="btn-ghost small" disabled={busy} onClick={() => window.confirm(s.confirmAll) && run(() => out(true))}>{s.signOutAll}</button>
      </div>
      {changing && newPw(s.changePw)}
      {backup && (
        <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { await verifyApp(backup.id, code); setBackup(null); setCode(""); setMsg(s.backupAdded); }); }}>
          <p className="acct-step">{s.addBackup}</p>
          <p className="muted">{s.backupIntro}</p>
          {qr(backup)}
          {codeField}
          <div className="btn-row">
            <button className="btn-primary small" disabled={busy || code.length !== 6}>{s.verify}</button>
            <button type="button" className="btn-ghost small" onClick={() => { setBackup(null); setCode(""); setErr(""); }}>{tr.lock.cancel}</button>
          </div>
        </form>
      )}
      {msgs}
      {coach && <div className="btn-row acct-danger">
        <button className="btn-ghost small danger" disabled={busy}
          onClick={() => window.confirm(s.confirmDelete) && run(async () => { await deleteCloudCopy(); await out(false); setMsg(s.deleted); })}>{s.deleteCloud}</button>
      </div>}
    </div>
  );
}
