import { useEffect, useRef, useState } from "react";
import { getAthletes, getReviews, saveReview, deleteReview, getSessions, getRange } from "../storage";
import { FAULTS, quickReview, suggestShot, arrowChoices } from "../clips";
import { listClips, getClip, putClip, deleteClip, updateClip, hasClipStore } from "../clipStore";
import ArcherSelect from "../ArcherSelect";
import { useApp } from "../context";
import QuickTag from "../QuickTag";
import Icon from "../icons";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
// How long a video file runs, read from the file itself; 0 when the browser cannot tell.
const durationOf = (file) => new Promise((resolve) => {
  const v = document.createElement("video"), url = URL.createObjectURL(file);
  const done = (d) => { URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? d : 0); };
  v.preload = "metadata"; v.onloadedmetadata = () => done(v.duration); v.onerror = () => done(0);
  setTimeout(() => done(v.duration), 4000);
  v.src = url;
});

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
  const [, setTick] = useState(0); // review records live in storage; this re-reads them after a change
  const fileRef = useRef(null);

  const load = () => listClips().then((all) => setClips(all.sort((a, b) => b.recordedAt - a.recordedAt))).catch(() => setClips([]));
  useEffect(() => {
    if (!hasClipStore()) return;
    load();
    navigator.storage?.estimate?.().then(setSpace).catch(() => {});
  }, []);

  if (!athlete) return (
    <div className="screen">
      <h2>{c.title}</h2>
      <ArcherSelect tr={tr} athletes={athletes} selectedId={selectedId} onPick={setSelectedId} prompt={c.pick} />
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

  // This archer's range sessions, the one being shot now included, and the arrows that already have a clip.
  const sessions = getSessions(), live = getRange().live;
  const liveHere = live?.athlete_id === selectedId ? [{ athleteId: selectedId, date: new Date().toISOString().slice(0, 10), range: live }] : [];
  const ranges = [...sessions.filter((x) => x.athleteId === selectedId && x.range).map((x) => x.range), ...liveHere.map((x) => x.range)];
  const taken = new Set(Object.values(reviews).filter((r) => r.shot).map((r) => `${r.shot.session_id}/${r.shot.end}/${r.shot.arrow}`));
  const keyOf = (a) => `${a.session_id}/${a.end}/${a.arrow}`;
  const choicesFor = (x) => [...arrowChoices(sessions, selectedId, x.recordedAt), ...arrowChoices(liveHere, selectedId, x.recordedAt)];
  const link = (id, shot) => {
    const rv = reviews[id];
    if (!rv) return;
    saveReview({ ...rv, shot: shot && { session_id: shot.session_id, end: shot.end, arrow: shot.arrow, score: shot.score }, savedAt: new Date().toISOString() });
    setTick((n) => n + 1);
  };

  // Clips from another camera or the gallery. The file's time (the camera's clock) suggests the arrow; the coach confirms.
  const importFiles = async (files) => {
    setBusy(true);
    const have = new Set((clips || []).map((x) => x.id));
    let first = null;
    for (const file of files) {
      if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) continue;
      const durationS = await durationOf(file);
      const end = file.lastModified, start = end - durationS * 1000; // a camera stamps the file when it stops recording
      const id = have.has(file.name) ? `${start}_${file.name}` : file.name; // keep the camera's name, so the computer's copy matches
      have.add(id);
      try {
        // savedOut: the original is still on the camera or in the gallery, so this copy is not the only one
        await putClip({ id, athleteId: athlete.id, blob: file, mime: file.type || "video/mp4", size: file.size, durationS, recordedAt: start, savedOut: true, source: "import",
          suggest: suggestShot(ranges, start, end, taken) });
      } catch (e) { window.alert(`${tr.range.clipFailed}\n${e.message}`); break; }
      if (!reviews[id]) saveReview(quickReview({ id, athlete, at: start }));
      first ||= id;
    }
    setBusy(false); await load();
    if (first) setOpen(first);
  };

  return (
    <div className="screen clips">
      <h2>{c.title} — {athlete.name}</h2>
      <p className="muted">{c.lead}</p>
      <div className="clips-actions">
        <button className="btn-ghost" disabled={busy} onClick={() => fileRef.current.click()}><Icon name="import" size={18} />{busy ? c.importing : c.import}</button>
        <input ref={fileRef} type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple hidden onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) importFiles(f); }} />
        <small>{c.importHint}</small>
      </div>

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
                    {rv && !rv.shot && x.suggest && (
                      <div className="clip-suggest" role="status">
                        <span><b>{fill(c.suggested, { end: x.suggest.end, n: x.suggest.arrow, score: x.suggest.score })}</b>{x.suggest.how === "end" ? c.suggestEnd : c.suggestArrow}</span>
                        <button className="btn-primary small" onClick={() => link(x.id, x.suggest)}><Icon name="check" size={16} />{c.confirm}</button>
                      </div>
                    )}
                    {rv && (() => {
                      const choices = choicesFor(x);
                      return (
                        <label className="clip-link">{c.linkTo}
                          <select value={rv.shot ? keyOf(rv.shot) : ""} onChange={(e) => link(x.id, choices.find((a) => keyOf(a) === e.target.value) || null)}>
                            <option value="">{c.noArrow}</option>
                            {rv.shot && !choices.some((a) => keyOf(a) === keyOf(rv.shot)) && <option value={keyOf(rv.shot)}>{fill(c.endArrow, { end: rv.shot.end, n: rv.shot.arrow })}</option>}
                            {choices.map((a) => <option key={keyOf(a)} value={keyOf(a)}>{a.date} · {fill(c.endArrow, { end: a.end, n: a.arrow })} ({a.score})</option>)}
                          </select>
                        </label>
                      );
                    })()}
                    {rv && <QuickTag key={`${x.id}-${rv.shot ? keyOf(rv.shot) : ""}`} id={x.id} tr={tr} />}
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
