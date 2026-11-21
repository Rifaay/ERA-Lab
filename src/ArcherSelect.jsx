// Choose the archer first: with none chosen, everyone with a profile is listed. With one chosen there is nothing here:
// the header's archer picker is the one place to switch.
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
  return null;
}
