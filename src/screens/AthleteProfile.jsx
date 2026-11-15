import { useState } from "react";
import { getAthletes, saveAthlete, deleteAthlete, calcAgeBand, calcWACategory, uid } from "../storage";

const BLANK = { id: "", name: "", dob: "", gender: "male", discipline: "recurve", stage: "0", startDate: "", focusArea: "technical", coachNotes: "", notes: "" };

export default function AthleteProfile({ tr, selectedId, onSelect, onSaved }) {
  const p = tr.profile;
  const [athletes, setAthletes] = useState(getAthletes);
  const [form, setForm] = useState(() => {
    const a = getAthletes().find((x) => x.id === selectedId);
    return a ? { ...a } : { ...BLANK };
  });
  const [saved, setSaved] = useState(false);

  const refresh = () => { setAthletes(getAthletes()); };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Sync form when selectedId changes (controlled from App)
  const currentFormId = form.id;
  if (selectedId !== currentFormId) {
    const found = athletes.find((a) => a.id === selectedId);
    if (found) {
      // Defer state update
      setTimeout(() => setForm({ ...found }), 0);
    } else {
      setTimeout(() => setForm({ ...BLANK }), 0);
    }
  }

  const ageBand  = calcAgeBand(form.dob);
  const waCategory = calcWACategory(form.discipline, form.gender, ageBand);

  const handleSave = () => {
    if (!form.name.trim()) return;
    const id = form.id || uid();
    const updated = { ...form, id, ageBand: ageBand || form.ageBand };
    saveAthlete(updated);
    refresh();
    setForm({ ...updated });
    onSelect(id);
    onSaved();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = () => {
    if (!form.id) return;
    if (!window.confirm(p.confirmDelete)) return;
    deleteAthlete(form.id);
    refresh();
    setForm({ ...BLANK });
    onSelect("");
    onSaved();
  };

  const handleNew = () => {
    setForm({ ...BLANK });
    onSelect("");
  };

  return (
    <div className="screen">
      <div className="card-header" style={{ marginBottom: 12 }}>
        <h2>{p.title}</h2>
        <button className="btn-ghost small" onClick={handleNew}>+ {tr.newAthlete}</button>
      </div>

      <div className="form">
        <div className="form-row">
          <label className="wide">{p.name}
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ahmed Ali" />
          </label>
          <label>{p.gender}
            <select value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="male">{p.genders.male}</option>
              <option value="female">{p.genders.female}</option>
            </select>
          </label>
        </div>

        <div className="form-row">
          <label>{p.dob}
            <input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
          </label>
          <label>{p.startDate}
            <input type="date" value={form.startDate || ""} onChange={(e) => set("startDate", e.target.value)} />
          </label>
        </div>

        {ageBand && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span className="badge teal">{p.ageBand}: {p.ageBands[ageBand]}</span>
            {waCategory && <span className="badge amber">{p.waCategory}: {waCategory}</span>}
          </div>
        )}

        <div className="form-row">
          <label>{p.discipline}
            <select value={form.discipline} onChange={(e) => set("discipline", e.target.value)}>
              <option value="recurve">{p.recurve}</option>
              <option value="barebow">{p.barebow}</option>
            </select>
          </label>
          <label>{p.stage}
            <select value={form.stage} onChange={(e) => set("stage", e.target.value)}>
              {p.stages.map((s, i) => <option key={i} value={String(i)}>{s}</option>)}
            </select>
          </label>
        </div>

        <label>{p.focusArea}
          <select value={form.focusArea || "technical"} onChange={(e) => set("focusArea", e.target.value)}>
            {Object.entries(p.focusAreas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>

        <label>{p.coachNotes}
          <textarea rows={2} value={form.coachNotes || ""} onChange={(e) => set("coachNotes", e.target.value)} />
        </label>

        <label>{p.notes}
          <textarea rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
        </label>

        <div className="btn-row">
          <button className="btn-primary" onClick={handleSave} disabled={!form.name.trim()}>{p.save}</button>
          {form.id && (
            <button className="btn-ghost danger" onClick={handleDelete}>{p.delete}</button>
          )}
        </div>
        {saved && <p className="success-msg">{p.saved}</p>}
      </div>
    </div>
  );
}
