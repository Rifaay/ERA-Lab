// Choose the archer first: with none chosen, everyone with a profile is listed; with one chosen, a switch at the top.
export default function ArcherSelect({ tr, athletes, selectedId, onPick, prompt }) {
  if (!selectedId || !athletes.some((a) => a.id === selectedId)) return (
    <div className="card">
      <h3>{prompt}</h3>
      {athletes.map((a) => (
        <button key={a.id} className="picker-row" onClick={() => onPick(a.id)}>
          <b>{a.name}</b>
          <small>{tr.archer.stage.replace("{n}", Number(a.stage || 0) + 1)} · {a.discipline === "barebow" ? tr.profile.barebow : tr.profile.recurve}</small>
        </button>
      ))}
      {!athletes.length && <p>{tr.shell.noArchers}</p>}
    </div>
  );
  return (
    <label className="archer-select">{tr.rubric.archer}
      <select value={selectedId} onChange={(e) => onPick(e.target.value)}>
        {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}
