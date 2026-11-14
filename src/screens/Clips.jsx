import { useEffect, useState } from "react";
import { getAthletes, getReviews, deleteReview } from "../storage";
import { FAULTS } from "../clips";
import { listClips, getClip, deleteClip, updateClip, hasClipStore } from "../clipStore";
import { useApp } from "../context";
import QuickTag from "../QuickTag";
import Icon from "../icons";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const mb = (bytes) => Math.max(0.1, bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0);

// Saves one clip off the phone: the share sheet where there is one (Save Video, Drive, Nearby Share, AirDrop),
// otherwise a download. Returns true when the coach went through with it.
async function saveOut(clip) {
  const file = new File([clip.blob], clip.id, { type: clip.mime });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: clip.id }); return true; } catch (e) { if (e.name === "AbortError") return false; }
  }
  const a = document.createElement("a"), url = URL.createObjectURL(clip.blob);
  a.href = url; a.download = clip.id; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

function Player({ id }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u = null, alive = true;
    getClip(id).then((c) => { if (alive && c) { u = URL.createObjectURL(c.blob); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <video className="clip-video" src={url} controls playsInline preload="metadata" /> : <div className="clip-video" />;
}

// The clips filmed on this phone for one archer: watch, quick-tag, save off the phone, delete.
// Whole clips live only in this browser's storage until saved, so the screen keeps count of the ones at risk.
export default function Clips({ tr, lang, selectedId, onGo }) {
  const c = tr.clips;
  const { setSelectedId } = useApp();
  const athletes = getAthletes();
  const athlete = athletes.find((a) => a.id === selectedId);
  const [clips, setClips] = useState(() => (hasClipStore() ? null : []));
  const [open, setOpen] = useState(null);
  const [space, setSpace] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => listClips().then((all) => setClips(all.sort((a, b) => b.recordedAt - a.recordedAt))).catch(() => setClips([]));
  useEffect(() => {
    if (!hasClipStore()) return;
    load();
    navigator.storage?.estimate?.().then(setSpace).catch(() => {});
  }, []);

  if (!athlete) return (
    <div className="screen">
      <h2>{c.title}</h2>
      <div className="card"><h3>{c.pick}</h3>
        {athletes.map((a) => <button key={a.id} className="picker-row" onClick={() => setSelectedId(a.id)}><b>{a.name}</b></button>)}
        {!athletes.length && <p>{tr.shell.noArchers}</p>}
      </div>
    </div>
  );

  const reviews = Object.fromEntries(getReviews().map((r) => [r.id, r]));
  const mine = (clips || []).filter((x) => x.athleteId === selectedId);
  const atRisk = (clips || []).filter((x) => !x.savedOut);
  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const when = (t) => new Date(t).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const save = async (clip) => { if (await saveOut(clip)) { await updateClip(clip.id, { savedOut: true }); load(); } };
  const saveAll = async () => { setBusy(true); for (const x of atRisk) await save(x); setBusy(false); };
  const remove = async (clip) => {
    if (!window.confirm(clip.savedOut ? c.confirmDelete : c.confirmDeleteUnsaved)) return;
    await deleteClip(clip.id);
    const rv = reviews[clip.id];
    if (rv && !rv.shot && !rv.verdict && !rv.faults.length) deleteReview(rv.id); // an empty record goes with its video
    setOpen(null); load();
  };

  return (
    <div className="screen clips">
      <h2>{c.title} — {athlete.name}</h2>
      <p className="muted">{c.lead}</p>

      {atRisk.length > 0 && (
        <div className="clips-risk" role="status">
          <Icon name="download" size={20} />
          <span><b>{fill(atRisk.length === 1 ? c.riskOne : c.risk, { n: atRisk.length })}</b>{c.riskHint}</span>
          <button className="btn-primary small" disabled={busy} onClick={saveAll}>{c.saveAll}</button>
        </div>
      )}

      {clips == null ? <p className="muted">{c.loading}</p> : !mine.length ? (
        <div className="card"><p>{c.none}</p><button className="btn-primary" style={{ marginTop: 12 }} onClick={() => onGo("range")}><Icon name="target" size={20} />{c.toRange}</button></div>
      ) : (
        <ul className="clip-list">
          {mine.map((x) => {
            const rv = reviews[x.id], tagged = rv && (rv.verdict || rv.faults.length);
            return (
              <li key={x.id} className={open === x.id ? "open" : ""}>
                <button className="clip-row" onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>
                  <span className={`clip-badge ${rv?.verdict || "none"}`}>{rv?.shot?.score ?? "–"}</span>
                  <span className="clip-what">
                    <b>{rv?.shot ? fill(c.endArrow, { end: rv.shot.end, n: rv.shot.arrow }) : c.noArrow}</b>
                    <small>{when(x.recordedAt)} · {Math.round(x.durationS)} s · {mb(x.size)} MB{!x.savedOut && ` · ${c.onlyHere}`}</small>
                    {tagged ? <small className="clip-tags">{rv.verdict === "good" ? c.good : rv.faults.map((f) => tr.quick.faults[FAULTS.indexOf(f)] || f).join(", ") || c.fault}</small> : <small className="clip-tags none">{c.untagged}</small>}
                  </span>
                  <Icon name={open === x.id ? "down" : "next"} size={18} />
                </button>
                {open === x.id && (
                  <div className="clip-body">
                    <Player id={x.id} />
                    {rv && <QuickTag id={x.id} tr={tr} />}
                    <div className="btn-row">
                      <button className="btn-ghost" onClick={() => save(x)}><Icon name="download" size={18} />{x.savedOut ? c.saveAgain : c.saveOut}</button>
                      <button className="btn-ghost danger" onClick={() => remove(x)}>{c.delete}</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {space?.quota > 0 && <p className="st-note">{fill(c.space, { used: mb(space.usage), free: mb(space.quota - space.usage) })}</p>}
      <p className="st-note">{c.privacy}</p>
    </div>
  );
}
