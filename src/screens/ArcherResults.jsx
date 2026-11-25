import { useState } from "react";
import { getSessions, deleteSession } from "../storage";
import { dropUpload } from "../archer";
import { summary } from "../range";
import SwipeRow from "../SwipeRow";
import Stats from "./Stats";

const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const DAYS = { week: 7, month: 30 };

// The archer's app → Results: how this week, month or everything went, and the last sessions (swipe one away to
// delete it here and on the coach's board). The full charts are one tap further.
export default function ArcherResults({ tr, lang, selectedId }) {
  const x = tr.results, loc = lang === "ar" ? "ar-EG" : "en-GB";
  const [span, setSpan] = useState("month");
  const [now] = useState(() => Date.now()); // fixed while the screen is open
  const [charts, setCharts] = useState(false);
  const [, setTick] = useState(0);
  const all = getSessions().filter((s) => s.athleteId === selectedId && s.range).sort((a, b) => b.range.start_ms - a.range.start_ms);
  const d = DAYS[span];
  const pick = (from, to) => all.filter((s) => s.range.start_ms >= from && s.range.start_ms < to);
  const cur = d ? pick(now - d * 864e5, now + 1) : all, prev = d ? pick(now - 2 * d * 864e5, now - d * 864e5) : [];
  const sum = (list) => { const arrows = list.flatMap((s) => s.range.ends); return summary({ ends: arrows }); };
  const a = sum(cur), b = sum(prev), diff = a.avg != null && b.avg != null ? a.avg - b.avg : null;
  const remove = async (s) => {
    if (!window.confirm(x.confirmDel)) return false;
    deleteSession(s.id); dropUpload(s.range.session_id).catch(() => {}); // off the coach's board too; offline, it drops off later
    setTick((n) => n + 1);
  };
  const day = (ms) => new Date(ms).toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" });

  if (charts) return <>
    <div className="backbar"><button className="btn-ghost small" onClick={() => setCharts(false)}>{x.title}</button></div>
    <Stats tr={tr} lang={lang} selectedId={selectedId} onGo={() => {}} />
  </>;
  return (
    <div className="screen">
      <h2>{x.title}</h2>
      <div className="seg" role="tablist">
        {["week", "month", "all"].map((k) => <button key={k} role="tab" aria-selected={span === k} className={span === k ? "active" : ""} onClick={() => setSpan(k)}>{x[k]}</button>)}
      </div>
      <div className="res-sum">
        <b className="res-big">{a.avg == null ? "–" : a.avg.toFixed(2)}</b>
        <span>{x.perArrow}{diff != null && <> · <span className={diff < 0 ? "down" : ""}>{diff >= 0 ? "↑" : "↓"} {Math.abs(diff).toFixed(2)}</span> {x[`vs_${span}`]}</>}</span>
        <span>{fill(x.arrows, { n: a.arrows })} · {fill(x.sessions, { n: cur.length })}</span>
      </div>
      <h3 className="settings-group">{x.last}</h3>
      {!all.length && <p className="muted">{x.none}</p>}
      <div className="res-list">
        {all.slice(0, 20).map((s) => {
          const r = s.range, m = summary(r);
          return (
            <SwipeRow key={s.id} label={x.del} onDelete={() => remove(s)}>
              <div className="res-row">
                <span className="grow"><b>{day(r.start_ms)} · {r.context.distance_m} m</b>
                  <small>{r.coach_notes ? `${x.coach}: “${r.coach_notes}”` : `${tr.session.types[["Technical", "Physical", "Mental", "Competition", "Mixed"].indexOf(r.type)] || r.type || ""} · ${fill(x.arrows, { n: m.arrows })}`}</small></span>
                <span className="res-score">{m.total}</span>
              </div>
            </SwipeRow>
          );
        })}
      </div>
      {all.length > 0 && <><p className="muted swipe-hint">{x.swipe}</p><button className="btn-ghost" onClick={() => setCharts(true)}>{x.charts}</button></>}
    </div>
  );
}
