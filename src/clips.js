// Clips filmed on the phone: their names, the short review record each one gets, and the quick tags.
// The video itself lives in clipStore.js; this file is plain logic so it can be tested.

// The Labeller's fault tags (src/review/engine.js is generated, so the list is repeated here; a test keeps them equal).
export const FAULTS = ["Collapsed draw elbow", "Plucked release", "Head moved", "Bow arm dropped", "Raised bow shoulder", "Short draw",
  "Anchor inconsistent", "Body sway / canting", "Grip torque", "Early release (no transfer)", "Wrist break (hand off forearm line)", "Hand flips away in follow-through"];

// MP4 first: it plays everywhere, including the Labeller on the computer. Chrome on Android may only offer WebM.
export const pickMime = (supported) => ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(supported) || "";
export const extOf = (mime) => (mime.startsWith("video/mp4") ? "mp4" : "webm");

const pad = (n) => String(n).padStart(2, "0");
// e.g. 2026-11-14_093015_TestArcher.mp4: sorts by time, and the Labeller on the computer finds the archer and the time in it.
export const clipName = (archerName, at, mime) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${archerName.replace(/[^\p{L}\p{N}]+/gu, "")}.${extOf(mime)}`;
};

// The review record a phone clip starts with. It is the same record the Labeller writes, so Statistics, the archer
// screen and the computer's full analysis all read it; `quick` marks tags made on the phone.
export const quickReview = ({ id, athlete, at, shot = null }) => {
  const d = new Date(at);
  return {
    id, athleteId: athlete.id, athlete: athlete.name, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    cameraAngle: "", verdict: null, faults: [], notes: "", holdS: null, phasesMarked: 0, shot, savedAt: new Date(at).toISOString(), quick: true,
  };
};

// The arrow a waiting clip belongs to: the one the coach just plotted or re-scored.
export const shotOf = (live, endIndex, arrowIndex) => {
  const e = live.ends[endIndex], a = e?.arrows[arrowIndex];
  return a ? { session_id: live.session_id, end: e.end, arrow: a.arrow, score: a.score } : null;
};

// Tapping a fault marks the shot as a fault; clearing the last fault leaves the verdict as it was.
export const toggleFault = (r, fault) => {
  const faults = r.faults.includes(fault) ? r.faults.filter((f) => f !== fault) : [...r.faults, fault];
  return { ...r, faults, verdict: faults.length ? "fault" : r.verdict, savedAt: new Date().toISOString() };
};
export const setVerdict = (r, verdict) => ({ ...r, verdict: r.verdict === verdict ? null : verdict, faults: verdict === "good" ? [] : r.faults, savedAt: new Date().toISOString() });

// When a session is saved, each linked clip takes its arrow's final score (the arrow may have been re-scored).
export const refreshShots = (reviews, session) => reviews.map((r) => {
  if (r.shot?.session_id !== session.session_id) return r;
  const a = session.ends.find((e) => e.end === r.shot.end)?.arrows.find((x) => x.arrow === r.shot.arrow);
  return a && a.score !== r.shot.score ? { ...r, shot: { ...r.shot, score: a.score } } : r;
});
