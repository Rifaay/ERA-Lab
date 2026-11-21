import { useMemo, useState } from "react";
import Icon from "../icons";
import ArcherSelect from "../ArcherSelect";
import "./goals.css";
import { useApp } from "../context";
import { suggestGoals, measure } from "../goals";
import { isoDay } from "../stats";
import { FAULTS } from "../clips";
import {
  getAthletes, getGoals, saveGoal, deleteGoal, getSessions, getReviews,
  getProgressLogs, saveProgressLog, deleteProgressLog,
  getCheckIns, saveCheckIn, deleteCheckIn,
  getGoalTemplates, saveGoalTemplate,
  exportBackup, importBackup, uid,
} from "../storage";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const DIGITS = { avg: 2, late: 2, offset: 1, group: 1, fliers: 1, misses: 1, routine: 0, fault: 0 };
const fmt = (kind, v) => (v == null ? "—" : (+v).toFixed(DIGITS[kind] ?? 1));
// What ERA Lab measures today for a goal it suggested (none for goals made by hand).
const measured = (goal) => (goal.metric ? measure(goal.metric, { sessions: getSessions(), reviews: getReviews(), athleteId: goal.athleteId }, isoDay(new Date())) : null);

const calcPct = (goal, auto) => {
  const logs = getProgressLogs().filter((l) => l.goalId === goal.id);
  const latest = logs.length ? logs[logs.length - 1].value : auto;
  if (latest == null || goal.baseline == null || goal.baseline === "" || goal.target == null || goal.target === "") return null;
  const range = goal.target - goal.baseline;
  if (range === 0) return 100;
  return Math.min(100, Math.max(0, Math.round(((latest - goal.baseline) / range) * 100)));
};

const daysLeft = (due) => {
  if (!due) return null;
  return Math.ceil((new Date(due) - new Date()) / 86400000);
};

function GoalForm({ athleteId, existing, templates, tr, onSaved, onCancel }) {
  const g = tr.goals;
  const blank = { id: "", athleteId, name: "", type: "performance", specific: "", metricLabel: "", baseline: "", target: "", achievable: "", relevant: "", dueDate: "" };
  const [form, setForm] = useState(existing ? { ...existing } : { ...blank });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const applyTemplate = (tmpl) => setForm((f) => ({ ...f, name: tmpl.name, type: tmpl.type || "performance", specific: tmpl.specific || "", metricLabel: tmpl.metricLabel || "", achievable: tmpl.achievable || "", relevant: tmpl.relevant || "" }));

  const handleSave = () => {
    if (!form.name.trim()) return;
    saveGoal({ ...form, id: form.id || uid(), athleteId });
    onSaved();
  };

  const handleSaveAsTemplate = () => {
    if (!form.name.trim()) return;
    const tName = window.prompt(g.templateName, form.name);
    if (!tName) return;
    saveGoalTemplate({ id: uid(), name: tName, type: form.type, specific: form.specific, metricLabel: form.metricLabel, achievable: form.achievable, relevant: form.relevant });
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      {templates.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 11, color: "var(--txm)", marginBottom: 6 }}>{g.library}</p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {templates.map((t) => (
              <button key={t.id} className="chip" onClick={() => applyTemplate(t)}>{t.name}</button>
            ))}
          </div>
        </div>
      )}
      <div className="form">
        <div className="form-row">
          <label className="wide">{g.goalName}
            <input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label>{g.goalType}
            <select value={form.type} onChange={(e) => set("type", e.target.value)}>
              {Object.entries(g.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <label>{g.specific} <textarea rows={2} value={form.specific} onChange={(e) => set("specific", e.target.value)} /></label>
        <div className="form-row">
          <label className="wide">{g.metricLabel} <input value={form.metricLabel} onChange={(e) => set("metricLabel", e.target.value)} /></label>
          <label>{g.baseline} <input type="number" value={form.baseline} onChange={(e) => set("baseline", e.target.value)} /></label>
          <label>{g.target} <input type="number" value={form.target} onChange={(e) => set("target", e.target.value)} /></label>
        </div>
        <label>{g.achievable} <input value={form.achievable} onChange={(e) => set("achievable", e.target.value)} /></label>
        <label>{g.relevant} <input value={form.relevant} onChange={(e) => set("relevant", e.target.value)} /></label>
        <label>{g.dueDate} <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></label>
        <div className="btn-row">
          <button className="btn-primary small" onClick={handleSave} disabled={!form.name.trim()}>{g.save}</button>
          <button className="btn-ghost small" onClick={handleSaveAsTemplate}>{g.addTemplate}</button>
          <button className="btn-ghost small" onClick={onCancel}><Icon name="x" size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function ProgressPanel({ goal, tr, onUpdate }) {
  const g = tr.goals;
  const [logs, setLogs] = useState(() => getProgressLogs().filter((l) => l.goalId === goal.id));
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), value: "", note: "" });
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    if (!form.value) return;
    saveProgressLog({ goalId: goal.id, date: form.date, value: Number(form.value), note: form.note });
    setLogs(getProgressLogs().filter((l) => l.goalId === goal.id));
    setForm({ date: new Date().toISOString().slice(0, 10), value: "", note: "" });
    setOpen(false);
    onUpdate && onUpdate();
  };

  const handleDelete = (id) => {
    deleteProgressLog(id);
    setLogs(getProgressLogs().filter((l) => l.goalId === goal.id));
    onUpdate && onUpdate();
  };

  const auto = useMemo(() => measured(goal), [goal]);
  const pct = calcPct(goal, auto);
  const latest = logs.length ? logs[logs.length - 1].value : auto != null ? fmt(goal.metric.kind, auto) : null;
  const dl = daysLeft(goal.dueDate);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {goal.metricLabel && <>
          <span className="badge gray">{g.baselineLabel}: {goal.baseline}</span>
          <span className="badge blue">{g.current}: {latest ?? "—"}</span>
          <span className="badge lime">{g.targetLabel}: {goal.target}</span>
        </>}
        {goal.metric && !logs.length && <span className="badge gray">{g.sug.auto}</span>}
        {goal.dueDate && (
          <span className={`badge ${dl != null && dl < 0 ? "red" : "gray"}`}>
            {dl != null && dl < 0 ? g.overdue : `${dl} ${g.daysLeft}`}
          </span>
        )}
      </div>
      {pct != null && (
        <div className="progress-wrap" style={{ marginBottom: 8 }}>
          <div className="progress-track">
            <div className="progress-fill" style={{ transform: `scaleX(${Math.min(100, Math.max(0, pct)) / 100})` }} />
          </div>
          <span className="progress-pct">{pct}%</span>
        </div>
      )}
      <div className="log-list">
        {logs.length === 0 && <p className="muted" style={{ fontSize: 12 }}>{g.noLogs}</p>}
        {[...logs].reverse().slice(0, 5).map((l) => (
          <div key={l.id} className="log-entry">
            <span className="log-date">{l.date}</span>
            <span className="log-val">{l.value}</span>
            {l.note && <span className="log-note">{l.note}</span>}
            <button className="del-btn" onClick={() => handleDelete(l.id)}>{g.deleteLog}</button>
          </div>
        ))}
      </div>
      <button className="btn-ghost small" onClick={() => setOpen(!open)}>{g.logProgress}</button>
      {open && (
        <div className="inline-form">
          <div className="form-row">
            <label>{g.logDate} <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>{g.logValue} <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></label>
          </div>
          <label>{g.logNote} <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button className="btn-primary small" onClick={handleSave} disabled={!form.value}>{g.saveLog}</button>
        </div>
      )}
    </div>
  );
}

function CheckInPanel({ goal, tr }) {
  const g = tr.goals;
  const [cis, setCis] = useState(() => getCheckIns().filter((c) => c.goalId === goal.id));
  const blank = { date: new Date().toISOString().slice(0, 10), status: "on_track", improved: "", needsWork: "", action: "" };
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);

  const STATUS_CLASS = { on_track: "teal", progressing: "amber", struggling: "red" };

  const handleSave = () => {
    saveCheckIn({ goalId: goal.id, ...form });
    setCis(getCheckIns().filter((c) => c.goalId === goal.id));
    setForm(blank);
    setOpen(false);
  };

  const handleDelete = (id) => { deleteCheckIn(id); setCis(getCheckIns().filter((c) => c.goalId === goal.id)); };

  return (
    <div>
      {cis.length === 0 && <p className="muted" style={{ fontSize: 12 }}>{g.noCI}</p>}
      {[...cis].reverse().slice(0, 3).map((c) => (
        <div key={c.id} className={`ci-entry ci-${c.status}`}>
          <div className="ci-header">
            <span style={{ fontSize: 11, color: "var(--txm)" }}>{c.date}</span>
            <span className={`badge ${STATUS_CLASS[c.status]}`}>{g.ciStatuses[c.status]}</span>
            <button className="del-btn" onClick={() => handleDelete(c.id)}><Icon name="x" size={16} /></button>
          </div>
          {c.improved && <p className="ci-line"><b>{g.ciImproved}</b> {c.improved}</p>}
          {c.needsWork && <p className="ci-line"><b>{g.ciNeedsWork}</b> {c.needsWork}</p>}
          {c.action && <p className="ci-line">{c.action}</p>}
        </div>
      ))}
      <button className="btn-ghost small" onClick={() => setOpen(!open)}>{g.checkIn}</button>
      {open && (
        <div className="inline-form">
          <div className="form-row">
            <label>{g.ciDate} <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label>{g.ciStatus}
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(g.ciStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label>{g.ciImproved} <input value={form.improved} onChange={(e) => setForm({ ...form, improved: e.target.value })} /></label>
          <label>{g.ciNeedsWork} <input value={form.needsWork} onChange={(e) => setForm({ ...form, needsWork: e.target.value })} /></label>
          <label>{g.ciAction} <input value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} /></label>
          <button className="btn-primary small" onClick={handleSave}>{g.saveCI}</button>
        </div>
      )}
    </div>
  );
}

function GoalCard({ goal, tr, onEdit, onDelete, onUpdate }) {
  const g = tr.goals;
  const [tab, setTab] = useState("progress");
  const TYPE_CLASS = { process: "blue", performance: "lime", outcome: "teal" };

  return (
    <div className="card">
      <div className="goal-card-header">
        <div>
          <span className="goal-name">{goal.name}</span>
          <span className={`badge ${TYPE_CLASS[goal.type] || "gray"}`} style={{ marginLeft: 8 }}>{g.types[goal.type]}</span>
        </div>
        <div className="goal-actions">
          <button className="btn-ghost small" onClick={() => onEdit(goal)}>{g.editGoal}</button>
          <button className="btn-ghost small danger" onClick={() => onDelete(goal.id)}>{g.deleteGoal}</button>
        </div>
      </div>
      {goal.specific && <p className="goal-specific">{goal.specific}</p>}
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={`tab ${tab === "progress" ? "active" : ""}`} onClick={() => setTab("progress")}>{g.progress}</button>
        <button className={`tab ${tab === "checkin" ? "active" : ""}`} onClick={() => setTab("checkin")}>{g.checkInTitle}</button>
      </div>
      {tab === "progress" && <ProgressPanel goal={goal} tr={tr} onUpdate={onUpdate} />}
      {tab === "checkin" && <CheckInPanel goal={goal} tr={tr} />}
    </div>
  );
}

export default function GoalsTracker({ lang, tr, selectedId }) {
  const g = tr.goals;
  const athletes = getAthletes();
  const athlete = athletes.find((a) => a.id === selectedId) || null;

  const [goals, setGoals] = useState(() => getGoals().filter((x) => x.athleteId === selectedId));
  const [templates, setTemplates] = useState(() => getGoalTemplates());
  const [editing, setEditing] = useState(null);
  const [restoreMsg, setRestoreMsg] = useState("");
  const { setSelectedId } = useApp();

  const refresh = () => {
    setGoals(getGoals().filter((x) => x.athleteId === selectedId));
    setTemplates(getGoalTemplates());
  };

  const handleDelete = (id) => {
    if (!window.confirm(g.confirmDelete)) return;
    deleteGoal(id);
    refresh();
  };

  const handleRestore = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { importBackup(ev.target.result); window.location.reload(); } // reload: the sidebar's athlete list lives in App
      catch { setRestoreMsg(g.restoreError); }
      setTimeout(() => setRestoreMsg(""), 3000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  if (!athlete) return (
    <div className="screen"><h2>{g.title}</h2><ArcherSelect tr={tr} athletes={athletes} selectedId={selectedId} onPick={setSelectedId} prompt={g.sug.pick} /></div>
  );

  return (
    <div className="screen">
      <div className="card-header" style={{ marginBottom: 12 }}>
        <h2>{g.title}</h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-ghost small" onClick={exportBackup}>{g.backup}</button>
          <label className="btn-ghost small" style={{ cursor: "pointer" }}>
            {g.restore}
            <input type="file" accept=".json" style={{ display: "none" }} onChange={handleRestore} />
          </label>
        </div>
      </div>
      {restoreMsg && <p className="success-msg">{restoreMsg}</p>}

      {!editing && <GoalSuggestions athlete={athlete} goals={goals} tr={tr} lang={lang} onUse={setEditing} />}

      {goals.length === 0 && !editing && <p className="muted">{g.noGoals}</p>}

      {goals.map((goal) =>
        editing?.id === goal.id ? (
          <GoalForm key={goal.id} athleteId={selectedId} existing={goal} templates={templates} tr={tr} onSaved={() => { refresh(); setEditing(null); }} onCancel={() => setEditing(null)} />
        ) : (
          <GoalCard key={goal.id} goal={goal} tr={tr} onEdit={setEditing} onDelete={handleDelete} onUpdate={refresh} />
        )
      )}

      {editing && !editing.id && (
        <GoalForm athleteId={selectedId} existing={editing.name ? editing : null} templates={templates} tr={tr} onSaved={() => { refresh(); setEditing(null); }} onCancel={() => setEditing(null)} />
      )}

      {!editing && (
        <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setEditing({})}>
          {g.addGoal}
        </button>
      )}
    </div>
  );
}

// "Suggested by ERA Lab": SMART goals worked out from this archer's own sessions and clips (goals.js). The coach picks
// one, edits it in the usual form and saves; nothing is added without them. Writing a goal by hand works as before.
function GoalSuggestions({ athlete, goals, tr, lang, onUse }) {
  const g = tr.goals, S = g.sug;
  const today = isoDay(new Date());
  const [hidden, setHidden] = useState([]);
  const { suggestions, p } = useMemo(() => suggestGoals({ sessions: getSessions(), reviews: getReviews(), athleteId: athlete.id }, getGoals(), today),
    [athlete.id, goals, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const idOf = (x) => x.kind + (x.fault || "");
  const shown = suggestions.filter((x) => !hidden.includes(idOf(x)));
  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const date = (iso) => new Date(`${iso}T12:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });

  const words = (x) => {
    const v = {
      d: x.distance, target: fmt(x.kind, x.target), base: fmt(x.kind, x.baseline), fault: tr.quick.faults[FAULTS.indexOf(x.fault)] || x.fault,
      chance: x.chance != null ? Math.round(x.chance * 100) : "", n: x.sessions ?? "",
      trend: x.trend != null ? `${x.trend >= 0 ? "+" : "−"}${Math.abs(x.trend).toFixed(2)}` : "",
      points: x.why ? x.why.points.toFixed(1) : "", days: Math.round((new Date(`${x.due}T12:00`) - new Date(`${today}T12:00`)) / 86400000),
    };
    const name = fill(S.name[x.kind], v);
    return {
      v, name, specific: `${name}. ${fill(S.measure[x.kind], v)}`, metricLabel: S.unit[x.kind],
      achievable: x.kind === "avg" ? fill(x.coldStart ? S.cold : S.forecast, v) : fill(S.step, v),
      relevant: x.why ? fill(S.why, { ...v, cause: tr.stats.causes[x.why.cause === "fault" ? "faults" : x.why.cause].toLowerCase() }) : S.main,
    };
  };

  if (!suggestions.length) return <section className="card goal-sug"><h3>{S.title}</h3><p className="muted">{S.none}</p></section>;
  return (
    <section className="card goal-sug">
      <h3>{S.title}</h3>
      <p className="muted">{fill(S.lead, { p: Math.round(p * 100) })}</p>
      <ul>
        {shown.map((x) => {
          const w = words(x);
          return (
            <li key={idOf(x)}>
              <span className={`badge ${x.type === "process" ? "blue" : "lime"}`}>{g.types[x.type]}</span>
              <b>{w.name}</b>
              <p className="goal-sug-line">{fill(S.fromTo, { base: w.v.base, target: w.v.target, unit: w.metricLabel, due: date(x.due) })}{x.chance != null && ` · ${fill(S.chance, w.v)}`}</p>
              <p className="muted">{w.relevant}</p>
              <div className="btn-row">
                <button className="btn-primary small" onClick={() => onUse({
                  athleteId: athlete.id, name: w.name, type: x.type, specific: w.specific, metricLabel: w.metricLabel,
                  baseline: fmt(x.kind, x.baseline), target: fmt(x.kind, x.target), achievable: w.achievable, relevant: w.relevant, dueDate: x.due,
                  metric: x.metric, suggested: { at: today, p, chance: x.chance },
                })}>{S.use}</button>
                <button className="btn-ghost small" onClick={() => setHidden([...hidden, idOf(x)])}>{S.notNow}</button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="st-note">{S.how}</p>
    </section>
  );
}
