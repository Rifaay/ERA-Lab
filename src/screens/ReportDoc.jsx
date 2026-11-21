import { RING_FILL, rings } from "../range";
import { groupOf } from "../stats";
import { findingText } from "../findingText";
import { FAULTS } from "../clips";

// The archer report as a document: no buttons, no app frame. On screen it is a page preview; printed it is A4.
// d: reportData() for one archer and one period. show: the sections the coach ticked.

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const f1 = (v) => (v == null ? "–" : v.toFixed(1));
const f2 = (v) => (v == null ? "–" : v.toFixed(2));
const CAUSES = ["misses", "fliers", "faults", "aim", "fatigue", "routine", "spread"];
const TYPES = ["Technical", "Physical", "Mental", "Competition", "Mixed"];

function Delta({ now, before, digits = 2, unit = "", lowerIsBetter = false }) {
  if (now == null || before == null) return null;
  const d = now - before;
  if (Math.abs(d) < 10 ** -digits / 2) return <em className="rd-d flat" dir="ltr">±0</em>;
  const good = lowerIsBetter ? d < 0 : d > 0;
  return <em className={`rd-d ${good ? "up" : "down"}`} dir="ltr">{d > 0 ? "+" : "−"}{Math.abs(d).toFixed(digits)}{unit}</em>;
}

function Face({ st, main }) {
  const n = rings(main.face), arrows = st.arrows.filter((a) => `${a.distance}|${a.face}` === main.key && a.x != null), g = groupOf(arrows);
  return (
    <svg viewBox="-108 -108 216 216" className="rd-face" dir="ltr" role="img" aria-label={`${arrows.length}`}>
      {Array.from({ length: n }, (_, i) => <circle key={i} r={(100 * (n - i)) / n} fill={RING_FILL[10 - n + i]} stroke={10 - n + i < 2 ? "#222" : 10 - n + i < 4 ? "#bbb" : "#111"} strokeWidth=".6" />)}
      {arrows.map((a, i) => <circle key={i} cx={a.x * 100} cy={-a.y * 100} r="2.3" fill="#00e0c6" fillOpacity=".9" stroke="#000" strokeWidth=".7" />)}
      {g && ["#000", "#ff0"].map((c, i) => (
        <g key={c} stroke={c} strokeWidth={i ? 1.8 : 3.8} fill="none">
          <circle cx={g.cx * 100} cy={-g.cy * 100} r={g.radius * 100} />
          <line x1={g.cx * 100 - 5} x2={g.cx * 100 + 5} y1={-g.cy * 100} y2={-g.cy * 100} /><line x1={g.cx * 100} x2={g.cx * 100} y1={-g.cy * 100 - 5} y2={-g.cy * 100 + 5} />
        </g>
      ))}
    </svg>
  );
}

function Progress({ rows, label }) {
  const vals = rows.map((r) => r.avg).filter((v) => v != null);
  if (!vals.length) return null;
  const lo = Math.max(0, Math.floor(Math.min(...vals)) - 1), hi = 10, W = 640, H = 130; // fixed drawing width, so text keeps its size
  const y = (v) => H - ((v - lo) / (hi - lo)) * (H - 18);
  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} className="rd-chart" role="img" aria-label={label} dir="ltr">
      {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1="0" x2={W} y1={y(v)} y2={y(v)} className="grid" /><text x="2" y={y(v) - 3} className="axis">{v % 1 ? v.toFixed(1) : v}</text></g>)}
      {rows.map((r, i) => r.avg == null ? null : (
        <g key={r.from}>
          <rect x={i * (W / rows.length) + 6} y={y(r.avg)} width={W / rows.length - 12} height={H - y(r.avg)} className="bar" />
          {rows.length <= 16 && <text x={i * (W / rows.length) + W / rows.length / 2} y={y(r.avg) - 4} className="val" textAnchor="middle">{r.avg.toFixed(1)}</text>}
        </g>
      ))}
      {rows.map((r, i) => (rows.length > 16 && i % 2 ? null : <text key={`l${r.from}`} x={i * (W / rows.length) + W / rows.length / 2} y={H + 16} className="lbl" textAnchor="middle">{r.label}</text>))}
    </svg>
  );
}

export default function ReportDoc({ d, athlete, tr, lang, show, coach, waCategory, snaps = [], onRemoveSnap }) {
  const s = tr.stats, rp = tr.rp, st = d.st, prev = d.prev, main = st.groups[0], prevMain = prev.groups.find((g) => g.key === main?.key);
  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const date = (iso, o = { day: "numeric", month: "short", year: "numeric" }) => { const [y, m, dd] = iso.split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString(locale, o); };
  const short = (iso) => date(iso, { day: "numeric", month: "short" });
  const p = st.points, per72 = (v) => (st.count.scored ? (v / st.count.scored) * 72 : 0);
  const causes = p ? CAUSES.map((k) => ({ k, v: k === "faults" ? Object.values(p.faults).reduce((t, x) => t + x, 0) : p[k] })).filter((c) => c.v > 0.05).sort((a, b) => b.v - a.v) : [];
  const rows = d.progress.map((r) => ({ ...r, label: r.weekly ? short(r.from) : date(r.from, { month: "short", ...(d.progress.length > 12 && { year: "2-digit" }) }) }));
  const tens = st.count.scored ? Math.round((st.tens / st.count.scored) * 100) : null, prevTens = prev.count.scored ? Math.round((prev.tens / prev.count.scored) * 100) : null;
  const best = [...st.groups].filter((g) => g.best).sort((a, b) => b.best.avg - a.best.avg)[0];
  const meta = [fill(tr.archer.stage, { n: Number(athlete.stage || 0) + 1 }), athlete.discipline === "barebow" ? tr.profile.barebow : tr.profile.recurve, waCategory].filter(Boolean);
  const faultName = (f) => tr.quick.faults[FAULTS.indexOf(f)] || f;
  const has = (k) => show.includes(k);

  return (
    <article className="rd" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="rd-cover">
        <div className="rd-brand"><b>ERA LAB</b><span>{rp.docTitle}</span></div>
        <div className="rd-who">
          <h1>{athlete.name}</h1>
          <p className="rd-period">{d.period.label}</p>
          <p>{meta.join(" · ")}</p>
          <p>{[coach && fill(rp.coach, { name: coach }), fill(rp.made, { date: date(new Date().toISOString().slice(0, 10)) })].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <section className="rd-sec">
        <h2>{rp.summary}</h2>
        {!st.count.sessions ? <p className="rd-muted">{rp.noSessions}</p> : (
          <div className="rd-tiles">
            <div className="rd-tile lead"><b>{f2(st.avg)}</b><span>{s.perArrow}</span><Delta now={st.avg} before={prev.avg} /></div>
            <div className="rd-tile"><b>{st.count.arrows}</b><span>{s.arrows}</span><Delta now={st.count.arrows} before={prev.count.sessions ? prev.count.arrows : null} digits={0} /></div>
            <div className="rd-tile"><b>{st.count.sessions}</b><span>{s.sessions}</span><Delta now={st.count.sessions} before={prev.count.sessions || null} digits={0} /></div>
            <div className="rd-tile"><b>{main?.groupCm != null ? f1(main.groupCm) : "–"}</b><span>{fill(rp.groupAt, { d: main?.distance ?? "" })}</span><Delta now={main?.groupCm} before={prevMain?.groupCm} digits={1} unit=" cm" lowerIsBetter /></div>
            <div className="rd-tile"><b>{tens != null ? `${tens}%` : "–"}</b><span>{rp.tensRate}</span><Delta now={tens} before={prevTens} digits={0} unit="%" /></div>
            <div className="rd-tile"><b>{best ? f2(best.best.avg) : "–"}</b><span>{best ? fill(rp.bestAt, { d: best.distance }) : rp.best}</span>{best?.isPb && <em className="rd-pb">{s.pb}</em>}</div>
          </div>
        )}
        <p className="rd-note">{fill(rp.compared, { from: date(d.before.from), to: date(d.before.to) })}</p>
        {d.says.length > 0 && (
          <>
            <h3>{s.findTitle}</h3>
            <ol className="rd-find">{d.says.slice(0, 6).map((x, i) => <li key={i}>{findingText(x, s, short)}</li>)}</ol>
          </>
        )}
      </section>

      {has("points") && p?.lost > 0 && (
        <section className="rd-sec">
          <h2>{s.pointsTitle}</h2>
          <p>{fill(s.pointsLead, { got: p.scored, max: p.max, lost: Math.round(p.lost) })}</p>
          <div className="rd-stack" aria-hidden="true"><i className="got" style={{ flexGrow: p.scored }} />{causes.map((c) => <i key={c.k} className={c.k} style={{ flexGrow: c.v }} />)}</div>
          <table className="rd-table">
            <thead><tr><th>{rp.cause}</th><th className="n">{rp.points}</th><th className="n">{rp.per72}</th></tr></thead>
            <tbody>{causes.map((c) => (
              <tr key={c.k}><td><span className={`rd-sw ${c.k}`} />{s.causes[c.k]}{c.k === "faults" && <small> — {Object.entries(p.faults).sort((a, b) => b[1] - a[1]).map(([n]) => faultName(n)).join(", ")}</small>}</td><td className="n">{Math.round(c.v)}</td><td className="n">{f1(per72(c.v))}</td></tr>
            ))}</tbody>
          </table>
          <p className="rd-note">{fill(s.pointsNote, { n: st.count.scored })}</p>
        </section>
      )}

      {has("map") && main && st.count.plotted > 0 && (
        <section className="rd-sec">
          <h2>{rp.mapTitle}</h2>
          <div className="rd-two">
            <figure><Face st={st} main={main} /><figcaption>{fill(rp.mapCap, { d: main.distance, face: tr.range.faces[main.face] })}</figcaption></figure>
            <div>
              <h3>{s.byDistance}</h3>
              <table className="rd-table">
                <thead><tr><th>{s.distance}</th><th className="n">{s.arrows}</th><th className="n">{s.avg}</th><th className="n">{s.group}</th><th>{s.centre}</th></tr></thead>
                <tbody>{st.groups.map((g) => (
                  <tr key={g.key}><td>{g.distance} {tr.common.m} <small>{tr.range.faces[g.face]}</small></td><td className="n">{g.arrows}</td><td className="n">{f2(g.avg)}{g.isPb && <em className="rd-pb">{s.pb}</em>}</td>
                    <td className="n">{g.groupCm != null ? `${f1(g.groupCm)} ${tr.common.cm}` : "–"}</td>
                    <td>{g.offsetXcm != null ? `${Math.abs(g.offsetXcm).toFixed(1)} ${g.offsetXcm > 0 ? s.rightShort : s.leftShort} · ${Math.abs(g.offsetYcm).toFixed(1)} ${g.offsetYcm > 0 ? s.highShort : s.lowShort}` : "–"}</td></tr>
                ))}</tbody>
              </table>
              <p className="rd-note">{s.groupNote}</p>
            </div>
          </div>
        </section>
      )}

      {has("progress") && rows.some((r) => r.avg != null) && (
        <section className="rd-sec">
          <h2>{rp.progressTitle}</h2>
          <Progress rows={rows} label={rp.progressTitle} />
          <p className="rd-note">{rows[0].weekly ? rp.perWeek : rp.perMonth}</p>
        </section>
      )}

      {has("technique") && (
        <section className="rd-sec">
          <h2>{rp.techTitle}</h2>
          {!d.rubric ? <p className="rd-muted">{rp.noRubric}</p> : (
            <>
              <table className="rd-table">
                <thead><tr><th>{rp.domain}</th>{d.rubric.before && <th className="n">{date(d.rubric.before.date)}</th>}<th className="n">{date(d.rubric.date)}</th><th className="rd-barcol" /></tr></thead>
                <tbody>{Object.entries(d.rubric.now).map(([k, v]) => (
                  <tr key={k}><td>{tr.rubric.domains[k] || k}</td>{d.rubric.before && <td className="n">{f1(d.rubric.before.domains[k])}</td>}
                    <td className="n"><b>{f1(v)}</b> <Delta now={v} before={d.rubric.before?.domains[k]} digits={1} /></td>
                    <td className="rd-barcol"><i className="rd-bar"><em style={{ width: `${(v / 5) * 100}%` }} /></i></td></tr>
                ))}</tbody>
              </table>
              <p className="rd-note">{d.rubric.inPeriod ? rp.rubricScale : fill(rp.rubricOld, { date: date(d.rubric.date) })}</p>
            </>
          )}
        </section>
      )}

      {has("video") && (
        <section className="rd-sec">
          <h2>{rp.videoTitle}</h2>
          {snaps.length > 0 && (
            <div className="rd-snaps">
              {snaps.map((x) => (
                <figure key={x.id}>
                  <img src={x.url} alt="" />
                  <figcaption>{new Date(x.takenAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short" })}
                    {onRemoveSnap && <button type="button" className="rd-x" aria-label={rp.snapRemove} onClick={() => onRemoveSnap(x.id)}>✕</button>}</figcaption>
                </figure>
              ))}
            </div>
          )}
          {!d.video.clips ? (!snaps.length && <p className="rd-muted">{rp.noVideo}</p>) : (
            <>
              <p>{fill(rp.videoLead, { n: d.video.clips, good: d.video.good })}</p>
              {d.video.faults.length > 0 && <table className="rd-table"><thead><tr><th>{rp.fault}</th><th className="n">{rp.clips}</th></tr></thead>
                <tbody>{d.video.faults.map(([f, n]) => <tr key={f}><td>{faultName(f)}</td><td className="n">{n}</td></tr>)}</tbody></table>}
              {d.video.notes.length > 0 && <><h3>{rp.coachNotes}</h3><ul className="rd-notes">{d.video.notes.map((r) => <li key={r.id}><b>{short(r.date)}{r.shot ? ` · ${r.shot.whole ? fill(tr.clips.wholeEnd, r.shot) : fill(tr.clips.endArrow, { end: r.shot.end, n: r.shot.arrow })}` : ""}</b> {r.notes}</li>)}</ul></>}
            </>
          )}
        </section>
      )}

      {has("goals") && (
        <section className="rd-sec">
          <h2>{rp.goalsTitle}</h2>
          {!d.goals.length ? <p className="rd-muted">{rp.noGoals}</p> : (
            <table className="rd-table">
              <thead><tr><th>{rp.goal}</th><th>{rp.progress}</th><th className="n">{rp.due}</th></tr></thead>
              <tbody>{d.goals.map((g) => (
                <tr key={g.id}>
                  <td><b>{g.name}</b>{g.specific && <small className="rd-block">{g.specific}</small>}</td>
                  <td>{g.pct != null ? <><i className="rd-bar"><em style={{ width: `${g.pct}%` }} /></i><small>{fill(rp.goalNow, { last: g.last, target: g.target, label: g.metricLabel || "", pct: g.pct })}</small></> : <small>{rp.noLog}</small>}</td>
                  <td className="n">{g.completed ? rp.done : g.dueDate ? short(g.dueDate) : "–"}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>
      )}

      {has("sessions") && st.sessions.length > 0 && (
        <section className="rd-sec rd-flow">
          <h2>{rp.sessionsTitle}</h2>
          <table className="rd-table rd-sessions">
            <thead><tr><th>{tr.session.date}</th><th>{tr.session.type}</th><th className="n">{s.distance}</th><th className="n">{s.arrows}</th><th className="n">{tr.session.score}</th><th className="n">{s.avg}</th></tr></thead>
            <tbody>{[...st.sessions].reverse().map((x) => {
              const avg = +x.arrows > 0 && x.score !== "" && x.score != null ? +x.score / +x.arrows : null;
              return <tr key={x.id}><td>{date(x.date)}</td><td>{tr.session.types[TYPES.indexOf(x.type)] ?? x.type}</td><td className="n">{x.distance ? `${x.distance} ${tr.common.m}` : "–"}</td><td className="n">{x.arrows || "–"}</td><td className="n">{x.score ? `${x.score}${x.outOf ? ` / ${x.outOf}` : ""}` : "–"}</td><td className="n">{f2(avg)}</td></tr>;
            })}</tbody>
          </table>
        </section>
      )}

      <footer className="rd-foot">ERA Lab · {athlete.name} · {d.period.label}</footer>
    </article>
  );
}
