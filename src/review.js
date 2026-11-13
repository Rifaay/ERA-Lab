// Turns a clip's saved labels into the short record the rest of the app keeps: who, when, verdict, faults, hold time.
// The full labels (phases frame by frame, body points) stay in the .labels.json next to the clip on disk.

const flat = (name) => String(name || "").toLowerCase().replace(/\s+/g, "");

// Whose clip is it? The linked arrow's session is the surest answer, then the clip's own name, then the archer on screen.
export function archerOf(labels, { sessions, athletes, selectedId }) {
  const linked = labels.shot && sessions.find((s) => s.range?.session_id === labels.shot.session_id);
  if (linked) return linked.athleteId;
  const named = labels.athlete && athletes.find((a) => flat(a.name) === flat(labels.athlete));
  return named ? named.id : selectedId || "";
}

export function reviewFromLabels(labels, ctx) {
  const at = Object.fromEntries((labels.phases || []).map((p) => [p.key, p.start_s]));
  const hold = at.release != null && at.anchor != null ? +(at.release - at.anchor).toFixed(3) : null;
  return {
    id: labels.clip, athleteId: archerOf(labels, ctx), athlete: labels.athlete || "",
    date: labels.date || (labels.labelled_at || "").slice(0, 10), cameraAngle: labels.camera_angle || "",
    verdict: labels.verdict || null, faults: [...(labels.faults || [])], notes: labels.notes || "",
    holdS: hold, phasesMarked: Object.values(at).filter((t) => t != null).length,
    shot: labels.shot ? { session_id: labels.shot.session_id, end: labels.shot.end, arrow: labels.shot.arrow, score: labels.shot.score ?? null } : null,
    savedAt: labels.labelled_at || null,
  };
}

// What the archer screen says about an archer's reviewed clips.
export function reviewFacts(reviews, athleteId) {
  const mine = reviews.filter((r) => r.athleteId === athleteId).sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  const counts = {};
  for (const r of mine) for (const f of r.faults) counts[f] = (counts[f] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const holds = mine.map((r) => r.holdS).filter((h) => h != null);
  return {
    count: mine.length, faulty: mine.filter((r) => r.verdict === "fault").length,
    topFault: top ? { name: top[0], count: top[1] } : null,
    avgHold: holds.length ? holds.reduce((s, h) => s + h, 0) / holds.length : null,
    last: mine[0] || null,
  };
}
