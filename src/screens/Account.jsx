import { useState } from "react";
import { account, sendCode, verifyCode, signOut, syncNow, deleteCloudCopy, lastSync, conflicts } from "../sync";

// Settings → Cloud copy: sign in with a code sent by email, then the app keeps this device and the cloud in step.
export default function Account({ tr }) {
  const s = tr.sync;
  const [email, setEmail] = useState(account);
  const [signedIn, setSignedIn] = useState(() => Boolean(account()));
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const run = async (fn) => {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); } catch (e) { setErr(e.status === 429 ? s.tooMany : navigator.onLine === false ? s.offline : e.message); }
    setBusy(false);
  };
  const report = (r) => setMsg(s.done.replace("{sent}", r.sent).replace("{received}", r.received));

  if (!signedIn) return (
    <div className="card settings-section">
      <div className="settings-label">{s.title}</div>
      <p className="muted" style={{ marginBottom: 10 }}>{s.intro}</p>
      <div className="form">
        <label>{s.email}
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={codeSent} />
        </label>
        {!codeSent && <button className="btn-primary small" style={{ alignSelf: "flex-start" }} disabled={busy || !email.includes("@")}
          onClick={() => run(async () => { await sendCode(email.trim()); setCodeSent(true); })}>{s.send}</button>}
        {codeSent && <>
          <label>{s.code}
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} maxLength={10} />
          </label>
          <div className="btn-row">
            <button className="btn-primary small" disabled={busy || code.length < 6}
              onClick={() => run(async () => { await verifyCode(email.trim(), code); setSignedIn(true); report(await syncNow()); })}>{s.verify}</button>
            <button className="btn-ghost small" onClick={() => { setCodeSent(false); setCode(""); }}>{s.changeEmail}</button>
          </div>
        </>}
        {msg && <p className="success-msg" role="status">{msg}</p>}
        {err && <p className="error-msg" role="alert">{err}</p>}
      </div>
    </div>
  );

  const kept = conflicts().length;
  return (
    <div className="card settings-section">
      <div className="settings-label">{s.title}</div>
      <p>{s.signedIn.replace("{email}", account())}</p>
      <p className="muted">{lastSync() ? s.last.replace("{when}", new Date(lastSync()).toLocaleString()) : s.never}</p>
      <p className="muted" style={{ margin: "6px 0 10px" }}>{s.minors}</p>
      {kept > 0 && <p className="muted">{s.conflicts.replace("{n}", kept)}</p>}
      <div className="btn-row">
        <button className="btn-primary small" disabled={busy} onClick={() => run(async () => report(await syncNow()))}>{busy ? s.syncing : s.syncNow}</button>
        <button className="btn-ghost small" disabled={busy} onClick={() => run(async () => { await signOut(); setSignedIn(false); setCodeSent(false); setCode(""); })}>{s.signOut}</button>
        <button className="btn-ghost small danger" disabled={busy}
          onClick={() => window.confirm(s.confirmDelete) && run(async () => { await deleteCloudCopy(); await signOut(); setSignedIn(false); setMsg(s.deleted); })}>{s.deleteCloud}</button>
      </div>
      {msg && <p className="success-msg" role="status">{msg}</p>}
      {err && <p className="error-msg" role="alert">{err}</p>}
    </div>
  );
}
