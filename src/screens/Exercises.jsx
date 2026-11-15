import { useState } from "react";
import { getAthletes, getExercises, saveExercise, deleteExercise, getGoals, uid } from "../storage";
import Icon from "../icons";

const BLANK = { id: "", name: "", category: "technique", sets: "", reps: "", frequency: "", goalLink: "", videoUrl: "", notes: "" };

function ExForm({ athleteId, existing, tr, onSaved, onCancel }) {
  const e = tr.exercises;
  const goals = getGoals().filter((g) => g.athleteId === athleteId);
  const [form, setForm] = useState(existing ? { ...existing } : { ...BLANK, athleteId });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim()) return;
    saveExercise({ ...form, id: form.id || uid(), athleteId });
    onSaved();
  };

  return (
    <div className="card inline-form" style={{ padding: 14 }}>
      <div className="form-row">
        <label className="wide">{e.name}
          <input value={form.name} onChange={(x) => set("name", x.target.value)} />
        </label>
        <label>{e.category}
          <select value={form.category} onChange={(x) => set("category", x.target.value)}>
            {Object.entries(e.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>{e.sets} <input type="number" value={form.sets} onChange={(x) => set("sets", x.target.value)} min="0" /></label>
        <label>{e.reps} <input value={form.reps} onChange={(x) => set("reps", x.target.value)} /></label>
        <label>{e.frequency} <input value={form.frequency} onChange={(x) => set("frequency", x.target.value)} placeholder={e.freqNote} /></label>
      </div>
      {goals.length > 0 && (
        <label>{e.goalLink}
          <select value={form.goalLink || ""} onChange={(x) => set("goalLink", x.target.value)}>
            <option value="">—</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}
      <label>{e.videoUrl}
        <input type="url" value={form.videoUrl} onChange={(x) => set("videoUrl", x.target.value)} placeholder="https://…" />
      </label>
      <label>{e.notes}
        <textarea rows={2} value={form.notes} onChange={(x) => set("notes", x.target.value)} />
      </label>
      <div className="btn-row">
        <button className="btn-primary small" onClick={handleSave} disabled={!form.name.trim()}>{e.save}</button>
        <button className="btn-ghost small" onClick={onCancel}><Icon name="x" size={16} /></button>
      </div>
    </div>
  );
}

export default function Exercises({ tr, selectedId }) {
  const e = tr.exercises;
  const athletes = getAthletes();
  const athlete = athletes.find((a) => a.id === selectedId) || null;

  const [exercises, setExercises] = useState(() => getExercises().filter((x) => x.athleteId === selectedId));
  const [editing, setEditing] = useState(null);
  const [filterCat, setFilterCat] = useState("all");

  const refresh = () => setExercises(getExercises().filter((x) => x.athleteId === selectedId));

  const handleDelete = (id) => {
    if (!window.confirm(e.confirmDelete)) return;
    deleteExercise(id);
    refresh();
  };

  if (!athlete) return (
    <div className="screen">
      <div className="no-athlete">
        <div className="no-athlete-icon"><Icon name="archer" size={56} /></div>
        <div className="no-athlete-text">{e.noAthlete}</div>
      </div>
    </div>
  );

  const cats = ["all", ...Object.keys(e.categories)];
  const filtered = filterCat === "all" ? exercises : exercises.filter((ex) => ex.category === filterCat);
  const goals = getGoals().filter((g) => g.athleteId === selectedId);

  return (
    <div className="screen">
      <div className="card-header" style={{ marginBottom: 12 }}>
        <h2>{e.title} — {athlete.name}</h2>
        <button className="btn-primary small" onClick={() => setEditing({})}>{e.add}</button>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
        {cats.map((c) => (
          <button key={c} className={`chip ${filterCat === c ? "active" : ""}`} onClick={() => setFilterCat(c)}>
            {c === "all" ? "All" : e.categories[c]}
          </button>
        ))}
      </div>

      {editing && (
        <ExForm
          athleteId={selectedId}
          existing={editing.id ? editing : null}
          tr={tr}
          onSaved={() => { refresh(); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {filtered.length === 0 && !editing && <p className="muted">{e.noExercises}</p>}

      {filtered.map((ex) => {
        const catColor = e.catColors[ex.category] || "#72728A";
        const linkedGoal = goals.find((g) => g.id === ex.goalLink);
        return (
          <div key={ex.id} className="card" style={{ marginBottom: 8 }}>
            <div className="exercise-card">
              <div className="ex-cat-dot" style={{ background: catColor }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
                  <span className="ex-name">{ex.name}</span>
                  <div style={{ display: "flex", gap: 5 }}>
                    <button className="btn-ghost small" onClick={() => setEditing(ex)}>{e.edit}</button>
                    <button className="btn-ghost small danger" onClick={() => handleDelete(ex.id)}>{e.delete}</button>
                  </div>
                </div>
                <div className="ex-meta">
                  <span className="badge" style={{ background: catColor + "22", color: catColor }}>{e.categories[ex.category]}</span>
                  {ex.sets && <span> {ex.sets} sets</span>}
                  {ex.reps && <span> × {ex.reps}</span>}
                  {ex.frequency && <span> · {ex.frequency}</span>}
                  {linkedGoal && <span> · {linkedGoal.name}</span>}
                </div>
                {ex.notes && <p style={{ fontSize: 11, color: "var(--txm)", marginTop: 4 }}>{ex.notes}</p>}
                {/^https?:\/\//i.test(ex.videoUrl) && <a className="ex-video" href={ex.videoUrl} target="_blank" rel="noreferrer">▶ Video</a>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
