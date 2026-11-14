import { createPortal } from "react-dom";
import { RING_FILL, rings, scorecard, scoreValue } from "../range";

// One A4 page for a finished range session. It sits hidden at the end of <body> and is the only thing printed,
// so the browser's print window (Save as PDF) gives a clean scorecard; same approach as the Report stage.

const f1 = (v) => (v == null ? "–" : v.toFixed(1));
const f2 = (v) => (v == null ? "–" : v.toFixed(2));

function Face({ s, sum }) {
  const n = rings(s.context.face), arrows = s.ends.flatMap((e) => e.arrows).filter((a) => a.x != null);
  return (
    <svg viewBox="-110 -110 220 220" className="sc-face" dir="ltr">
      {Array.from({ length: n }, (_, i) => <circle key={i} r={(100 * (n - i)) / n} fill={RING_FILL[10 - n + i]} stroke={10 - n + i < 2 ? "#222" : 10 - n + i < 4 ? "#bbb" : "#111"} strokeWidth=".6" />)}
      <circle r={50 / n} fill="none" stroke="#111" strokeWidth=".4" />
      {arrows.map((a, i) => <circle key={i} cx={a.x * 100} cy={-a.y * 100} r="3" fill="#00e0c6" stroke="#000" strokeWidth=".9" />)}
      {sum.cx != null && (
        <g stroke="#000" strokeWidth="1.6">
          <line x1={sum.cx * 100 - 7} x2={sum.cx * 100 + 7} y1={-sum.cy * 100} y2={-sum.cy * 100} />
          <line x1={sum.cx * 100} x2={sum.cx * 100} y1={-sum.cy * 100 - 7} y2={-sum.cy * 100 + 7} />
        </g>
      )}
    </svg>
  );
}

export default function Scorecard({ s, tr, lang }) {
  const r = tr.range, sc = r.sc, c = scorecard(s), per = s.context.arrows_per_end;
  const date = new Date(s.start_ms).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const most = Math.max(1, ...c.dist.map(([, n]) => n));
  const shift = c.cx == null ? null : `${c.cx > 0 ? r.right : r.left} ${Math.abs(c.cx * c.radiusCm).toFixed(1)} cm · ${c.cy > 0 ? r.high : r.low} ${Math.abs(c.cy * c.radiusCm).toFixed(1)} cm`;
  const ctx = s.context, mp = s.mental_pre || {};
  const conditions = [
    `${ctx.distance_m} m`, r.faces[ctx.face], ctx.place,
    ctx.wind && `${r.wind}: ${r.winds[["Calm", "Light", "Moderate", "Strong", "Gusty"].indexOf(ctx.wind)] ?? ctx.wind}`,
    ctx.temp_c != null && `${ctx.temp_c} °C`, s.equipment?.bow, s.equipment?.draw_weight_lb && `${s.equipment.draw_weight_lb} lb`,
  ].filter(Boolean);
  const checkIn = [["readiness", mp.readiness], ["confidence", mp.confidence], ["focus", mp.focus], ["energy", mp.energy]].filter(([, v]) => v != null);
  const maxEnd = per * 10;

  return createPortal(
    <div className="sc-sheet" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <header className="sc-head">
        <div><div className="sc-brand">ERA LAB</div><div className="sc-kind">{sc.title}</div></div>
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

      <div className="sc-two">
        <section>
          <h4>{sc.plot}</h4>
          <Face s={s} sum={c} />
          <p className="sc-cap">{shift ? `${sc.centre}: ${shift}` : sc.noPlot}{c.spreadCm != null && <><br />{sc.spread}: {f1(c.spreadCm)} cm</>}</p>
        </section>
        <section>
          <h4>{sc.dist}</h4>
          <table className="sc-dist"><tbody>
            {c.dist.map(([k, n]) => (
              <tr key={k}><th>{k}</th><td><i style={{ width: `${(n / most) * 100}%` }} /></td><td>{n}</td><td className="sc-pct">{c.arrows ? Math.round((n / c.arrows) * 100) : 0}%</td></tr>
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
        <table className="sc-ends">
          <thead><tr><th>{r.end}</th>{Array.from({ length: per }, (_, i) => <th key={i}>{i + 1}</th>)}<th>{r.sum}</th><th>{sc.running}</th><th className="sc-bar-h" /></tr></thead>
          <tbody>
            {c.ends.map((e) => (
              <tr key={e.end}>
                <td>{e.end}</td>
                {Array.from({ length: per }, (_, i) => { const a = e.arrows[i]; return <td key={i} className={a ? `sc-s${a.score === "X" ? 10 : scoreValue(a.score)}` : ""}>{a?.score ?? ""}</td>; })}
                <td><b>{e.sum}</b></td><td>{e.run}</td>
                <td className="sc-bar"><i style={{ width: `${(e.sum / maxEnd) * 100}%` }} className={e.sum === c.best ? "top" : ""} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="sc-foot">
        <div><h4>{sc.conditions}</h4><p>{conditions.join(" · ")}</p></div>
        {(checkIn.length > 0 || mp.goal) && <div><h4>{sc.checkIn}</h4><p>{[mp.goal && `${r.goal}: ${mp.goal}`, ...checkIn.map(([k, v]) => `${r[k]} ${v}/10`)].filter(Boolean).join(" · ")}</p></div>}
        {s.coach_notes && <div><h4>{r.coachNotes}</h4><p>{s.coach_notes}</p></div>}
      </footer>
      <div className="sc-made">{sc.made}</div>
    </div>,
    document.body,
  );
}
