import { Fragment, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getAthletes, getPlanById, getPlans, savePlan, assignArchers, getSessions, getGoals, getExercises, uid } from "../storage";
import { PHASES, COLORS, MIX, DEFAULT_RULES, rulesOf, autoPlan, compsIn, weekStart, ramadanWeeks, shotByDay, shotByWeek, loadRatio, warnings, dayFilled } from "../plan";
import { isoDay, planWeek } from "../stats";
import { saveHtmlFile } from "../scorecardFile";
import { getSettings } from "../storage";
import Help from "../Help";
import Icon from "../icons";
import { DayEditor } from "./SeasonCalendar";
import { configured, signedIn, isAdult } from "../sync";
import { isLinked, sharePlan, unsharePlan } from "../archer";

const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return isoDay(new Date(y, m - 1, d + n)); };
const short = (lang, iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short" }); };

// An older plan: its tournaments (listed by week number) become B competitions on that week's first day, and the
// weeks the coach coloured count as edited, so building the season never paints over them.
const upgrade = (plan, year) => (plan.comps ? plan : {
  ...plan,
  comps: (plan.tournaments || []).map((t) => ({ id: t.id, name: t.name, date: weekStart(year, t.week), priority: "B" })),
  edited: plan.edited || Object.keys(plan.weeks || {}).map(Number),
});

// One of the coach's plans: one season, followed by the archers the coach ticks. ERA Lab builds it from the
// competitions and the coach's rules; every week, rule, warning and part of the sent file stays the coach's to change.
// Changes save as they are made.
export default function PeriodizationPlanner({ lang, tr, planId, onBack }) {
  const pl = tr.planner;
  const today = isoDay(new Date()), thisYear = +today.slice(0, 4);
  const [plan, setPlanState] = useState(() => { const p = getPlanById(planId); return p && upgrade(p, p.year); });
  const year = plan?.year ?? thisYear;
  const [view, setView] = useState("season"); // season → week → send; rules and load open from the season
  const [armed, setArmed] = useState(null);
  const [sel, setSel] = useState(null); // the week open in the editor
  const [comp, setComp] = useState({ name: "", date: "", priority: "A" });
  const [weekOpen, setWeekOpen] = useState(null); // the plan week open in the week view

  const autoRamadan = useMemo(() => ramadanWeeks(year), [year]);
  // What the plan's archers shot, as one archer's average, so the load warnings read for anyone on the plan.
  const ids = (plan?.archers || []).join(",");
  const byDay = useMemo(() => {
    const list = ids ? ids.split(",") : [], sessions = getSessions(), sum = {};
    for (const id of list) for (const [d, n] of Object.entries(shotByDay(sessions, id))) sum[d] = (sum[d] || 0) + n;
    for (const d in sum) sum[d] = Math.round(sum[d] / list.length);
    return sum;
  }, [ids]);
  const shot = useMemo(() => shotByWeek(byDay, year), [byDay, year]);

  if (!plan) return <div className="screen"><p className="muted">{pl.flow.gone}</p><button className="btn-ghost" onClick={onBack}>{pl.flow.allPlans}</button></div>;

  const setPlan = (next) => { setPlanState(next); savePlan(next); };
  const rules = rulesOf(plan);
  const ramadan = plan.ramadan || autoRamadan;
  const nowWeek = year === thisYear ? planWeek(today) : year < thisYear ? 53 : 0;
  const comps = compsIn(plan.comps, year).sort((a, b) => a.week - b.week);
  const warns = warnings(plan, year, byDay, nowWeek);
  const goals = getGoals().filter((g) => plan.archers.includes(g.athleteId));
  const exercises = getExercises().filter((x) => !x.athleteId || plan.archers.includes(x.athleteId)); // the coach's library and the plan's archers' own
  const edited = new Set((plan.edited || []).map(Number));
  const built = Object.keys(plan.weeks || {}).length > 0;
  const coming = (() => {
    const out = comps.filter((c) => c.date >= today).map((c) => ({ key: "c" + c.id, date: c.date, week: c.week, title: `${c.priority} · ${c.name}`, sub: pl.prio[c.priority] }));
    for (let w = Math.max(2, nowWeek + 1); w <= 52; w++) {
      const k = plan.weeks?.[w];
      if (k && k !== plan.weeks?.[w - 1]) out.push({ key: "p" + w, date: weekStart(year, w), week: w, title: fill(pl.flow.phaseStarts, { phase: pl.phases[k] }), sub: `${pl.wk}${w}` });
    }
    return out.sort((x, y) => x.date.localeCompare(y.date)).slice(0, 3);
  })();

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
  // A plan is one season: a competition in another year belongs in another plan.
  const fileInYear = (c) => window.alert(fill(pl.flow.otherYear, { year, y: c.date.slice(0, 4) }));
  const addComp = () => {
    if (!comp.name.trim() || !comp.date) return;
    const c = { ...comp, name: comp.name.trim(), id: uid() };
    if (+c.date.slice(0, 4) === year) rebuildWith({ comps: [...(plan.comps || []), c] }); else fileInYear(c);
    setComp({ name: "", date: "", priority: "A" });
  };
  const setCompField = (id, k, v) => {
    const c = { ...plan.comps.find((x) => x.id === id), [k]: v };
    if (k === "date" && v && +v.slice(0, 4) !== year) return fileInYear(c); // moved to another year
    rebuildWith({ comps: plan.comps.map((x) => (x.id === id ? c : x)) });
  };
  const removeComp = (id) => rebuildWith({ comps: plan.comps.filter((c) => c.id !== id) });
  const setRule = (path, v) => {
    const r = structuredClone(plan.rules || {});
    let o = r; for (const k of path.slice(0, -1)) o = o[k] ||= {};
    o[path.at(-1)] = v === "" ? undefined : v;
    rebuildWith({ rules: r });
  };
  const openWeek = (w) => { setWeekOpen(Math.min(52, Math.max(1, w))); setView("week"); setSel(null); };
  const setDay = (iso, d) => { const days = { ...plan.days }; if (d) days[iso] = d; else delete days[iso]; setPlan({ ...plan, days }); };
  const setRamadan = (w, on) => { const list = on ? [...new Set([...ramadan, w])] : ramadan.filter((x) => x !== w); rebuildWith({ ramadan: list }, list); };

  return (
    <div className="screen pz">
      <button className="btn-ghost small pz-back" onClick={view === "season" ? onBack : () => setView("season")}><Icon name="prev" size={16} />{view === "season" ? pl.flow.allPlans : pl.backToSeason}</button>
      <div className="pz-head">
        <h2>{plan.name}</h2>
        <button type="button" className="pz-who" onClick={() => setView("send")}>
          {plan.archers.length ? fill(plan.archers.length === 1 ? pl.flow.oneArcher : pl.flow.nArchers, { n: plan.archers.length }) : pl.flow.noArchers} · {year}
        </button>
      </div>

      {view === "season" && !built && <>
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
            <input type="date" value={comp.date} onChange={(e) => setComp({ ...comp, date: e.target.value })} aria-label={pl.compDate} />
            <button className="btn-primary small" onClick={addComp} disabled={!comp.name.trim() || !comp.date}>{pl.add}</button>
          </div>
        </div>

        <p className="muted pz-ramadan"><Icon name="moon" size={16} /> {ramadan.length ? fill(pl.flow.ramadan, { from: short(lang, weekStart(year, Math.min(...ramadan))), to: short(lang, addDays(weekStart(year, Math.max(...ramadan)), 6)) }) : pl.flow.ramadanNone}</p>
        <button className="btn-primary wide-btn" onClick={() => setView("cal")}>{pl.cyc.planCal}</button>
        <button className="btn-ghost wide-btn" onClick={() => { build(); setView("cal"); }}>{pl.cyc.fillAuto}</button>
        <p className="muted">{pl.cyc.buildNote}</p>
      </>}

      {view === "season" && built && <div className="pz-season">
        <SeasonChart {...{ plan, year, lang, pl, comps, nowWeek }} onOpen={openWeek} />
        {nowWeek >= 1 && nowWeek <= 52 && (() => {
          const k = plan.weeks?.[nowWeek], t = +plan.targets?.[nowWeek]?.arrows || 0, s0 = weekStart(year, nowWeek);
          const days = Array.from({ length: 7 }, (_, i) => addDays(s0, i)), sum = days.reduce((n, iso) => n + (+plan.days?.[iso]?.arrows || 0), 0);
          return (
            <button type="button" className="pz-thisweek" onClick={() => openWeek(nowWeek)}>
              <small>{fill(pl.flow.thisWeek, { from: short(lang, s0), to: short(lang, days[6]) })}</small>
              <b>{k ? pl.phases[k] : pl.flow.notPlanned} · {pl.wk}{nowWeek}</b>
              <span>{t ? fill(pl.flow.planned, { p: sum, t }) : fill(pl.flow.plannedOnly, { p: sum })} · {(() => { const n = days.filter((iso) => dayFilled(plan.days?.[iso])).length; return n === 1 ? pl.flow.trainingDay : fill(pl.flow.trainingDays, { n }); })()}</span>
              <em>{pl.flow.openWeek}</em>
            </button>
          );
        })()}
        <section className="pz-coming">
          <h3>{pl.flow.comingUp}</h3>
          {coming.length ? coming.map((x) => (
            <button key={x.key} type="button" className="pz-next-row" onClick={() => openWeek(x.week)}>
              <small>{short(lang, x.date)}</small><span><b>{x.title}</b><em>{x.sub}</em></span>
            </button>
          )) : <p className="muted">{pl.flow.nothingSoon}</p>}
        </section>
        <div className="pz-legend" aria-label={pl.legend}>
          {[...new Set(Object.values(plan.weeks || {}))].map((k) => <span key={k}><i style={{ background: COLORS[k] }} />{pl.phases[k]}</span>)}
        </div>
        <button className="btn-primary wide-btn pz-send" onClick={() => setView("send")}>{pl.flow.archersSend}</button>
        <div className="pz-more">
          <button className="btn-ghost small" onClick={() => setView("comps")}>{pl.comps} ({comps.length})</button>
          <button className="btn-ghost small" onClick={() => setView("cal")}>{pl.cyc.title}</button>
          <button className="btn-ghost small" onClick={() => setView("load")}>{pl.tabs.load}{warns.length ? ` (${warns.length})` : ""}</button>
          <button className="btn-ghost small" onClick={() => setView("rules")}>{pl.flow.adjust}</button>
        </div>
      </div>}

      {view === "comps" && <>
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
            <input type="date" value={comp.date} onChange={(e) => setComp({ ...comp, date: e.target.value })} aria-label={pl.compDate} />
            <button className="btn-primary small" onClick={addComp} disabled={!comp.name.trim() || !comp.date}>{pl.add}</button>
          </div>
        </div>

        <p className="muted pz-ramadan"><Icon name="moon" size={16} /> {ramadan.length ? fill(pl.flow.ramadan, { from: short(lang, weekStart(year, Math.min(...ramadan))), to: short(lang, addDays(weekStart(year, Math.max(...ramadan)), 6)) }) : pl.flow.ramadanNone}</p>
      </>}
      {view === "cal" && <CycleCalendar {...{ plan, year, lang, pl, comps, exercises, shot, ramadan, goals, edited, today }} onPlan={setPlan} onTouch={touch} onDay={setDay}
        onAuto={(w) => rebuildWith({ edited: [...edited].filter((x) => x !== w) })} onRamadan={setRamadan} />}

      {view === "week" && weekOpen && <WeekDays key={weekOpen} w={weekOpen} {...{ plan, year, lang, pl, comps, exercises, shot, ramadan, goals, edited }}
        onWeek={openWeek} onDay={setDay} onDays={(days) => setPlan({ ...plan, days })} onSend={() => setView("send")}
        onTargets={(change) => touch(weekOpen, change)} onAuto={() => rebuildWith({ edited: [...edited].filter((x) => x !== weekOpen) })} onRamadan={(on) => setRamadan(weekOpen, on)} />}

      {view === "rules" && <>
        <RulesView {...{ rules, pl }} set={setRule} onReset={() => window.confirm(pl.confirmRules) && rebuildWith({ rules: {} })} />
        <div className="card">
        <div className="card-title">{pl.flow.paint}</div>
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
        </div>
        <div className="btn-row">
          <button className="btn-ghost small" onClick={rebuild}>{pl.flow.rebuildAll}</button>
          <button className="btn-ghost small danger" onClick={clear}>{pl.flow.reset}</button>
        </div>
      </>}

      {view === "load" && <LoadView {...{ plan, year, pl, shot, byDay, warns, nowWeek }}
        onDismiss={(key) => setPlan({ ...plan, dismissed: [...(plan.dismissed || []), key] })}
        onRestore={() => setPlan({ ...plan, dismissed: [] })} onOpen={openWeek} />}

      {view === "send" && <SendView {...{ plan, year, pl, lang, goals, exercises, shot, ramadan, nowWeek }} onSent={(at) => setPlan({ ...getPlanById(plan.id), sentAt: at })}
        onArchers={(list) => { assignArchers(plan.id, list); setPlanState(upgrade(getPlanById(plan.id), year)); }} />}
    </div>
  );
}

// The season as a chart: a bar per week, coloured by phase and as tall as the week's planned arrows, the competitions
// marked above it and this week outlined. A bar opens its week.
function SeasonChart({ plan, year, lang, pl, comps, nowWeek, onOpen }) {
  const max = Math.max(1, ...Object.values(plan.targets || {}).map((t) => +t?.arrows || 0));
  const months = Array.from({ length: 12 }, (_, m) => new Date(year, m, 1).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { month: "short" }));
  return (
    <div className="pz-chart" dir="ltr">
      <div className="pz-flags" aria-hidden="true">
        {comps.map((c) => <b key={c.id} className={`p${c.priority}`} style={{ left: `${((c.week - 0.5) / 52) * 100}%` }}>{c.priority}</b>)}
      </div>
      <div className="pz-bars">
        {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => {
          const k = plan.weeks?.[w], n = +plan.targets?.[w]?.arrows || 0;
          return (
            <button key={w} type="button" className={w === nowWeek ? "now" : ""} onClick={() => onOpen(w)}
              aria-label={`${pl.wk}${w} · ${k ? pl.phases[k] : pl.flow.notPlanned}${n ? ` · ${fill(pl.flow.arrowsN, { n })}` : ""}`}>
              <i style={{ height: `${k ? Math.max(8, (n / max) * 100) : 4}%`, background: k ? COLORS[k] : undefined }} />
            </button>
          );
        })}
      </div>
      <div className="pz-months" aria-hidden="true">{months.map((m, i) => <span key={i}>{m}</span>)}</div>
    </div>
  );
}

// The season calendar: months, their weeks, the weeks' days, with the three cycles on one page.
// Macrocycle: the season's goal and its phases (painted onto weeks: pick a phase, tap a block's first and last week).
// Mesocycle: each run of weeks with one phase is a block, with its dates and the goal the coach writes for it.
// Microcycle: a week opens to its days and its requirements (arrow target, mix, physical and mental sessions).
// A day opens as a sheet.
function CycleCalendar({ plan, year, lang, pl, comps, exercises, shot, ramadan, goals, edited, today, onPlan, onTouch, onDay, onAuto, onRamadan }) {
  const c = pl.cyc, loc = lang === "ar" ? "ar-EG" : "en-GB";
  const [paint, setPaint] = useState(null); // a phase key, "none" to clear, or null when not painting
  const [anchor, setAnchor] = useState(null); // the first week tapped of a block being painted
  const [open, setOpen] = useState(() => planWeek(today) <= 52 && +today.slice(0, 4) === year ? planWeek(today) : null);
  const [day, setDay] = useState(null);
  const weeks = plan.weeks || {};
  const date = (iso, o = { day: "numeric", month: "short" }) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(loc, o); };
  const daysOf = (w) => { const s0 = weekStart(year, w), out = []; for (let i = 0; i < 7; i++) { const iso = addDays(s0, i); if (+iso.slice(0, 4) === year && planWeek(iso) === w) out.push(iso); } return out; };
  // blocks: runs of weeks with the same phase
  const blocks = [];
  for (let w = 1; w <= 52; w++) { const k = weeks[w] || null; const last = blocks.at(-1); if (last && last.k === k) last.to = w; else blocks.push({ k, from: w, to: w }); }
  const blockAt = Object.fromEntries(blocks.flatMap((b) => Array.from({ length: b.to - b.from + 1 }, (_, i) => [b.from + i, b])));
  const tap = (w) => {
    if (!paint) { setOpen(open === w ? null : w); return; }
    const from = anchor ?? w, lo = Math.min(from, w), hi = Math.max(from, w), next = { ...weeks };
    for (let x = lo; x <= hi; x++) { if (paint === "none") delete next[x]; else next[x] = paint; }
    onPlan({ ...plan, weeks: next, edited: [...new Set([...(plan.edited || []).map(Number), ...Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)])] });
    setAnchor(anchor == null ? w : null);
  };
  const setMeso = (from, goal) => onPlan({ ...plan, meso: { ...plan.meso, [from]: goal } });
  const monthOf = (w) => +weekStart(year, w).slice(5, 7) - 1;
  const rows = [];
  for (let w = 1; w <= 52; w++) {
    const b = blockAt[w];
    if (w === 1 || monthOf(w) !== monthOf(w - 1)) rows.push(<h3 key={"m" + w} className="cy-month">{new Date(year, monthOf(w), 1).toLocaleDateString(loc, { month: "long", year: "numeric" })}</h3>);
    if (b.from === w && b.k) rows.push(
      <div key={"b" + w} className="cy-block" style={{ borderColor: COLORS[b.k] }}>
        <span className="cy-block-head"><i style={{ background: COLORS[b.k] }} /><b>{pl.phases[b.k]}</b><small>{fill(c.blockLen, { n: b.to - b.from + 1, from: date(weekStart(year, b.from)), to: date(addDays(weekStart(year, b.to), 6)) })}</small></span>
        <input className="cy-goal" value={plan.meso?.[b.from] || ""} placeholder={c.mesoPh} aria-label={c.mesoGoal} onChange={(e) => setMeso(b.from, e.target.value)} />
      </div>
    );
    const k = weeks[w], t = +plan.targets?.[w]?.arrows || 0, cs = comps.filter((x) => x.week === w), isOpen = open === w && !paint;
    rows.push(
      <div key={"w" + w} className={"cy-week" + (isOpen ? " open" : "") + (anchor === w ? " anchor" : "")}>
        <button type="button" className="cy-week-row" aria-expanded={isOpen} onClick={() => tap(w)}>
          <i className="cy-band" style={{ background: k ? COLORS[k] : undefined }} />
          <span className="cy-wk">{pl.wk}{w}</span>
          <span className="cy-dates">{date(weekStart(year, w))} – {date(addDays(weekStart(year, w), 6))}</span>
          {cs.map((x) => <span key={x.id} className={`wk-comp p${x.priority}`}>{x.priority}</span>)}
          {ramadan.includes(w) && <Icon name="moon" size={14} />}
          <span className="cy-target">{t ? fill(pl.flow.arrowsN, { n: t }) : ""}</span>
        </button>
        {isOpen && <div className="cy-open">
          <div className="cy-days">
            {daysOf(w).map((iso) => { const d = plan.days?.[iso]; return (
              <button key={iso} type="button" className={`cy-day ${dayFilled(d) ? "f" : ""} ${iso === today ? "t" : ""}`} onClick={() => setDay(iso)}>
                <small>{date(iso, { weekday: "short" })}</small><b>{+iso.slice(8)}</b><em>{dayFilled(d) ? (d.focus || (d.arrows ? d.arrows : "•")) : ""}</em>
              </button>); })}
          </div>
          <WeekEditor w={w} {...{ plan, year, lang, pl, shot, comps, ramadan, goals, exercises, edited }} onChange={(change) => onTouch(w, change)} onAuto={() => onAuto(w)} onRamadan={(on) => onRamadan(w, on)} onClose={() => setOpen(null)} />
        </div>}
      </div>
    );
  }
  return (
    <div className="cy">
      <section className="cy-macro">
        <h3>{c.macro}</h3>
        <textarea rows={2} value={plan.macro || ""} placeholder={c.macroPh} aria-label={c.macro} onChange={(e) => onPlan({ ...plan, macro: e.target.value })} />
        <span className="plan-strip" aria-hidden="true">{Array.from({ length: 52 }, (_, i) => <i key={i} style={{ background: weeks[i + 1] ? COLORS[weeks[i + 1]] : undefined }} />)}</span>
        <small className="muted">{(() => { const n = blocks.filter((b) => b.k).length; return n === 1 ? c.blockOne : fill(c.blocksN, { n }); })()}</small>
      </section>
      <div className={`cy-paint ${paint ? "on" : ""}`}>
        {paint ? <>
          <p>{anchor == null ? c.paintFirst : c.paintLast}</p>
          <div className="cy-palette" role="radiogroup" aria-label={c.paint}>
            {PHASES.map((k) => <button key={k} type="button" role="radio" aria-checked={paint === k} className={paint === k ? "on" : ""} style={{ "--ph": COLORS[k] }} onClick={() => { setPaint(k); setAnchor(null); }}>{pl.phases[k]}</button>)}
            <button type="button" role="radio" aria-checked={paint === "none"} className={paint === "none" ? "on" : ""} onClick={() => { setPaint("none"); setAnchor(null); }}>{c.erase}</button>
          </div>
          <button className="btn-primary small" onClick={() => { setPaint(null); setAnchor(null); }}>{c.done}</button>
        </> : <button className="btn-ghost small" onClick={() => setPaint(PHASES[0])}>{c.paint}</button>}
      </div>
      <div className="cy-list">{rows}</div>
      {day && createPortal(<div className="pz-sheet-wrap" role="dialog" aria-label={day} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
        <button type="button" className="pz-scrim" aria-label={pl.flow.closeDay} onClick={() => setDay(null)} />
        <div className="pz-sheet"><span className="pz-grip" aria-hidden="true" />
          <DayEditor iso={day} plan={plan} lang={lang} pl={pl} exercises={exercises} comps={comps.filter((x) => x.date === day)}
            onChange={(patch) => onDay(day, patch)} onWeek={() => setDay(null)} onClose={() => setDay(null)} />
        </div>
      </div>, document.body)}
    </div>
  );
}

function WeekDays({ w, plan, year, lang, pl, comps, exercises, shot, ramadan, goals, edited, onWeek, onDay, onDays, onSend, onTargets, onAuto, onRamadan }) {
  const f = pl.flow;
  const [open, setOpen] = useState(null);
  const [targets, setTargets] = useState(false);
  const [msg, setMsg] = useState("");
  const daysOf = (wk) => { const s0 = weekStart(year, wk), out = []; for (let i = 0; i < 9; i++) { const iso = addDays(s0, i); if (+iso.slice(0, 4) === year && planWeek(iso) === wk) out.push(iso); } return out; };
  const days = daysOf(w), k = plan.weeks?.[w], todayIso = isoDay(new Date());
  const sum = days.reduce((n, iso) => n + (+plan.days?.[iso]?.arrows || 0), 0), target = +plan.targets?.[w]?.arrows || 0;
  const exName = new Map(exercises.map((x) => [x.id, x.name]));
  const label = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { weekday: "short", day: "numeric" }); };
  const repeat = () => { // last week's days, in the same order, into this week's empty days
    const prev = daysOf(w - 1), next = { ...plan.days };
    let n = 0;
    days.forEach((iso, i) => { const src = plan.days?.[prev[i]]; if (dayFilled(src) && !dayFilled(next[iso])) { next[iso] = { ...src }; n++; } });
    onDays(next); setMsg(fill(f.repeated, { n }));
  };
  return (
    <div className="pz-weekview">
      <div className="pz-weekhead">
        <button className="icon-btn" onClick={() => onWeek(w - 1)} disabled={w <= 1} aria-label={f.prevWeek}><Icon name="prev" size={18} /></button>
        <div className="grow">
          <h3>{fill(f.weekTitle, { w, from: short(lang, days[0]), to: short(lang, days.at(-1)) })}</h3>
          <p className="muted">{k ? pl.phases[k] : f.notPlanned} · {target ? fill(f.planned, { p: sum, t: target }) : fill(f.plannedOnly, { p: sum })}</p>
          {target > 0 && <div className="pz-weekbar" role="img" aria-label={fill(f.planned, { p: sum, t: target })}><i style={{ width: `${Math.min(100, (sum / target) * 100)}%` }} /></div>}
        </div>
        <button className="icon-btn" onClick={() => onWeek(w + 1)} disabled={w >= 52} aria-label={f.nextWeek}><Icon name="next" size={18} /></button>
      </div>
      {comps.filter((c) => c.week === w).map((c) => <p key={c.id}><span className={`wk-comp p${c.priority}`} style={{ position: "static", display: "inline-grid" }}>{c.priority}</span> {c.name}</p>)}
      <div className="pz-days">
        {days.map((iso) => {
          const d = plan.days?.[iso];
          return (
            <Fragment key={iso}>
              <button type="button" className={`pz-day ${dayFilled(d) ? "" : "rest"} ${iso === todayIso ? "today" : ""}`} aria-expanded={open === iso} onClick={() => setOpen(iso)}>
                <b className="pz-day-date"><small>{label(iso).split(" ")[0]}</small>{+iso.slice(8)}</b>
                <span className="grow">
                  {dayFilled(d) ? <>
                    <span>{[d.focus, +d.arrows ? fill(f.arrowsN, { n: d.arrows }) : ""].filter(Boolean).join(" · ")}</span>
                    <small className="muted">{(d.exercises || []).map((id) => exName.get(id)).filter(Boolean).join(", ") || d.note || ""}</small>
                  </> : <span className="muted">{f.nothing}</span>}
                </span>
              </button>
              {open === iso && createPortal(<div className="pz-sheet-wrap" role="dialog" aria-label={label(iso)} dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
                <button type="button" className="pz-scrim" aria-label={pl.flow.closeDay} onClick={() => setOpen(null)} />
                <div className="pz-sheet"><span className="pz-grip" aria-hidden="true" />
                  <DayEditor iso={iso} plan={plan} lang={lang} pl={pl} exercises={exercises} comps={comps.filter((c) => c.date === iso)}
                    onChange={(patch) => onDay(iso, patch)} onWeek={() => { setOpen(null); setTargets(true); }} onClose={() => setOpen(null)} />
                </div>
              </div>, document.body)}
            </Fragment>
          );
        })}
      </div>
      <div className="btn-row">
        <button className="btn-ghost small" onClick={repeat} disabled={w <= 1}>{f.repeat}</button>
        <button className="btn-ghost small" onClick={() => setTargets(!targets)} aria-expanded={targets}>{targets ? f.hideTargets : f.targets}</button>
        <button className="btn-primary small" onClick={onSend}>{f.sendWeek}</button>
      </div>
      {msg && <p className="success-msg" role="status">{msg}</p>}
      {targets && <WeekEditor w={w} {...{ plan, year, lang, pl, shot, comps, ramadan, goals, exercises, edited }} onChange={onTargets} onAuto={onAuto} onRamadan={onRamadan} onClose={() => setTargets(false)} />}
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

function SendView({ plan, year, pl, lang, goals, exercises, shot, ramadan, nowWeek, onSent, onArchers }) {
  const athlete = { name: plan.name }; // the PDF is titled with the plan
  const [opt, setOpt] = useState({ from: "now", comps: true, targets: true, mix: true, exercises: true, goals: true, notes: true, shot: false });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setMsg("");
    try {
      const [{ planPdf }, { default: fonts }] = await Promise.all([import("../planPdf"), import("../pdfFonts")]); // loaded only now
      const first = opt.from === "now" && nowWeek >= 1 && nowWeek <= 52 ? nowWeek : 1;
      const pdf = planPdf({ plan, year, first, opt, pl, lang, athlete, goals, exercises, shot, ramadan, fonts, coach: getSettings().coachName || "" });
      await saveHtmlFile(`${pl.fileName} ${plan.name}.pdf`, pdf, "application/pdf");
      setMsg(pl.sent);
    } catch (e) {
      console.warn("PDF failed", e);
      setMsg(location.protocol === "file:" ? pl.pdfOffline : pl.pdfFailed);
    }
    setBusy(false);
  };
  return (<>
    <Followers {...{ plan, pl, lang, exercises, onSent, onArchers }} />
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
      <button className="btn-ghost" style={{ alignSelf: "flex-start" }} onClick={send} disabled={busy}><Icon name="download" size={18} />{busy ? pl.making : pl.send}</button>
      {msg && <p className="success-msg" role="status">{msg}</p>}
    </div>
  </>);
}

// Who follows the plan: tick the archers. Saving sends it to every ticked archer with their own app (adults with a
// linked phone); archers ticked off lose that season's copy. Under-18s and archers without the app follow it on the
// coach's phone. Ticking an archer on another plan of the season moves them here.
function Followers({ plan, pl, lang, exercises, onSent, onArchers }) {
  const f = pl.followers, athletes = getAthletes();
  const [on, setOn] = useState(() => new Set(plan.archers));
  const [state, setState] = useState(""); // "" | busy | done | error text
  const elsewhere = Object.fromEntries(getPlans().filter((p) => p.year === plan.year && p.id !== plan.id).flatMap((p) => p.archers.map((a) => [a, p.name])));
  const cloud = configured && signedIn();
  const app = (a) => cloud && isAdult(a.dob) && isLinked(a.id);
  const ticked = athletes.filter((a) => on.has(a.id)), sending = ticked.filter(app);
  const tag = (a) => app(a) ? <span className="pz-tag app">{f.ownApp}</span>
    : !isAdult(a.dob) ? <span className="pz-tag">{f.minor}</span>
    : elsewhere[a.id] ? <span className="pz-tag move">{fill(f.elsewhere, { plan: elsewhere[a.id] })}</span>
    : <span className="pz-tag">{f.here}</span>;
  const save = async () => {
    const before = new Set(plan.archers), dropped = athletes.filter((a) => before.has(a.id) && !on.has(a.id) && app(a));
    onArchers([...on]);
    if (!sending.length && !dropped.length) { setState("done"); return; }
    setState("busy");
    try {
      for (const a of dropped) await unsharePlan(a.id, plan.year);
      for (const a of sending) await sharePlan({ ...plan, archers: [...on] }, a, exercises);
      setState("done"); if (sending.length) onSent?.(new Date().toISOString());
    } catch (e) { setState(navigator.onLine === false || e instanceof TypeError ? pl.app.offline : e.message); }
  };
  return (
    <div className="card form pz-followers">
      <div className="card-title">{f.title}</div>
      {!athletes.length && <p className="muted">{f.none}</p>}
      <div className="pz-list">
        {athletes.map((a) => (
          <label key={a.id} className="pz-arch">
            <input type="checkbox" checked={on.has(a.id)} onChange={() => { const n = new Set(on); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); setOn(n); setState(""); }} />
            <span className="pz-av" aria-hidden="true">{a.name.split(/\s+/).map((w) => [...w][0]).slice(0, 2).join("").toUpperCase()}</span>
            <span className="pz-arch-text"><b>{a.name}</b>{tag(a)}</span>
          </label>
        ))}
      </div>
      <p className="muted">{cloud ? f.whatTheySee : !configured ? pl.flow.cant.noCloud : pl.flow.cant.signIn}</p>
      <button className="btn-primary" onClick={save} disabled={state === "busy"}>{state === "busy" ? f.sending : sending.length ? fill(sending.length === 1 ? f.sendOne : f.sendN, { n: sending.length }) : f.save}</button>
      <p className="muted"><b>{plan.sentAt ? fill(pl.flow.lastSent, { date: new Date(plan.sentAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short" }) }) : pl.flow.neverSent}</b></p>
      {state === "done" && <p className="success-msg" role="status">{sending.length ? fill(f.sent, { n: sending.length }) : f.saved}</p>}
      {state && state !== "busy" && state !== "done" && <p className="error-msg" role="alert">{state}</p>}
    </div>
  );
}
