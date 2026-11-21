import { RING_FILL, rings, scorecard, scoreValue } from "../range";
import { FAULTS } from "../clips";

// The scorecard of a finished range session. The app renders it hidden and saves its markup as a standalone web
// file (scorecardFile.js adds the styles and the tap behaviour), so it fits any screen and prints to one A4 page.
// data-end / data-score / data-n mark what a tap can pick; they carry no more than the page already shows.

const f1 = (v) => (v == null ? "–" : v.toFixed(1));
const f2 = (v) => (v == null ? "–" : v.toFixed(2));

function Face({ s, sum }) {
  const n = rings(s.context.face);
  const arrows = s.ends.flatMap((e) => e.arrows.map((a) => ({ ...a, end: e.end }))).filter((a) => a.x != null);
  return (
    <svg viewBox="-110 -110 220 220" className="sc-face" dir="ltr">
      {Array.from({ length: n }, (_, i) => <circle key={i} r={(100 * (n - i)) / n} fill={RING_FILL[10 - n + i]} stroke={10 - n + i < 2 ? "#222" : 10 - n + i < 4 ? "#bbb" : "#111"} strokeWidth=".6" />)}
      <circle r={50 / n} fill="none" stroke="#111" strokeWidth=".4" />
      {sum.cx != null && (
        <g stroke="#000" strokeWidth="1.6">
          <line x1={sum.cx * 100 - 7} x2={sum.cx * 100 + 7} y1={-sum.cy * 100} y2={-sum.cy * 100} />
          <line x1={sum.cx * 100} x2={sum.cx * 100} y1={-sum.cy * 100 - 7} y2={-sum.cy * 100 + 7} />
        </g>
      )}
      {arrows.map((a) => (
        <circle key={`${a.end}-${a.arrow}`} className="sc-hit" cx={a.x * 100} cy={-a.y * 100} r="3.4" tabIndex={0} role="button"
          data-end={a.end} data-n={a.arrow} data-score={a.score} data-note={a.notes || undefined} data-feel={a.feel || undefined} />
      ))}
    </svg>
  );
}

// clips (optional): the coach's tagged clips of this session, each {review, still}: the archer's result file shows them.
export default function Scorecard({ s, tr, lang, clips = [] }) {
  const r = tr.range, sc = r.sc, c = scorecard(s), per = s.context.arrows_per_end;
  const date = new Date(s.start_ms).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const most = Math.max(1, ...c.dist.map(([, n]) => n));
  const shift = c.cx == null ? null : `${c.cx > 0 ? r.right : r.left} ${Math.abs(c.cx * c.radiusCm).toFixed(1)} ${tr.common.cm} · ${c.cy > 0 ? r.high : r.low} ${Math.abs(c.cy * c.radiusCm).toFixed(1)} ${tr.common.cm}`;
  const ctx = s.context, mp = s.mental_pre || {};
  const conditions = [
    `${ctx.distance_m} ${tr.common.m}`, r.faces[ctx.face], ctx.place,
    ctx.wind && `${r.wind}: ${r.winds[["Calm", "Light", "Moderate", "Strong", "Gusty"].indexOf(ctx.wind)] ?? ctx.wind}`,
    ctx.temp_c != null && `${ctx.temp_c} ${tr.common.degC}`, s.equipment?.bow, s.equipment?.draw_weight_lb && `${s.equipment.draw_weight_lb} ${tr.common.lb}`,
  ].filter(Boolean);
  const checkIn = [["readiness", mp.readiness], ["confidence", mp.confidence], ["focus", mp.focus], ["energy", mp.energy]].filter(([, v]) => v != null);
  const maxEnd = per * 10;
  const labels = { end: r.end, arrow: sc.arrow, feel: sc.feel, running: sc.running, times: sc.times, hint: sc.hint };

  return (
    <div className="sc-sheet" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} data-labels={JSON.stringify(labels)}>
      <header className="sc-head">
        <div><div className="sc-brand">ERA LAB</div><div className="sc-kind">{clips.length ? sc.resultTitle : sc.title}</div></div>
        <div className="sc-who"><b>{s.athlete}</b><span>{date} · {tr.session.types[["Technical", "Physical", "Mental", "Competition", "Mixed"].indexOf(s.type)] ?? s.type}</span></div>
      </header>

      <div className="sc-tiles">
        <div className="sc-tile big"><b>{c.total}</b><span>/ {c.outOf}</span><small>{sc.total}</small></div>
        <div className="sc-tile"><b>{f2(c.avg)}</b><small>{sc.perArrow}</small></div>
        <div className="sc-tile"><b>{c.dist.find(([k]) => k === "X")?.[1] ?? 0}</b><small>X</small></div>
        <div className="sc-tile"><b>{c.tens}</b><small>X + 10</small></div>
        <div className="sc-tile"><b>{c.misses}</b><small>{sc.misses}</small></div>
        <div className="sc-tile"><b>{c.arrows}</b><small>{r.arrowsWord}</small></div>
      </div>

      <div className="sc-bar-top">
        <p className="sc-info" aria-live="polite">{sc.hint}</p>
        <button type="button" className="sc-pdf">{sc.savePdf}</button>
      </div>

      <div className="sc-two">
        <section>
          <h4>{sc.plot}</h4>
          <Face s={s} sum={c} />
          <p className="sc-cap">{shift ? `${sc.centre}: ${shift}` : sc.noPlot}{c.spreadCm != null && <><br />{sc.spread}: {f1(c.spreadCm)} {tr.common.cm}</>}</p>
        </section>
        <section>
          <h4>{sc.dist}</h4>
          <table className="sc-dist"><tbody>
            {c.dist.map(([k, n]) => (
              <tr key={k} data-score={k} data-count={n} tabIndex={n ? 0 : undefined} role={n ? "button" : undefined}>
                <th>{k}</th><td><i style={{ width: `${(n / most) * 100}%` }} /></td><td>{n}</td><td className="sc-pct">{c.arrows ? Math.round((n / c.arrows) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody></table>
          <h4>{sc.trend}</h4>
          <dl className="sc-facts">
            <dt>{sc.bestEnd}</dt><dd>{c.best} / {maxEnd}</dd>
            <dt>{sc.worstEnd}</dt><dd>{c.worst} / {maxEnd}</dd>
            <dt>{sc.firstHalf}</dt><dd>{f2(c.firstHalf)}</dd>
            <dt>{sc.secondHalf}</dt><dd>{f2(c.secondHalf)}</dd>
            {c.feel != null && <><dt>{sc.feel}</dt><dd>{f1(c.feel)} / 5</dd></>}
          </dl>
        </section>
      </div>

      <section>
        <h4>{r.ends}</h4>
        <div className="sc-scroll">
          <table className="sc-ends">
            <thead><tr><th>{r.end}</th>{Array.from({ length: per }, (_, i) => <th key={i}>{i + 1}</th>)}<th>{r.sum}</th><th>{sc.running}</th><th className="sc-bar-h" /></tr></thead>
            <tbody>
              {c.ends.map((e) => (
                <tr key={e.end} data-end={e.end} data-sum={e.sum} data-run={e.run} tabIndex={0} role="button">
                  <td>{e.end}</td>
                  {Array.from({ length: per }, (_, i) => {
                    const a = e.arrows[i];
                    return <td key={i} className={a ? `sc-s${a.score === "X" ? 10 : scoreValue(a.score)}` : ""} data-score={a?.score}>{a?.score ?? ""}</td>;
                  })}
                  <td><b>{e.sum}</b></td><td>{e.run}</td>
                  <td className="sc-bar"><i style={{ width: `${(e.sum / maxEnd) * 100}%` }} className={e.sum === c.best ? "top" : ""} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {clips.length > 0 && (
        <section>
          <h4>{sc.reviewTitle}</h4>
          <div className="sc-clips">
            {clips.map(({ review: rv, still }) => (
              <article key={rv.id} className={`sc-clip ${rv.verdict || ""}`}>
                {still ? <img src={still} alt={rv.shot ? `${r.end} ${rv.shot.end}, ${sc.arrow} ${rv.shot.arrow}` : ""} /> : <div className="sc-nostill" />}
                <div className="sc-clip-body">
                  <b>{rv.shot?.whole ? `${r.end} ${rv.shot.end}` : rv.shot ? `${r.end} ${rv.shot.end} · ${sc.arrow} ${rv.shot.arrow} · ${rv.shot.score ?? ""}` : sc.noArrow}</b>
                  <span className="sc-verdict">{rv.verdict === "good" ? tr.quick.good : rv.verdict === "fault" ? tr.quick.fault : ""}</span>
                  {rv.faults?.length > 0 && <ul>{rv.faults.map((f) => <li key={f}>{tr.quick.faults[FAULTS.indexOf(f)] || f}</li>)}</ul>}
                  {rv.notes && <p>{rv.notes}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="sc-foot">
        <div><h4>{sc.conditions}</h4><p>{conditions.join(" · ")}</p></div>
        {(checkIn.length > 0 || mp.goal) && <div><h4>{sc.checkIn}</h4><p>{[mp.goal && `${r.goal}: ${mp.goal}`, ...checkIn.map(([k, v]) => `${r[k]} ${v}/10`)].filter(Boolean).join(" · ")}</p></div>}
        {s.coach_notes && <div><h4>{r.coachNotes}</h4><p>{s.coach_notes}</p></div>}
      </footer>
      <div className="sc-made">{sc.made}</div>
    </div>
  );
}
