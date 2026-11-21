import { useEffect, useState } from "react";
import { getAthletes } from "../storage";
import { signedIn, configured } from "../sync";
import { linkOf, isExpired, isLinked, canInvite, createInvite, unlink, refreshInvites, liveOf, finishedOf, pullArchers, inviteUrl, watching, sendNote } from "../archer";
import { qrImage } from "../qr";
import { RING_FILL, rings, summary, scoreValue } from "../range";
import EndStrip from "../EndStrip";
import EndVideo from "../EndVideo";
import Icon from "../icons";

function Face({ s }) {
  const n = rings(s.context.face), ends = s.ends, last = ends.length - 1;
  return (
    <svg className="live-face" viewBox="-104 -104 208 208" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => <circle key={i} r={(100 * (n - i)) / n} fill={RING_FILL[10 - n + i]} stroke={10 - n + i < 2 ? "#222" : 10 - n + i < 4 ? "#bbb" : "#111"} strokeWidth=".6" />)}
      {ends.flatMap((e, k) => e.arrows.filter((a) => a.x != null).map((a) => (
        <circle key={`${k}-${a.arrow}`} cx={a.x * 100} cy={-a.y * 100} r={k === last ? 5 : 3.2} fill={k === last ? "#00e0c6" : "#fff"} fillOpacity={k === last ? 1 : 0.55} stroke="#000" strokeWidth={k === last ? 1.4 : 0.7} />
      )))}
    </svg>
  );
}

const ago = (ms, l) => { const sec = Math.max(0, Math.round((Date.now() - ms) / 1000)); return sec < 60 ? l.secAgo.replace("{n}", sec) : l.minAgo.replace("{n}", Math.round(sec / 60)); };

const endTotal = (e) => e.arrows.reduce((t, a) => t + scoreValue(a.score), 0);

// Coach → Range → Live: every linked archer who is shooting right now, refreshed every few seconds, as small cards
// so many archers fit on one screen. Tapping a card opens that archer's target, every end, and the video links.
export default function LiveBoard({ tr, onCopied }) {
  const l = tr.live;
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ok | offline
  const [open, setOpen] = useState(null); // session_id of the card opened
  const [, setNow] = useState(0);
  const on = configured && signedIn();

  useEffect(() => {
    if (!on) return;
    let live = true, busy = false, told = 0;
    const pull = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      if (Date.now() - told > 15000) { told = Date.now(); watching().catch(() => {}); } // the archers' apps show "coach is watching"
      try { const r = await pullArchers(); if (live) { setRows(r.rows); setState("ok"); if (r.copied) onCopied?.(r.copied); } }
      catch { if (live) setState("offline"); }
      busy = false;
    };
    pull();
    const t = setInterval(pull, 5000), tick = setInterval(() => setNow((n) => n + 1), 1000);
    document.addEventListener("visibilitychange", pull);
    return () => { live = false; clearInterval(t); clearInterval(tick); document.removeEventListener("visibilitychange", pull); };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return <div className="screen"><h2>{l.title}</h2><div className="card"><p>{configured ? l.signIn : l.noCloud}</p></div></div>;
  const athletes = getAthletes(), linked = athletes.filter((a) => isLinked(a.id)), shooting = liveOf(rows, athletes), finished = finishedOf(rows, athletes);
  const opened = [...shooting, ...finished].find((x) => x.session.session_id === open);
  if (opened) return <LiveDetail tr={tr} item={opened} live={!opened.session.end_ms} onBack={() => setOpen(null)} />;

  const mini = ({ athlete, session: s, updated }) => {
    const sum = summary(s), cur = s.ends[s.ends.length - 1], done = !!s.end_ms;
    return (
      <button key={s.session_id} type="button" className={`card live-mini ${done ? "done" : ""}`} onClick={() => setOpen(s.session_id)} aria-label={`${athlete.name}: ${sum.total} / ${sum.outOf}`}>
        <span className="live-mini-head"><b>{athlete.name}</b>{!done && <span className="live-dot" />}</span>
        <span className="live-mini-total" dir="ltr">{sum.total}<small> / {sum.outOf}</small></span>
        <span className="muted">{done ? l.finishedAt.replace("{t}", new Date(s.end_ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) : `${l.end.replace("{n}", cur.end)} · ${ago(updated, l)}`}</span>
        {!done && <EndStrip scores={cur.arrows.map((a) => a.score)} />}
      </button>
    );
  };
  return (
    <div className="screen">
      <h2>{l.title}</h2>
      {state === "offline" && <p className="error-msg" role="status">{l.offline}</p>}
      {!linked.length && <div className="card"><p>{l.none}</p><p className="muted">{l.how}</p></div>}
      {linked.length > 0 && !shooting.length && state !== "loading" && <div className="card"><p>{l.quiet.replace("{n}", linked.length)}</p><p className="muted">{l.quietSub}</p></div>}
      {shooting.length > 0 && <div className="live-grid">{shooting.map(mini)}</div>}
      {finished.length > 0 && <><h3 className="live-sub">{l.finished}</h3><div className="live-grid">{finished.map(mini)}</div></>}
    </div>
  );
}

// One archer, opened from the board: the target with every arrow, each end, and a video link for each end.
function LiveDetail({ tr, item: { athlete, session: s, updated }, live, onBack }) {
  const l = tr.live, sum = summary(s), ends = s.ends.filter((e) => e.arrows.length).reverse(); // newest end first
  return (
    <div className="screen">
      <div className="backbar"><button className="btn-ghost small" onClick={onBack}><Icon name="prev" size={16} />{l.back}</button></div>
      <article className="card live-card">
        <header><b>{athlete.name}</b>{live && <span className="live-dot" />}{live ? ago(updated, l) : l.finishedShort}</header>
        <div className="live-body">
          <Face s={s} />
          <div>
            <div className="live-total" dir="ltr">{sum.total}<small> / {sum.outOf}</small></div>
            <div className="muted">{l.line.replace("{avg}", sum.avg == null ? "–" : sum.avg.toFixed(2)).replace("{arrows}", sum.arrows).replace("{dist}", s.context.distance_m)}</div>
          </div>
        </div>
      </article>
      {live && <NoteBox tr={tr} athlete={athlete} />}
      {ends.map((e, i) => (
        <div key={e.end} className="card live-end-card">
          <div className={`live-end ${i ? "past" : ""}`}><span>{l.end.replace("{n}", e.end)}</span><EndStrip scores={e.arrows.map((a) => a.score)} /><b dir="ltr">{endTotal(e)}</b></div>
          <EndVideo tr={tr} athlete={athlete} sessionId={s.session_id} end={e.end} />
        </div>
      ))}
    </div>
  );
}

// Coach → archer, while they shoot: a short note that shows as a label on the archer's screen. One tap for the usual ones.
function NoteBox({ tr, athlete }) {
  const l = tr.live;
  const [text, setText] = useState("");
  const [state, setState] = useState(""); // "" | busy | sent | error text
  const send = async (note) => {
    note = note.trim();
    if (!note) return;
    setState("busy");
    try { await sendNote(athlete.id, note); setText(""); setState("sent"); }
    catch (e) { setState(navigator.onLine === false || e instanceof TypeError ? tr.sync.offline : /not linked/.test(e.message) ? l.noteNotLinked : e.message); }
  };
  return (
    <form className="card note-box" onSubmit={(e) => { e.preventDefault(); send(text); }}>
      <div className="card-title">{l.noteTitle.replace("{name}", athlete.name)}</div>
      <div className="chip-list">
        {l.notePresets.map((p) => <button key={p} type="button" className="chip" disabled={state === "busy"} onClick={() => send(p)}>{p}</button>)}
      </div>
      <div className="note-row">
        <input value={text} maxLength={200} placeholder={l.notePlaceholder} aria-label={l.notePlaceholder} onChange={(e) => { setText(e.target.value); if (state === "sent") setState(""); }} />
        <button className="btn-primary small" disabled={state === "busy" || !text.trim()}>{l.noteSend}</button>
      </div>
      {state === "sent" ? <p className="success-msg" role="status">✓ {l.noteSent}</p> : state && state !== "busy" ? <p className="error-msg" role="alert">{state}</p> : null}
    </form>
  );
}

// Coach → an archer's page: give this archer their own app, or take it back.
export function ArcherLink({ tr, athlete, onChange }) {
  const l = tr.live;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [, setTick] = useState(0);
  const on = configured && signedIn();
  useEffect(() => { if (on) refreshInvites().then(() => { setTick((n) => n + 1); onChange?.(); }).catch(() => {}); }, [on, athlete.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!configured) return null;

  const link = linkOf(athlete.id), expired = isExpired(link);
  // The phone's share sheet (WhatsApp, Messages…); without one, the message is copied to paste anywhere.
  const share = async (code) => {
    const url = inviteUrl(code), text = l.shareText.replace("{name}", athlete.name).replace("{code}", code);
    try {
      if (navigator.share) await navigator.share({ title: "ERA Lab", text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); setMsg(l.copied); }
    } catch (e) { if (e.name !== "AbortError") setErr(e.message); }
  };
  const run = async (fn) => { setBusy(true); setErr(""); try { await fn(); } catch (e) { setErr(navigator.onLine === false || e instanceof TypeError ? tr.sync.offline : e.message); } setBusy(false); setTick((n) => n + 1); onChange?.(); };
  return (
    <div className="card link-card">
      <div className="card-title">{l.linkTitle}</div>
      {!on ? <p className="muted">{l.signIn}</p>
        : !canInvite(athlete) ? <p className="muted">{l.minor}</p>
        : link?.claimed_by ? <>
            <p className="acct-ok">✓ {l.linked.replace("{name}", athlete.name)}</p>
            <button className="btn-ghost small danger" disabled={busy} onClick={() => window.confirm(l.confirmUnlink.replace("{name}", athlete.name)) && run(() => unlink(athlete.id))}>{l.unlink}</button>
          </>
        : link && !expired ? <>
            <p className="muted">{l.codeIntro.replace("{name}", athlete.name)}</p>
            <img className="invite-qr" src={qrImage(inviteUrl(link.code))} alt={l.qrAlt} width="200" height="200" />
            <button className="btn-primary" disabled={busy} onClick={() => share(link.code)}>{l.share}</button>
            {msg && <p className="success-msg" role="status">{msg}</p>}
            <p className="muted">{l.orCode}</p>
            <p className="invite-code" dir="ltr">{link.code.slice(0, 4)} {link.code.slice(4)}</p>
            <p className="muted">{l.expires.replace("{date}", new Date(link.expires_at).toLocaleDateString())}</p>
            <button className="btn-ghost small" disabled={busy} onClick={() => run(() => createInvite(athlete))}>{l.newCode}</button>
          </>
        : <>
            <p className="muted">{l.inviteIntro.replace("{name}", athlete.name)}</p>
            <button className="btn-primary small" disabled={busy} onClick={() => run(() => createInvite(athlete))}>{l.invite}</button>
          </>}
      {err && <p className="error-msg" role="alert">{err}</p>}
    </div>
  );
}
