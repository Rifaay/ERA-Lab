// Clips filmed on the phone: their names, the short review record each one gets, and the quick tags.
// The video itself lives in clipStore.js; this file is plain logic so it can be tested.

// The Labeller's fault tags (src/review/engine.js is generated, so the list is repeated here; a test keeps them equal).
export const FAULTS = ["Collapsed draw elbow", "Plucked release", "Head moved", "Bow arm dropped", "Raised bow shoulder", "Short draw",
  "Anchor inconsistent", "Body sway / canting", "Grip torque", "Early release (no transfer)", "Wrist break (hand off forearm line)", "Hand flips away in follow-through"];

// MP4 first: it plays everywhere, including the Labeller on the computer. Chrome on Android may only offer WebM.
export const pickMime = (supported) => ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(supported) || "";
export const extOf = (mime) => (mime.startsWith("video/mp4") ? "mp4" : "webm");

const pad = (n) => String(n).padStart(2, "0");
// e.g. 2026-11-14_093015_TestArcher_phone.mp4: sorts by time; the Labeller on the computer reads the archer from the third part.
export const clipName = (archerName, at, mime) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${archerName.replace(/[^\p{L}\p{N}]+/gu, "")}_phone.${extOf(mime)}`;
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

// A clip of a whole end. shortcut: it keeps arrow 1 so code keyed by session/end/arrow still reads it (a whole-end
// clip's faults count on arrow 1 in the statistics); give links an arrow-less shape if that ever matters.
export const endShot = (session_id, end) => ({ session_id, end, arrow: 1, score: null, whole: true });

// ── Clips from another camera ────────────────────────────────────────────────────────────
// Which arrow a clip filmed from `start` to `end` (ms, the camera's clock) most likely shows, among an archer's range
// sessions. Plotted arrow by arrow: the arrow plotted within two minutes after the clip ended, when the arrow before it
// was plotted before the clip began. Plotted end by end (the usual way): the first end whose plotting finished after the
// clip began (the rule the Labeller uses), and in it the first arrow that has no clip yet.
// taken: Set of "session/end/arrow" already linked to a clip.
export function suggestShot(ranges, start, end, taken = new Set()) {
  for (const s of [...ranges].sort((a, b) => a.start_ms - b.start_ms)) {
    let prev = (s.start_ms ?? -Infinity) - 120000;
    for (const e of s.ends || []) {
      const arr = e.arrows.filter((a) => a.plot_ms);
      if (!arr.length) continue;
      const shot = (a, how) => ({ session_id: s.session_id, end: e.end, arrow: a.arrow, score: a.score, how });
      for (let i = 0; i < arr.length; i++) {
        const before = i ? arr[i - 1].plot_ms : prev;
        if (arr[i].plot_ms >= end && arr[i].plot_ms - end <= 120000 && before <= start) return shot(arr[i], "arrow");
      }
      const done = Math.max(...arr.map((a) => a.plot_ms));
      if (start >= prev && start <= done) {
        const free = arr.find((a) => !taken.has(`${s.session_id}/${e.end}/${a.arrow}`)) || arr[0];
        return shot(free, "end");
      }
      prev = done;
    }
  }
  return null;
}

// The arrows a clip could be linked to by hand: sessions within a day of the clip, else the archer's latest five.
export function arrowChoices(sessions, athleteId, at) {
  const mine = sessions.filter((s) => s.athleteId === athleteId && s.range?.ends).sort((a, b) => b.date.localeCompare(a.date));
  const day = 86400000, near = mine.filter((s) => Math.abs(new Date(`${s.date}T12:00`) - at) <= 1.5 * day);
  return (near.length ? near : mine.slice(0, 5)).flatMap((s) => s.range.ends.flatMap((e) => e.arrows.filter((a) => a.score != null)
    .map((a) => ({ session_id: s.range.session_id, date: s.date, end: e.end, arrow: a.arrow, score: a.score }))));
}

// Tapping a fault marks the shot as a fault; clearing the last fault leaves the verdict as it was.
export const toggleFault = (r, fault) => {
  const faults = r.faults.includes(fault) ? r.faults.filter((f) => f !== fault) : [...r.faults, fault];
  return { ...r, faults, verdict: faults.length ? "fault" : r.verdict, savedAt: new Date().toISOString() };
};
export const setVerdict = (r, verdict) => ({ ...r, verdict: r.verdict === verdict ? null : verdict, faults: verdict === "good" ? [] : r.faults, savedAt: new Date().toISOString() });

// When a session is saved, each linked clip takes its arrow's final score (the arrow may have been re-scored).
export const refreshShots = (reviews, session) => reviews.map((r) => {
  if (r.shot?.session_id !== session.session_id || r.shot.whole) return r;
  const a = session.ends.find((e) => e.end === r.shot.end)?.arrows.find((x) => x.arrow === r.shot.arrow);
  return a && a.score !== r.shot.score ? { ...r, shot: { ...r.shot, score: a.score } } : r;
});
