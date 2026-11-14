import { useMemo, useState } from "react";
import { getAthletes, getSessions, getReviews, getPlans } from "../storage";
import { RING_FILL, rings } from "../range";
import { periodOf, shiftPeriod, periodStats, findings, groupOf, isoDay } from "../stats";
import Icon from "../icons";
import "./stats.css";

// One archer's statistics for a week, a month, a training block from their plan, or everything.
// Everything is measured against the archer's own arrows; the signature is their group drawn on the face.

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const f2 = (v) => (v == null ? "–" : v.toFixed(2));
const f1 = (v) => (v == null ? "–" : v.toFixed(1));
const KINDS = ["week", "month", "block", "all"];
const CAUSES = ["misses", "fliers", "faults", "aim", "fatigue", "routine", "spread"];

function Glyph({ now, before }) {
  // The archer's group as a ring on a plain face: this period solid, the period before dashed.
  const c = (g) => g && <circle cx={g.cx * 100} cy={-g.cy * 100} r={Math.max(2, g.radius * 100)} />; // the inner half of the face: rings 10 to 6
  return (
    <svg className="st-glyph" viewBox="-52 -52 104 104" dir="ltr" aria-hidden="true">
      {[50, 40, 30, 20, 10].map((r) => <circle key={r} r={r} className="ring" />)}
      <line x1="-3" x2="3" className="ring" /><line y1="-3" y2="3" className="ring" />
      <g className="before">{c(before)}</g>
      <g className="now">{c(now)}</g>
      {now && <circle cx={now.cx * 100} cy={-now.cy * 100} r="1.8" className="dot" />}
    </svg>
  );
}

function ShotMap({ st, prev, s, onPick, picked, compare }) {
  const [sel, setSel] = useState("all");
  const key = st.groups[0]?.key;
  const [group, setGroup] = useState(key);
  const g = st.groups.find((x) => x.key === group) || st.groups[0];
  if (!g) return null;
  const face = g.face, n = rings(face);
  const pick = (as) => as.filter((a) => `${a.distance}|${a.face}` === g.key && a.x != null);
  const shown = pick(st.arrows).filter((a) => sel === "all" || a.sid === sel);
  const old = compare && prev ? pick(prev.arrows) : [];
  const reviewed = new Map(st.reviews.map((r) => [`${r.shot.session_id}/${r.shot.end}/${r.shot.arrow}`, r]));
  const outline = groupOf(shown), oldOutline = old.length ? groupOf(old) : null;
  const sessionIds = [...new Set(pick(st.arrows).map((a) => a.sid))];
  const pickedArrow = picked && shown.find((a) => a === picked);

  return (
    <>
      {st.groups.length > 1 && (
        <div className="chip-list">{st.groups.map((x) => <button key={x.key} className={`chip ${x.key === g.key ? "active" : ""}`} onClick={() => { setGroup(x.key); setSel("all"); onPick(null); }}>{x.distance} m · {s.faces[x.face]}</button>)}</div>
      )}
      <div className="st-chips" role="group" aria-label={s.sessionsLabel}>
        <button className={`chip ${sel === "all" ? "active" : ""}`} onClick={() => setSel("all")}>{s.allSessions}</button>
        {sessionIds.map((id, i) => <button key={id} className={`chip ${sel === id ? "active" : ""}`} onClick={() => setSel(id)}>S{i + 1}</button>)}
      </div>
      <div className="st-map" dir="ltr">
        <svg viewBox="-110 -110 220 220" role="img" aria-label={fill(s.mapLabel, { n: shown.length })}>
          {Array.from({ length: n }, (_, i) => <circle key={i} r={(100 * (n - i)) / n} fill={RING_FILL[10 - n + i]} stroke={10 - n + i < 2 ? "#222" : 10 - n + i < 4 ? "#bbb" : "#111"} strokeWidth=".6" />)}
          {old.map((a, i) => <circle key={`o${i}`} cx={a.x * 100} cy={-a.y * 100} r="2.2" className="st-old" />)}
          {oldOutline && <circle cx={oldOutline.cx * 100} cy={-oldOutline.cy * 100} r={oldOutline.radius * 100} className="st-before" />}
          {shown.map((a, i) => {
            const rv = reviewed.get(`${a.rsid}/${a.end}/${a.n}`);
            return (
              <g key={i} className={`st-arrow ${a === picked ? "on" : ""}`} onClick={() => onPick(a === picked ? null : a)} role="button" tabIndex={0}
                aria-label={`${s.end} ${a.end}, ${a.n}: ${a.score}`} onKeyDown={(e) => e.key === "Enter" && onPick(a)}>
                {rv && <circle cx={a.x * 100} cy={-a.y * 100} r="5.6" className="st-clip" />}
                <circle cx={a.x * 100} cy={-a.y * 100} r="2.5" />
              </g>
            );
          })}
          {outline && ["edge", "line"].map((k) => (
            <g key={k} className={`st-outline ${k}`} pointerEvents="none">
              <circle cx={outline.cx * 100} cy={-outline.cy * 100} r={outline.radius * 100} />
              <line x1={outline.cx * 100 - 6} x2={outline.cx * 100 + 6} y1={-outline.cy * 100} y2={-outline.cy * 100} />
              <line x1={outline.cx * 100} x2={outline.cx * 100} y1={-outline.cy * 100 - 6} y2={-outline.cy * 100 + 6} />
            </g>
          ))}
        </svg>
      </div>
      <p className="st-cap" aria-live="polite">
        {pickedArrow ? (() => {
          const rv = reviewed.get(`${pickedArrow.rsid}/${pickedArrow.end}/${pickedArrow.n}`);
          return <><b>{pickedArrow.date} · {s.end} {pickedArrow.end} · {s.arrow} {pickedArrow.n}: {pickedArrow.score}</b>{rv ? ` · ${s.onClip}: ${rv.faults.join(", ") || s.noFault}` : ""}</>;
        })() : <>{fill(s.mapHint, { n: shown.length })}{st.reviews.length > 0 && ` ${s.clipHint}`}</>}
      </p>
    </>
  );
}

export default function Stats({ tr, lang, selectedId, onGo }) {
  const s = tr.stats;
  const athlete = getAthletes().find((a) => a.id === selectedId);
  const sessions = useMemo(() => getSessions().filter((x) => x.athleteId === selectedId), [selectedId]);
  const reviews = useMemo(() => getReviews(), []);
  const plans = useMemo(() => getPlans().filter((p) => p.athleteId === selectedId), [selectedId]);
  const latest = sessions.map((x) => x.date).sort().at(-1) || isoDay(new Date());
  const first = sessions.map((x) => x.date).sort()[0];
  const ctx = { plans, first };

  const [kind, setKind] = useState("month");
  const [anchor, setAnchor] = useState(latest);
  const [picked, setPicked] = useState(null);
  const [compare, setCompare] = useState(false);

  const period = periodOf(kind, kind === "all" ? isoDay(new Date()) : anchor, ctx);
  const data = { sessions, reviews, athleteId: selectedId };
  const st = useMemo(() => period && periodStats(period, data), [period?.from, period?.to, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevPeriod = period && shiftPeriod(period, -1, ctx);
  const prev = useMemo(() => prevPeriod && periodStats(prevPeriod, data), [prevPeriod?.from, prevPeriod?.to, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!athlete) return <div className="screen"><div className="no-athlete"><div className="no-athlete-icon"><Icon name="chart" size={56} /></div><div className="no-athlete-text">{s.noAthlete}</div></div></div>;

  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const date = (iso, o) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(locale, o); };
  const span = (a, b) => `${date(a, { day: "numeric", month: "short" })} – ${date(b, { day: "numeric", month: "short", year: "numeric" })}`;
  const title = !period ? s.noBlock
    : kind === "month" ? date(period.from, { month: "long", year: "numeric" })
    : kind === "block" ? `${tr.planner.phases[period.phase] || period.phase}` : kind === "all" ? s.allTime : span(period.from, period.to);
  const sub = period && (kind === "block" || kind === "all") ? span(period.from, period.to) : null;
  const step = (dir) => { const q = period ? shiftPeriod(period, dir, ctx) : null; if (q) { setAnchor(q.from); setPicked(null); } };
  const nextOk = period && kind !== "all" && period.to < isoDay(new Date());
  const changeKind = (k) => { setKind(k); setPicked(null); if (k === "block" && !periodOf("block", anchor, ctx)) { const q = shiftPeriod({ kind: "block", from: anchor, to: anchor }, -1, ctx); if (q) setAnchor(q.from); } };

  const main = st?.groups[0];
  const mainPrev = prev?.groups.find((g) => g.key === main?.key);
  const delta = (a, b, digits = 2) => (a == null || b == null ? null : (a - b).toFixed(digits));
  const p = st?.points;
  const per72 = (v) => (st.count.scored ? (v / st.count.scored) * 72 : 0);
  const causes = p ? CAUSES.map((k) => ({ k, v: k === "faults" ? Object.values(p.faults).reduce((t, x) => t + x, 0) : p[k] })).filter((c) => c.v > 0.05) : [];
  const says = st ? findings(st, prev) : [];
  const say = (x) => {
    const L = s.find;
    if (x.kind === "leak") return fill(L.leak, { cause: x.cause === "fault" ? fill(s.faultNamed, { name: x.name }) : s.causes[x.cause].toLowerCase(), n: f1(x.perArrow * 72) });
    if (x.kind === "aim") return fill(L.aim, { d: x.distance, x: `${Math.abs(x.x).toFixed(1)} cm ${x.x > 0 ? s.right : s.left}`, y: `${Math.abs(x.y).toFixed(1)} cm ${x.y > 0 ? s.high : s.low}` });
    if (x.kind === "shape") return fill(x.wide ? L.wide : L.tall, { d: x.distance });
    if (x.kind === "fatigue") return fill(L.fatigue, { a: f2(x.early), b: f2(x.late) });
    if (x.kind === "position") return fill(L.position, { n: x.n, a: f2(x.avg), b: f2(x.others) });
    if (x.kind === "routine") return fill(L.routine, { a: f2(x.yes), b: f2(x.not) });
    if (x.kind === "feel") return fill(x.matches ? L.feelGood : L.feelOff, { a: f2(x.good), b: f2(x.bad) });
    if (x.kind === "readiness") return x.up ? L.readyUp : L.readyDown;
    if (x.kind === "pb") return fill(L.pb, { d: x.distance, a: f2(x.avg) });
    if (x.kind === "trend") return fill(x.to > x.from ? L.up : L.down, { a: f2(x.from), b: f2(x.to) });
    if (x.kind === "volume") return fill(x.change > 0 ? L.more : L.fewer, { n: Math.round(Math.abs(x.change) * 100) });
    if (x.kind === "busiest") return fill(L.busiest, { w: date(x.from, { day: "numeric", month: "short" }), n: x.arrows });
    return "";
  };
  const glyphNow = main && st.arrows.length ? groupOf(st.arrows.filter((a) => `${a.distance}|${a.face}` === main.key)) : null;
  const glyphBefore = main && prev?.arrows.length ? groupOf(prev.arrows.filter((a) => `${a.distance}|${a.face}` === main.key)) : null;

  return (
    <div className="screen st">
      <div className="st-top">
        <div className="st-kinds" role="tablist" aria-label={s.periodLabel}>
          {KINDS.map((k) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => changeKind(k)}>{s.kinds[k]}</button>)}
        </div>
        <div className="st-period">
          <button className="icon-btn" onClick={() => step(-1)} disabled={kind === "all"} aria-label={s.prev}><Icon name="prev" /></button>
          <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
          <button className="icon-btn" onClick={() => step(1)} disabled={!nextOk} aria-label={s.next}><Icon name="next" /></button>
        </div>
      </div>

      {!period ? <p className="muted">{s.noBlockHint}</p> : !st.count.sessions ? <p className="muted st-empty">{fill(s.empty, { name: athlete.name })}</p> : (
        <>
          <section className="st-hero">
            <div className="st-hero-main">
              <span className="st-who">{athlete.name}</span>
              <b className="st-big">{f2(st.avg)}</b>
              <span className="st-unit">{s.perArrow}{delta(st.avg, prev?.avg) != null && <em className={st.avg >= prev.avg ? "up" : "down"}>{st.avg >= prev.avg ? "+" : ""}{delta(st.avg, prev.avg)}</em>}</span>
              <div className="st-hero-row">
                <div><b>{st.count.arrows}</b><span>{s.arrows}</span></div>
                <div><b>{st.count.sessions}</b><span>{s.sessions}</span></div>
                <div><b>{main?.groupCm != null ? `${f1(main.groupCm)}` : "–"}</b><span>{fill(s.groupAt, { d: main?.distance ?? "" })}</span></div>
              </div>
              {prev?.count.sessions > 0 && <p className="st-vs">{fill(s.vsBefore, { a: prev.count.arrows, s: prev.count.sessions })}{mainPrev?.groupCm != null && main?.groupCm != null && ` · ${fill(s.groupWas, { cm: f1(mainPrev.groupCm) })}`}</p>}
            </div>
            <div className="st-hero-glyph"><Glyph now={glyphNow} before={glyphBefore} /><span>{s.glyph}</span></div>
          </section>

          {p && p.lost > 0 && (
            <section className="card">
              <div className="card-title">{s.pointsTitle}</div>
              <p className="st-lead">{fill(s.pointsLead, { got: p.scored, max: p.max, lost: Math.round(p.lost) })}</p>
              <div className="st-stack" aria-hidden="true">
                <i className="got" style={{ flexGrow: p.scored }} />
                {causes.map((c) => <i key={c.k} className={c.k} style={{ flexGrow: c.v }} />)}
              </div>
              <ul className="st-causes">
                {causes.sort((a, b) => b.v - a.v).map((c) => (
                  <li key={c.k}>
                    <span className={`sw ${c.k}`} />
                    <span className="st-cause"><b>{s.causes[c.k]}</b><small>{c.k === "faults" ? Object.entries(p.faults).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${Math.round(v)}`).join(" · ") : s.causeHints[c.k]}</small></span>
                    <span className="st-pts"><b>{Math.round(c.v)}</b><small>{fill(s.per72, { n: f1(per72(c.v)) })}</small></span>
                  </li>
                ))}
              </ul>
              <p className="st-note">{fill(s.pointsNote, { n: st.count.scored })}</p>
            </section>
          )}

          {says.length > 0 && (
            <section className="card">
              <div className="card-title">{s.findTitle}</div>
              <ol className="st-find">{says.slice(0, 6).map((x, i) => <li key={i} className={x.kind}>{say(x)}</li>)}</ol>
            </section>
          )}

          {st.count.plotted > 0 && (
            <section className="card">
              <div className="card-header">
                <div className="card-title">{s.mapTitle}</div>
                {prev?.count.plotted > 0 && <button className={`btn-ghost small ${compare ? "active" : ""}`} aria-pressed={compare} onClick={() => setCompare(!compare)}>{s.compare}</button>}
              </div>
              <ShotMap st={st} prev={prev} s={{ ...s, faces: tr.range.faces }} onPick={setPicked} picked={picked} compare={compare} />
              {compare && <p className="st-note">{s.compareNote}</p>}
            </section>
          )}

          <section className="card">
            <div className="card-title">{s.byDistance}</div>
            <div className="st-scroll">
              <table className="st-table">
                <thead><tr><th>{s.distance}</th><th>{s.arrows}</th><th>{s.avg}</th><th>{s.group}</th><th>{s.centre}</th><th>{s.best}</th></tr></thead>
                <tbody>{st.groups.map((g) => (
                  <tr key={g.key}>
                    <td><b>{g.distance} m</b><small>{tr.range.faces[g.face]}</small></td><td>{g.arrows}</td><td>{f2(g.avg)}</td>
                    <td>{g.groupCm != null ? `${f1(g.groupCm)} cm` : "–"}</td>
                    <td>{g.offsetXcm != null ? `${Math.abs(g.offsetXcm).toFixed(1)} ${g.offsetXcm > 0 ? s.rightShort : s.leftShort} · ${Math.abs(g.offsetYcm).toFixed(1)} ${g.offsetYcm > 0 ? s.highShort : s.lowShort}` : "–"}</td>
                    <td>{g.best ? <>{f2(g.best.avg)}{g.isPb && <span className="st-pb">{s.pb}</span>}</> : "–"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {st.groups.some((g) => g.groupCm != null) && <p className="st-note">{s.groupNote}</p>}
          </section>

          {st.byThird.some((x) => x != null) && (
            <section className="card">
              <div className="card-title">{s.throughTitle}</div>
              <div className="st-bars">
                {st.byThird.map((v, i) => <Bar key={i} label={s.thirds[i]} v={v} max={10} />)}
              </div>
              {st.positions.length > 1 && <>
                <h4 className="st-h4">{s.positionTitle}</h4>
                <div className="st-bars">{st.positions.map((x) => <Bar key={x.n} label={fill(s.arrowN, { n: x.n })} v={x.avg} max={10} />)}</div>
              </>}
              {st.endSd != null && <p className="st-note">{fill(s.endSd, { n: f2(st.endSd) })}</p>}
            </section>
          )}

          <section className="card">
            <div className="card-title">{s.habitsTitle}</div>
            <dl className="st-facts">
              {st.routine.yesN > 0 && st.routine.notN > 0 && <><dt>{s.routineFact}</dt><dd>{f2(st.routine.yes)} <small>/ {f2(st.routine.not)}</small></dd></>}
              {st.feel.goodN > 0 && st.feel.badN > 0 && <><dt>{s.feelFact}</dt><dd>{f2(st.feel.good)} <small>/ {f2(st.feel.bad)}</small></dd></>}
              {st.wind.map((w) => <Fragment2 key={w.value} dt={`${s.wind}: ${tr.range.winds[["Calm", "Light", "Moderate", "Strong", "Gusty"].indexOf(w.value)] ?? w.value}`} dd={`${f2(w.avg)} · ${w.count}`} />)}
              {st.light.map((w) => <Fragment2 key={w.value} dt={`${s.light}: ${tr.range.lights[["Sunny", "Cloudy", "Indoor", "Floodlights"].indexOf(w.value)] ?? w.value}`} dd={`${f2(w.avg)} · ${w.count}`} />)}
              {st.readinessLink != null && <><dt>{s.readinessFact}</dt><dd>{st.readinessLink.toFixed(2)}</dd></>}
              <dt>{s.xs}</dt><dd>{st.xs} · {st.tens}</dd>
              <dt>{s.misses}</dt><dd>{st.misses}</dd>
            </dl>
            <p className="st-note">{s.habitsNote}</p>
          </section>

          <section className="card">
            <div className="card-header"><div className="card-title">{s.faultsTitle}</div><button className="btn-ghost small" onClick={() => onGo("review")}>{s.openReview}</button></div>
            {st.faults.length ? (
              <ul className="st-faults">{st.faults.map((x) => <li key={x.name}><b>{x.name}</b><span>{fill(s.faultCount, { n: x.count })}</span><span>{x.cost != null ? fill(x.cost >= 0 ? s.faultCost : s.faultGain, { n: f2(Math.abs(x.cost)) }) : ""}</span></li>)}</ul>
            ) : <p className="muted">{s.noFaults}</p>}
          </section>

          {st.weeks.length > 1 && (
            <section className="card">
              <div className="card-title">{s.weeksTitle}</div>
              <ul className="st-weeks">
                {(() => { const top = Math.max(1, ...st.weeks.map((w) => w.arrows)); return st.weeks.filter((w) => w.from <= isoDay(new Date())).map((w, i) => (
                  <li key={w.from} className={w.arrows ? "" : "off"}>
                    <span className="n">{i + 1}</span>
                    <span className="d"><b>{date(w.from, { day: "numeric", month: "short" })} – {date(w.to, { day: "numeric", month: "short" })}</b><i style={{ width: `${(w.arrows / top) * 100}%` }} /></span>
                    <span className="v">{w.arrows ? <>{w.arrows}<small>{f2(w.avg)}</small></> : s.noTraining}</span>
                  </li>
                )); })()}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Bar({ label, v, max }) {
  return <div className="st-bar"><span>{label}</span><i><em style={{ width: `${v == null ? 0 : (v / max) * 100}%` }} /></i><b>{f2(v)}</b></div>;
}
function Fragment2({ dt, dd }) {
  return <><dt>{dt}</dt><dd>{dd}</dd></>;
}
