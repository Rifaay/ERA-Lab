import { useEffect, useState } from "react";
import { digits, canLock, hasPin, pinOk, setPin, removePin, checkPin, lockAfter, setLockAfter, lockNow, LOCK_EVENT } from "./lock";
import { clearAllData } from "./storage";
import Logo from "./Logo";

// Wraps the whole app. With a PIN set, nothing is drawn until it is typed. Later locks (time away, "Lock now") cover the
// app instead of closing it, so a range session or a half-labelled clip is still there after unlocking.
export function LockGate({ children }) {
  const [opened, setOpened] = useState(() => !hasPin());
  const [locked, setLocked] = useState(hasPin);
  useEffect(() => {
    let away = 0;
    const seen = () => {
      if (document.visibilityState === "hidden") away = Date.now();
      else if (away && hasPin() && Date.now() - away >= lockAfter() * 60_000) setLocked(true);
    };
    const now = () => hasPin() && setLocked(true);
    document.addEventListener("visibilitychange", seen);
    window.addEventListener(LOCK_EVENT, now);
    return () => { document.removeEventListener("visibilitychange", seen); window.removeEventListener(LOCK_EVENT, now); };
  }, []);
  return <>
    {opened && <div className="lock-host" inert={locked || undefined} aria-hidden={locked || undefined}>{children}</div>}
    {locked && <LockScreen onOpen={() => { setLocked(false); setOpened(true); }} />}
  </>;
}

// Shown before the coach has picked a language, so it speaks both.
function LockScreen({ onOpen }) {
  const [pin, setPinText] = useState("");
  const [wait, setWait] = useState(0);
  const [wrong, setWrong] = useState(0); // wrong tries so far: each one shakes the field again
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1000)), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const tryPin = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await checkPin(pin);
    setBusy(false); setPinText("");
    if (r.ok) return onOpen();
    setWrong((n) => n + 1); setWait(r.wait);
  };
  const forgot = () => {
    if (!window.confirm("Forgot your PIN? The only way in is to erase ERA Lab's data on this device. Archers in your cloud copy or a backup file can be brought back after.\n\nنسيت الرمز؟ الطريقة الوحيدة هي مسح بيانات ERA Lab على هذا الجهاز. يمكن استعادة الرماة من النسخة السحابية أو ملف النسخة الاحتياطية بعد ذلك.")) return;
    Promise.resolve(clearAllData()).finally(() => location.reload()); // the clips are erased before the page goes
  };
  const secs = Math.ceil(wait / 1000);
  return (
    <main className="lock-screen">
      <form className="lock-card" onSubmit={tryPin}>
        <span className="logo-tile"><Logo size={48} /></span>
        <h1>ERA Lab</h1>
        <p>Locked · مقفل</p>
        <span key={wrong} className={wrong ? "shake" : undefined}>
          <input type="password" inputMode="numeric" autoComplete="off" autoFocus dir="ltr" aria-label="PIN · الرمز"
            value={pin} onChange={(e) => setPinText(digits(e.target.value, 12))} disabled={secs > 0} />
        </span>
        <button className="btn-primary" disabled={busy || secs > 0 || pin.length < 6}>Unlock · افتح</button>
        {secs > 0 ? <p className="error-msg" role="alert">Too many wrong PINs. Try again in {secs} s · محاولات خاطئة كثيرة. حاول بعد {secs} ث</p>
          : wrong && <p className="error-msg" role="alert">Wrong PIN · رمز خاطئ</p>}
        <button type="button" className="link-btn" onClick={forgot}>Forgot PIN? · نسيت الرمز؟</button>
      </form>
    </main>
  );
}

// Coach profile → Security → Device lock.
export function LockSettings({ tr, onChange }) {
  const l = tr.lock;
  const [mode, setMode] = useState(""); // "" | set | change | remove
  const [cur, setCur] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [after, setAfter] = useState(lockAfter);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canLock()) return <p className="muted">{l.noCrypto}</p>;

  const close = (m = "") => { setMode(""); setCur(""); setA(""); setB(""); setErr(""); setMsg(m); onChange?.(); };
  const typed = (set) => (e) => set(digits(e.target.value, 12));
  const field = (label, v, set, auto = "new-password") => (
    <label>{label}<input type="password" inputMode="numeric" autoComplete={auto} dir="ltr" value={v} onChange={typed(set)} /></label>
  );
  const submit = async (e) => {
    e.preventDefault(); setErr("");
    setBusy(true);
    try {
      if (mode !== "set") { const r = await checkPin(cur); if (!r.ok) return setErr(r.wait ? tr.sync.tooMany : l.wrong); }
      if (mode === "remove") { removePin(); return close(l.removed); }
      if (!pinOk(a)) return setErr(l.bad);
      if (a !== b) return setErr(l.mismatch);
      await setPin(a); setLockAfter(after); close(l.on);
    } finally { setBusy(false); }
  };

  return (
    <div className="lock-settings">
      <p className="muted">{l.intro}</p>
      {!mode && <div className="btn-row">
        {!hasPin() && <button className="btn-primary small" onClick={() => { setMode("set"); setMsg(""); }}>{l.set}</button>}
        {hasPin() && <>
          <button className="btn-primary small" onClick={lockNow}>{l.lockNow}</button>
          <button className="btn-ghost small" onClick={() => { setMode("change"); setMsg(""); }}>{l.change}</button>
          <button className="btn-ghost small" onClick={() => { setMode("remove"); setMsg(""); }}>{l.remove}</button>
        </>}
      </div>}
      {mode && <form className="form" onSubmit={submit}>
        {mode !== "set" && field(l.current, cur, setCur, "current-password")}
        {mode !== "remove" && <>{field(l.pin, a, setA)}{field(l.repeat, b, setB)}</>}
        <div className="btn-row">
          <button className={`btn-primary small ${mode === "remove" ? "danger" : ""}`} disabled={busy}>{mode === "remove" ? l.remove : l.save}</button>
          <button type="button" className="btn-ghost small" onClick={() => close()}>{l.cancel}</button>
        </div>
      </form>}
      {hasPin() && !mode && <label className="lock-after">{l.after}
        <select value={after} onChange={(e) => { const m = +e.target.value; setAfter(m); setLockAfter(m); }}>
          {[1, 5, 15, 30].map((m) => <option key={m} value={m}>{l.minutes.replace("{n}", m)}</option>)}
        </select>
      </label>}
      {msg && <p className="success-msg" role="status">{msg}</p>}
      {err && <p className="error-msg" role="alert">{err}</p>}
    </div>
  );
}
