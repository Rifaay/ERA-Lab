import { useState } from "react";
import { getAthletes, getSessions, saveSession, deleteSession, uid } from "../storage";
import Icon from "../icons";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import Scorecard from "./Scorecard";
import { scorecardFile, scorecardPdf, saveHtmlFile } from "../scorecardFile";
import EndVideo from "../EndVideo";
import { localize } from "../digits";
import { configured, signedIn } from "../sync";
import { forgetArcherSession } from "../archer";

const TYPES = ["Technical", "Physical", "Mental", "Competition", "Mixed"];
const DOMAINS = ["Technical", "Physical", "Mental", "Competition"];
const BLANK = {
  date: new Date().toISOString().slice(0, 10),
  type: "Technical", duration: "", arrows: "", distance: "",
  round: "", score: "", outOf: "",
  condition: "", quality: "", archerReport: "",
  domains: [], notes: "", ramadan: false,
};

export default function SessionLogger({ lang, tr, selectedId }) {
  const s = tr.session;
  const athletes = getAthletes();
  const athlete = athletes.find((a) => a.id === selectedId) || null;

  const [form, setForm] = useState({ ...BLANK });
  const [saved, setSaved] = useState(false);
  const [sessions, setSessions] = useState(() =>
    getSessions().filter((x) => x.athleteId === selectedId).reverse().slice(0, 12)
  );

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleDomain = (d) =>
    setForm((f) => ({
      ...f,
      domains: f.domains.includes(d) ? f.domains.filter((x) => x !== d) : [...f.domains, d],
    }));

  // The form resets after saving, so without this a double tap also stores an empty session.
  const isBlank = !form.domains.length && ["duration", "arrows", "distance", "round", "score", "outOf", "condition", "quality", "archerReport", "notes"].every((k) => !String(form[k]).trim());

  const handleSave = () => {
    if (isBlank) return;
    if (form.score !== "" && (+form.score < 0 || (form.outOf !== "" && +form.score > +form.outOf))) { window.alert(s.scoreInvalid); return; }
    saveSession({ ...form, id: uid(), athleteId: selectedId });
    setSessions(getSessions().filter((x) => x.athleteId === selectedId).reverse().slice(0, 12));
    setForm({ ...BLANK });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Sessions recorded on the Range screen: the same scorecard web file the Range screen saves when the session ends.
  const sheetOf = (r) => {
    const host = document.createElement("div"), root = createRoot(host);
    flushSync(() => root.render(<Scorecard s={r} tr={tr} lang={lang} />));
    localize(host, lang);
    const html = host.innerHTML;
    root.unmount();
    return html;
  };
  const downloadScorecard = (r) => saveHtmlFile(`Scorecard ${r.session_id}.html`, scorecardFile(sheetOf(r), { lang, title: `Scorecard ${r.session_id}` }));
  const downloadPdf = (r) => scorecardPdf(sheetOf(r), { lang, title: `Scorecard ${r.session_id}` }).catch((e) => { console.warn("PDF failed", e); window.alert(tr.range.pdfFailed); });
  const [videos, setVideos] = useState(null); // the session whose ends are being linked to clips

  const handleDelete = async (id) => {
    const x = getSessions().find((q) => q.id === id);
    if (x?.fromArcher && x.range?.session_id && configured && signedIn()) {
      try { await forgetArcherSession(x.range.session_id); } catch { window.alert(tr.sync.offline); return; } // kept here, or it would come back
    }
    deleteSession(id);
    setSessions(getSessions().filter((x) => x.athleteId === selectedId).reverse().slice(0, 12));
  };

  if (!athlete) return (
    <div className="screen">
      <div className="no-athlete">
        <div className="no-athlete-icon"><Icon name="target" size={56} /></div>
        <div className="no-athlete-text">{s.noAthlete}</div>
      </div>
    </div>
  );

  return (
    <div className="screen">
      <h2>{s.title}</h2>

      <div className="card">
        <div className="form">
          <div className="form-row">
            <label>{s.date}
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </label>
            <label>{s.type}
              <select value={form.type} onChange={(e) => set("type", e.target.value)}>
                {TYPES.map((t, i) => <option key={t} value={t}>{s.types[i]}</option>)}
              </select>
            </label>
            <label>{s.duration}
              <input type="number" value={form.duration} onChange={(e) => set("duration", e.target.value)} min="0" />
            </label>
          </div>

          <div className="form-row">
            <label>{s.arrows}
              <input type="number" value={form.arrows} onChange={(e) => set("arrows", e.target.value)} min="0" />
            </label>
            <label>{s.distance}
              <input type="number" value={form.distance} onChange={(e) => set("distance", e.target.value)} min="0" />
            </label>
            <label>{s.round}
              <input value={form.round} onChange={(e) => set("round", e.target.value)} placeholder="WA 70m, 3D…" />
            </label>
          </div>

          <div className="form-row">
            <label>{s.score}
              <input type="number" value={form.score} onChange={(e) => set("score", e.target.value)} />
            </label>
            <label>{s.outOf}
              <input type="number" value={form.outOf} onChange={(e) => set("outOf", e.target.value)} />
            </label>
            <label>{s.quality}
              <select value={form.quality} onChange={(e) => set("quality", e.target.value)}>
                <option value="">—</option>
                {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          <label>{s.condition}
            <input value={form.condition} onChange={(e) => set("condition", e.target.value)} placeholder={s.conditionNote} />
          </label>

          <div>
            <label style={{ marginBottom: 6 }}>{s.domains}</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {DOMAINS.map((d, i) => (
                <button key={d} type="button" className={`chip ${form.domains.includes(d) ? "active" : ""}`} aria-pressed={form.domains.includes(d)} onClick={() => toggleDomain(d)}>{s.domainList[i]}</button>
              ))}
            </div>
          </div>

          <label>{s.archerReport}
            <textarea rows={2} value={form.archerReport} onChange={(e) => set("archerReport", e.target.value)} placeholder={s.archerReportNote} />
          </label>

          <label>{s.notes}
            <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>

          <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer", textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={form.ramadan} onChange={(e) => set("ramadan", e.target.checked)} />
            <span style={{ fontSize: 13, color: "var(--tx)", fontWeight: 500 }}>{s.ramadan}</span>
          </label>

          <div className="btn-row">
            <button className="btn-primary" onClick={handleSave} disabled={!form.date || isBlank}>{s.save}</button>
          </div>
          {saved && <p className="success-msg">{s.saved}</p>}
        </div>
      </div>

      {sessions.length > 0 && (
        <>
          <h3 style={{ color: "var(--txm)", marginBottom: 8, marginTop: 4 }}>{s.history}</h3>
          {sessions.map((sess) => (
            <div key={sess.id} className="card" style={{ padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="badge gray">{sess.date}</span>
                  <span className="badge blue">{s.types[TYPES.indexOf(sess.type)] ?? sess.type}</span>
                  {sess.duration && <span className="badge gray">{sess.duration} {tr.common.min}</span>}
                  {sess.arrows && <span className="badge gray">{sess.arrows} {tr.range.arrowsWord}</span>}
                  {sess.score && <span className="badge teal">{sess.score}{sess.outOf ? `/${sess.outOf}` : ""}</span>}
                  {sess.quality && <span className="badge gray">{tr.settings.qShort}{sess.quality}</span>}
                  {sess.ramadan && <span className="badge amber"><Icon name="moon" size={13} label={tr.session.ramadan} /></span>}
                </div>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {sess.range && <button className="btn-ghost small" aria-expanded={videos === sess.id} onClick={() => setVideos(videos === sess.id ? null : sess.id)}><Icon name="clip" size={14} />{tr.clips.endVideo}</button>}
                  {sess.range && <button className="btn-ghost small" onClick={() => downloadPdf(sess.range)}>{tr.range.pdf}</button>}
                  {sess.range && <button className="btn-ghost small" onClick={() => downloadScorecard(sess.range)}>{tr.range.file}</button>}
                  <button className="del-btn" onClick={() => handleDelete(sess.id)}><Icon name="x" size={16} /></button>
                </span>
              </div>
              {sess.notes && <p style={{ fontSize: 11, color: "var(--txm)", marginTop: 4 }}>{sess.notes}</p>}
              {videos === sess.id && sess.range.ends.filter((e) => e.arrows.length).map((e) => <EndVideo key={e.end} tr={tr} athlete={athlete} sessionId={sess.range.session_id} end={e.end} />)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
