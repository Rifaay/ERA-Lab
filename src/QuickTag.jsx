import { useState } from "react";
import "./clips.css";
import { getReviews, saveReview } from "./storage";
import { FAULTS, toggleFault, setVerdict } from "./clips";
import Icon from "./icons";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

// Quick tag for one clip: good shot or fault, which faults, a short note. Every tap is saved at once.
// The full analysis (phases, body points) happens later in the Labeller on the computer.
export default function QuickTag({ id, tr, onClose }) {
  const q = tr.quick;
  const [rv, setRv] = useState(() => getReviews().find((x) => x.id === id) || null);
  const [more, setMore] = useState(false);
  if (!rv) return null;
  const keep = (next) => { setRv(next); saveReview(next); };
  const faults = more ? FAULTS : FAULTS.slice(0, 6);

  return (
    <div className="quick" role="group" aria-label={q.title}>
      <div className="quick-head">
        <b>{rv.shot?.whole ? fill(tr.clips.wholeEnd, rv.shot) : rv.shot ? fill(q.forArrow, { end: rv.shot.end, n: rv.shot.arrow, score: rv.shot.score ?? "" }) : q.unlinked}</b>
        {onClose && <button className="icon-btn" onClick={onClose} aria-label={q.done}><Icon name="x" size={18} /></button>}
      </div>
      <div className="quick-verdict">
        <button className={`chip good ${rv.verdict === "good" ? "active" : ""}`} aria-pressed={rv.verdict === "good"} onClick={() => keep(setVerdict(rv, "good"))}><Icon name="check" size={16} />{q.good}</button>
        <button className={`chip fault ${rv.verdict === "fault" ? "active" : ""}`} aria-pressed={rv.verdict === "fault"} onClick={() => keep(setVerdict(rv, "fault"))}>{q.fault}</button>
      </div>
      <div className="chip-list quick-faults">
        {faults.map((f) => (
          <button key={f} className={`chip ${rv.faults.includes(f) ? "active" : ""}`} aria-pressed={rv.faults.includes(f)} onClick={() => keep(toggleFault(rv, f))}>{q.faults[FAULTS.indexOf(f)] || f}</button>
        )).concat(rv.faults.filter((f) => !FAULTS.includes(f)).map((f) => <button key={f} className="chip active" onClick={() => keep(toggleFault(rv, f))}>{f}</button>))}
        {!more && <button className="chip ghost" onClick={() => setMore(true)}>{q.more}</button>}
      </div>
      <input value={rv.notes} placeholder={q.notePh} aria-label={q.note} onChange={(e) => keep({ ...rv, notes: e.target.value, savedAt: new Date().toISOString() })} />
    </div>
  );
}
