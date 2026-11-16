import { useMemo, useState } from "react";
import { getAthletes, getPlan, savePlan, getSessions, getGoals, getExercises, uid } from "../storage";
import { PHASES, COLORS, MIX, DEFAULT_RULES, rulesOf, autoPlan, compsIn, weekStart, ramadanWeeks, shotByDay, shotByWeek, loadRatio, warnings } from "../plan";
import { isoDay, planWeek } from "../stats";
import { saveHtmlFile } from "../scorecardFile";
import { getSettings } from "../storage";
import Help from "../Help";
import { useApp } from "../context";
import ArcherSelect from "../ArcherSelect";
import Icon from "../icons";

const TABS = ["season", "load", "rules", "send"];
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

// An older plan: its tournaments (listed by week number) become B competitions on that week's first day, and the
// weeks the coach coloured count as edited, so building the season never paints over them.
const upgrade = (plan, year) => (plan.comps ? plan : {
  ...plan,
  comps: (plan.tournaments || []).map((t) => ({ id: t.id, name: t.name, date: weekStart(year, t.week), priority: "B" })),
  edited: plan.edited || Object.keys(plan.weeks || {}).map(Number),
});

// The season plan for one archer and one year. ERA Lab builds it from the competitions and the coach's rules; every
// week, rule, warning and part of the sent file stays the coach's to change. Changes save as they are made.
export default function PeriodizationPlanner({ lang, tr, selectedId }) {
  const pl = tr.planner;
  const { setSelectedId } = useApp();
  const athletes = getAthletes();
  const athlete = athletes.find((a) => a.id === selectedId) || null;
  const today = isoDay(new Date()), thisYear = +today.slice(0, 4);
  const [year, setYear] = useState(thisYear);
  const [plan, setPlanState] = useState(() => upgrade(getPlan(selectedId, thisYear), thisYear));
  const [tab, setTab] = useState("season");
  const [armed, setArmed] = useState(null);
  const [sel, setSel] = useState(null); // the week open in the editor
  const [comp, setComp] = useState({ name: "", date: "", priority: "A" });

  const autoRamadan = useMemo(() => ramadanWeeks(year), [year]);
  const byDay = useMemo(() => shotByDay(getSessions(), selectedId), [selectedId]);
  const shot = useMemo(() => shotByWeek(byDay, year), [byDay, year]);

  if (!athlete) return (
    <div className="screen"><h2>{pl.title}</h2><ArcherSelect tr={tr} athletes={athletes} selectedId={selectedId} onPick={setSelectedId} prompt={tr.shell.pickFirst} /></div>
  );

  const setPlan = (next) => { setPlanState(next); savePlan(next); };
  const rules = rulesOf(plan);
  const ramadan = plan.ramadan || autoRamadan;
  const nowWeek = year === thisYear ? planWeek(today) : year < thisYear ? 53 : 0;
  const comps = compsIn(plan.comps, year).sort((a, b) => a.week - b.week);
  const warns = warnings(plan, year, byDay, nowWeek);
  const goals = getGoals().filter((g) => g.athleteId === selectedId);
  const exercises = getExercises().filter((x) => x.athleteId === selectedId);
  const edited = new Set((plan.edited || []).map(Number));

  const loadYear = (y) => { setYear(y); setPlanState(upgrade(getPlan(selectedId, y), y)); setSel(null); };
  const touch = (w, change) => setPlan({ ...plan, ...change, edited: [...new Set([...edited, w])] });
  const rebuildWith = (change, ram = ramadan) => setPlan(autoPlan({ ...plan, ...change }, year, ram));
  const build = () => rebuildWith({});
  const rebuild = () => window.confirm(pl.confirmRebuild) && rebuildWith({ edited: [] });
  const clear = () => window.confirm(pl.confirmClear) && setPlan({ ...plan, weeks: {}, targets: {}, edited: [] });
  const paint = (w) => {
    if (!armed) { setSel(sel === w ? null : w); return; }
    const weeks = { ...plan.weeks };
    if (armed === "none") delete weeks[w]; else weeks[w] = armed;
    touch(w, { weeks });
  };
  const addComp = () => {
    if (!comp.name.trim() || !comp.date) return;
    rebuildWith({ comps: [...(plan.comps || []), { ...comp, name: comp.name.trim(), id: uid() }] });
    setComp({ name: "", date: "", priority: "A" });
  };
  const setCompField = (id, k, v) => rebuildWith({ comps: plan.comps.map((c) => (c.id === id ? { ...c, [k]: v } : c)) });
  const removeComp = (id) => rebuildWith({ comps: plan.comps.filter((c) => c.id !== id) });
  const setRule = (path, v) => {
    const r = structuredClone(plan.rules || {});
    let o = r; for (const k of path.slice(0, -1)) o = o[k] ||= {};
    o[path.at(-1)] = v === "" ? undefined : v;
    rebuildWith({ rules: r });
  };
  const setRamadan = (w, on) => { const list = on ? [...new Set([...ramadan, w])] : ramadan.filter((x) => x !== w); rebuildWith({ ramadan: list }, list); };

  return (
    <div className="screen pz">
      <div className="card-header">
        <h2>{pl.title} — {athlete.name}</h2>
        <select value={year} onChange={(e) => loadYear(+e.target.value)} style={{ width: "auto" }} aria-label={pl.year}>
          {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>
      <div className="seg pz-tabs" role="tablist">
        {TABS.map((k) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{pl.tabs[k]}{k === "load" && warns.length ? ` (${warns.length})` : ""}</button>)}
      </div>

      {tab === "season" && <>
        <div className="card">
          <div className="card-header"><div className="card-title">{pl.comps}</div><Help text={pl.help.comps} /></div>
          <p className="muted">{pl.compsIntro}</p>
          {comps.map((c) => (
            <div key={c.id} className="pz-comp">
              <select value={c.priority} onChange={(e) => setCompField(c.id, "priority", e.target.value)} aria-label={pl.priority}>
                {["A", "B", "C"].map((p) => <option key={p} value={p}>{pl.prio[p]}</option>)}
              </select>
              <input value={c.name} onChange={(e) => setCompField(c.id, "name", e.target.value)} aria-label={pl.compName} />
              <input type="date" value={c.date} onChange={(e) => setCompField(c.id, "date", e.target.value)} aria-label={pl.compDate} />
              <button className="del-btn" onClick={() => removeComp(c.id)} aria-label={pl.remove}><Icon name="x" size={16} /></button>
            </div>
          ))}
          <div className="pz-comp">
            <select value={comp.priority} onChange={(e) => setComp({ ...comp, priority: e.target.value })} aria-label={pl.priority}>
              {["A", "B", "C"].map((p) => <option key={p} value={p}>{pl.prio[p]}</option>)}
            </select>
            <input value={comp.name} placeholder={pl.compName} onChange={(e) => setComp({ ...comp, name: e.target.value })} />
            <input type="date" value={comp.date} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(e) => setComp({ ...comp, date: e.target.value })} aria-label={pl.compDate} />
            <button className="btn-primary small" onClick={addComp} disabled={!comp.name.trim() || !comp.date}>{pl.add}</button>
          </div>
        </div>

        <div className="btn-row pz-actions">
          <button className="btn-primary small" onClick={build}>{pl.build}</button>
          <button className="btn-ghost small" onClick={rebuild}>{pl.rebuild}</button>
          <button className="btn-ghost small" onClick={clear}>{pl.clear}</button>
          <Help text={pl.help.build} />
        </div>
        <p className="muted">{edited.size ? fill(pl.editedNote, { n: edited.size }) : pl.buildNote}</p>

        <div className="phase-palette" aria-label={pl.legend}>
          {PHASES.map((k) => (
            <button key={k} className={`phase-chip ${armed === k ? "armed" : ""}`} aria-pressed={armed === k}
              style={{ background: COLORS[k] + "22", color: COLORS[k], borderColor: COLORS[k] }} onClick={() => setArmed(armed === k ? null : k)}>{pl.phases[k]}</button>
          ))}
          <button className={`phase-chip ${armed === "none" ? "armed" : ""}`} aria-pressed={armed === "none"} onClick={() => setArmed(armed === "none" ? null : "none")}>{pl.erase}</button>
        </div>
        <div className="pz-hintrow"><p className="muted" style={{ fontSize: 12 }}>{armed ? pl.paintHint : pl.tapHint}</p><Help text={pl.help.season} /></div>

        <div className="week-grid pz-grid">
          {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
            const k = plan.weeks?.[w], t = plan.targets?.[w], c = comps.find((x) => x.week === w);
            return (
              <button key={w} type="button" className={`week-cell ${sel === w ? "sel" : ""} ${w === nowWeek ? "now" : ""}`} onClick={() => paint(w)}
                style={k ? { background: COLORS[k] + "33", borderColor: COLORS[k] } : undefined} aria-label={`${pl.wk}${w} ${k ? pl.phases[k] : ""}`}>
                <span className="wk-num" style={{ color: k ? COLORS[k] : undefined }}>{pl.wk}{w}</span>
                {(t?.arrows || shot[w]) ? <span className="wk-arrows">{t?.arrows || "–"}{shot[w] ? <em>/{shot[w]}</em> : null}</span> : null}
                {c && <span className={`wk-comp p${c.priority}`}>{c.priority}</span>}
                {ramadan.includes(w) && <span className="wk-dot" title={pl.ramadan}><Icon name="moon" size={10} /></span>}
                {edited.has(w) && <span className="wk-edit" title={pl.editedWeek}>•</span>}
              </button>
            );
          })}
        </div>
        <p className="muted pz-key">{pl.gridKey}</p>

        {sel && <WeekEditor key={sel} w={sel} {...{ plan, year, lang, pl, shot, comps, ramadan, goals, exercises, edited }}
          onChange={(change) => touch(sel, change)} onAuto={() => rebuildWith({ edited: [...edited].filter((x) => x !== sel) })}
          onRamadan={(on) => setRamadan(sel, on)} onClose={() => setSel(null)} />}
      </>}

      {tab === "load" && <LoadView {...{ plan, year, pl, shot, byDay, warns, nowWeek }}
        onDismiss={(key) => setPlan({ ...plan, dismissed: [...(plan.dismissed || []), key] })}
        onRestore={() => setPlan({ ...plan, dismissed: [] })} onOpen={(w) => { setTab("season"); setSel(w); setArmed(null); }} />}

      {tab === "rules" && <RulesView {...{ rules, pl }} set={setRule} onReset={() => window.confirm(pl.confirmRules) && rebuildWith({ rules: {} })} />}

      {tab === "send" && <SendView {...{ plan, year, pl, lang, athlete, goals, exercises, shot, ramadan, nowWeek }} />}
    </div>
  );
}

function WeekEditor({ w, plan, year, lang, pl, shot, comps, ramadan, goals, exercises, edited, onChange, onAuto, onRamadan, onClose }) {
  const k = plan.weeks?.[w] || "", t = plan.targets?.[w] || { arrows: "", mix: { tech: 0, dist: 0, score: 0, sim: 0 }, physical: 0, mental: 0 };
  const set = (patch) => onChange({ targets: { ...plan.targets, [w]: { ...t, ...patch } } });
  const toggle = (field, id) => { const list = t[field] || []; set({ [field]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] }); };
  const mixSum = MIX.reduce((s, m) => s + (+t.mix?.[m] || 0), 0);
  const [y, mo, d] = weekStart(year, w).split("-").map(Number);
  return (
    <div className="card pz-week" role="region" aria-label={`${pl.wk}${w}`}>
      <div className="card-header">
        <div className="card-title">{pl.wk}{w} · {new Date(y, mo - 1, d).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short" })}</div>
        <span><Help text={pl.help.week} /><button className="del-btn" onClick={onClose} aria-label={pl.close}><Icon name="x" size={16} /></button></span>
      </div>
      {comps.filter((x) => x.week === w).map((x) => <p key={x.id}><span className={`wk-comp p${x.priority}`}>{x.priority}</span> {x.name}</p>)}
      <div className="form">
        <label>{pl.phase}
          <select value={k} onChange={(e) => { const weeks = { ...plan.weeks }; if (e.target.value) weeks[w] = e.target.value; else delete weeks[w]; onChange({ weeks }); }}>
            <option value="">—</option>
            {PHASES.map((p) => <option key={p} value={p}>{pl.phases[p]}</option>)}
          </select>
        </label>
        <div className="form-row">
          <label>{pl.arrows}<input type="number" min="0" step="10" value={t.arrows ?? ""} onChange={(e) => set({ arrows: e.target.value === "" ? "" : +e.target.value })} /></label>
          <label>{pl.shot}<input value={shot[w] ?? "–"} readOnly tabIndex={-1} /></label>
        </div>
        <fieldset className="pz-mix">
          <legend>{pl.mix} <small className={mixSum === 100 ? "" : "warn"}>{mixSum}%</small></legend>
          {MIX.map((m) => <label key={m}>{pl.mixKinds[m]}<input type="number" min="0" max="100" value={t.mix?.[m] ?? 0} onChange={(e) => set({ mix: { ...t.mix, [m]: +e.target.value } })} /></label>)}
        </fieldset>
        <div className="form-row">
          <label>{pl.physical}<input type="number" min="0" max="14" value={t.physical ?? 0} onChange={(e) => set({ physical: +e.target.value })} /></label>
          <label>{pl.mental}<input type="number" min="0" max="14" value={t.mental ?? 0} onChange={(e) => set({ mental: +e.target.value })} /></label>
          <label>{pl.drawWeight}<input type="number" min="0" max="80" step="0.5" value={t.drawWeight ?? ""} onChange={(e) => set({ drawWeight: e.target.value === "" ? "" : +e.target.value })} /></label>
        </div>
        <label className="pz-check"><input type="checkbox" checked={ramadan.includes(w)} onChange={(e) => onRamadan(e.target.checked)} />{pl.ramadanWeek}</label>
        {exercises.length > 0 && <fieldset className="pz-pick"><legend>{pl.exercises}</legend>
          {exercises.map((x) => <label key={x.id} className="pz-check"><input type="checkbox" checked={(t.exercises || []).includes(x.id)} onChange={() => toggle("exercises", x.id)} />{x.name}</label>)}
        </fieldset>}
        {goals.length > 0 && <fieldset className="pz-pick"><legend>{pl.goals}</legend>
          {goals.map((g) => <label key={g.id} className="pz-check"><input type="checkbox" checked={(t.goals || []).includes(g.id)} onChange={() => toggle("goals", g.id)} />{g.name}</label>)}
        </fieldset>}
        <label>{pl.note}<textarea rows={2} value={t.note || ""} onChange={(e) => set({ note: e.target.value })} /></label>
        {edited.has(w) && <button className="btn-ghost small" style={{ alignSelf: "flex-start" }} onClick={onAuto}>{pl.backToAuto}</button>}
      </div>
    </div>
  );
}

function LoadView({ plan, year, pl, shot, byDay, warns, nowWeek, onDismiss, onRestore, onOpen }) {
  const weeks = Array.from({ length: 52 }, (_, i) => i + 1);
  const max = Math.max(100, ...weeks.map((w) => Math.max(+plan.targets?.[w]?.arrows || 0, shot[w] || 0)));
  const W = 640, H = 200, bw = W / 52, y = (v) => H - 20 - (v / max) * (H - 40), ry = (r) => H - 20 - (Math.min(2, r) / 2) * (H - 40);
  const ratios = weeks.map((w) => (w <= nowWeek ? loadRatio(byDay, year, w) : null));
  return <>
    <div className="card">
      <div className="card-header"><div className="card-title">{pl.loadTitle}</div><Help text={pl.help.load} /></div>
      <p className="muted">{pl.loadIntro}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="pz-chart" role="img" aria-label={pl.loadTitle} dir="ltr">
        {weeks.map((w, i) => {
          const p = +plan.targets?.[w]?.arrows || 0, s = shot[w] || 0, k = plan.weeks?.[w];
          return <g key={w}>
            {p > 0 && <rect x={i * bw + 1} y={y(p)} width={bw - 2} height={H - 20 - y(p)} fill="none" stroke={k ? COLORS[k] : "#999"} strokeWidth="1.5" />}
            {s > 0 && <rect x={i * bw + 3} y={y(s)} width={bw - 6} height={H - 20 - y(s)} fill="#111" />}
            {i % 4 === 0 && <text x={i * bw + bw / 2} y={H - 6} fontSize="9" textAnchor="middle" fill="#777">{w}</text>}
          </g>;
        })}
        <line x1="0" x2={W} y1={ry(1.5)} y2={ry(1.5)} stroke="#e74c3c" strokeDasharray="4 4" strokeWidth="1" />
        <polyline fill="none" stroke="#e74c3c" strokeWidth="2" points={ratios.map((r, i) => (r == null ? null : `${i * bw + bw / 2},${ry(r)}`)).filter(Boolean).join(" ")} />
      </svg>
      <p className="muted pz-key">{pl.chartKey}</p>
    </div>
    <div className="card">
      <div className="card-header"><div className="card-title">{pl.warnTitle}</div><Help text={pl.help.warnings} /></div>
      {!warns.length && <p className="muted">{pl.noWarn}</p>}
      {warns.map((x) => (
        <div key={x.key} className="pz-warn">
          <button className="link-btn" onClick={() => onOpen(x.week)}>{pl.wk}{x.week}</button>
          <span>{fill(pl.warn[x.kind], x)}</span>
          <button className="btn-ghost small" onClick={() => onDismiss(x.key)}>{pl.dismiss}</button>
        </div>
      ))}
      {(plan.dismissed || []).length > 0 && <button className="link-btn" onClick={onRestore}>{fill(pl.restore, { n: plan.dismissed.length })}</button>}
    </div>
  </>;
}

function RulesView({ rules, pl, set, onReset }) {
  const n = (path, v, step = 1) => <input type="number" min="0" step={step} value={v} onChange={(e) => set(path, e.target.value === "" ? "" : Math.max(0, +e.target.value))} />;
  return <>
    <div className="card form">
      <div className="card-header"><div className="card-title">{pl.rulesTitle}</div><Help text={pl.help.rules} /></div>
      <p className="muted">{pl.rulesIntro}</p>
      <label>{pl.peakArrows}{n(["peakArrows"], rules.peakArrows, 10)}</label>
      <div className="form-row">
        <label>{pl.len.spp}{n(["weeks", "spp"], rules.weeks.spp)}</label>
        <label>{pl.len.precomp}{n(["weeks", "precomp"], rules.weeks.precomp)}</label>
        <label>{pl.len.taper}{n(["weeks", "taper"], rules.weeks.taper)}</label>
        <label>{pl.len.transition}{n(["weeks", "transition"], rules.weeks.transition)}</label>
      </div>
      <div className="form-row">
        <label>{pl.deloadEvery}{n(["deloadEvery"], rules.deloadEvery)}</label>
        <label>{pl.deloadCut}{n(["deloadCut"], rules.deloadCut)}</label>
        <label>{pl.ramadanCut}{n(["ramadanCut"], rules.ramadanCut)}</label>
        <label>{pl.bCut}{n(["bCut"], rules.bCut)}</label>
      </div>
    </div>
    <div className="card">
      <div className="card-title">{pl.byPhase}</div>
      <div className="pz-table-wrap">
        <table className="pz-table">
          <thead><tr><th />{["share", ...MIX, "physical", "mental"].map((h) => <th key={h}>{h === "share" ? pl.share : pl.mixKinds[h] || pl[h]}</th>)}</tr></thead>
          <tbody>{PHASES.map((k) => (
            <tr key={k}><th style={{ color: COLORS[k] }}>{pl.phases[k]}</th>
              <td>{n(["share", k], rules.share[k])}</td>
              {MIX.map((m) => <td key={m}>{n(["mix", k, m], rules.mix[k][m])}</td>)}
              <td>{n(["physical", k], rules.physical[k])}</td><td>{n(["mental", k], rules.mental[k])}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
    <div className="card form">
      <div className="card-title">{pl.warnRules}</div>
      <div className="form-row">
        <label>{pl.maxJump}{n(["warn", "maxJump"], rules.warn.maxJump)}</label>
        <label>{pl.acwrHigh}{n(["warn", "acwrHigh"], rules.warn.acwrHigh, 0.1)}</label>
        <label>{pl.compShare}{n(["warn", "compShare"], rules.warn.compShare)}</label>
        <label>{pl.buildRun}{n(["warn", "buildRun"], rules.warn.buildRun)}</label>
      </div>
      <button className="btn-ghost small" style={{ alignSelf: "flex-start" }} onClick={onReset}>{pl.resetRules}</button>
      <p className="muted">{fill(pl.defaultsNote, { peak: DEFAULT_RULES.peakArrows })}</p>
    </div>
  </>;
}

function SendView({ plan, year, pl, lang, athlete, goals, exercises, shot, ramadan, nowWeek }) {
  const [opt, setOpt] = useState({ from: "now", comps: true, targets: true, mix: true, exercises: true, goals: true, notes: true, shot: false });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setMsg("");
    try {
      const [{ planPdf }, { default: fonts }] = await Promise.all([import("../planPdf"), import("../pdfFonts")]); // loaded only now
      const first = opt.from === "now" && nowWeek >= 1 && nowWeek <= 52 ? nowWeek : 1;
      const pdf = planPdf({ plan, year, first, opt, pl, lang, athlete, goals, exercises, shot, ramadan, fonts, coach: getSettings().coachName || "" });
      await saveHtmlFile(`${pl.fileName} ${athlete.name} ${year}.pdf`, pdf, "application/pdf");
      setMsg(pl.sent);
    } catch (e) {
      console.warn("PDF failed", e);
      setMsg(location.protocol === "file:" ? pl.pdfOffline : pl.pdfFailed);
    }
    setBusy(false);
  };
  return (
    <div className="card form">
      <div className="card-header"><div className="card-title">{pl.sendTitle}</div><Help text={pl.help.send} /></div>
      <p className="muted">{pl.sendIntro}</p>
      <label>{pl.fromLabel}
        <select value={opt.from} onChange={(e) => setOpt({ ...opt, from: e.target.value })}>
          <option value="now">{pl.fromNow}</option><option value="all">{pl.fromAll}</option>
        </select>
      </label>
      {["comps", "targets", "mix", "exercises", "goals", "notes", "shot"].map((k) => (
        <label key={k} className="pz-check"><input type="checkbox" checked={opt[k]} onChange={() => setOpt({ ...opt, [k]: !opt[k] })} />{pl.include[k]}</label>
      ))}
      <button className="btn-primary" style={{ alignSelf: "flex-start" }} onClick={send} disabled={busy}><Icon name="download" size={18} />{busy ? pl.making : pl.send}</button>
      {msg && <p className="success-msg" role="status">{msg}</p>}
    </div>
  );
}
