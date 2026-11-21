import { useState } from "react";
import { useApp } from "../context";
import { pushSupported, needsHomeScreen, pushState, turnOn, turnOff, setKind, kindsFor } from "../push";

// Settings → Notifications, for the signed-in account on this phone. Each kind can be switched off on its own.
export default function Notifications({ tr }) {
  const n = tr.push, { lang } = useApp();
  const [state, setState] = useState(pushState);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { setErr(e.code === "denied" ? n.denied : e.code === "gone" ? n.gone : navigator.onLine === false || e instanceof TypeError ? tr.sync.offline : e.message); }
    setState(pushState()); setBusy(false);
  };

  if (!pushSupported()) return <p className="muted">{needsHomeScreen() ? n.homeScreen : n.unsupported}</p>;
  if (!state) return <>
    <p className="muted">{n.intro}</p>
    {Notification.permission === "denied" ? <p className="muted">{n.denied}</p>
      : <button className="btn-primary small" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => run(() => turnOn(lang))}>{n.turnOn}</button>}
    {err && <p className="error-msg" role="alert">{err}</p>}
  </>;
  return <>
    {kindsFor().map((k) => (
      <label key={k} className="pz-check">
        <input type="checkbox" checked={Boolean(state.prefs?.[k])} disabled={busy} onChange={(e) => run(() => setKind(k, e.target.checked, lang))} />
        <span>{n.kinds[k]}<br /><small className="muted">{n.about[k]}</small></span>
      </label>
    ))}
    <button className="btn-ghost small" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => run(turnOff)}>{n.turnOff}</button>
    {err && <p className="error-msg" role="alert">{err}</p>}
  </>;
}
