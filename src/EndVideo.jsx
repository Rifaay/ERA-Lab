import { useEffect, useState } from "react";
import { getReviews, saveReview } from "./storage";
import { hasClipStore, listClips } from "./clipStore";
import { quickReview, endShot } from "./clips";
import Icon from "./icons";

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k]);

// Coach: link one end to the clip that shows it, while the end is being shot or any time after. Clips live on this
// device (filmed in the Range or imported); the link is the clip's review record, like an arrow link.
export default function EndVideo({ tr, athlete, sessionId, end }) {
  const c = tr.clips;
  const [open, setOpen] = useState(false);
  const [clips, setClips] = useState(null);
  const [, setTick] = useState(0);
  const linked = getReviews().filter((r) => r.shot?.whole && r.shot.session_id === sessionId && r.shot.end === end);

  useEffect(() => {
    if (!open || !hasClipStore()) return;
    let live = true;
    listClips().then((all) => live && setClips(all.filter((x) => x.athleteId === athlete.id).sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 12)))
      .catch(() => live && setClips([]));
    return () => { live = false; };
  }, [open, athlete.id]);

  const link = (clip, on) => {
    const rv = getReviews().find((x) => x.id === clip.id) || quickReview({ id: clip.id, athlete, at: clip.recordedAt });
    saveReview({ ...rv, shot: on ? endShot(sessionId, end) : null, savedAt: new Date().toISOString() });
    setTick((n) => n + 1);
  };
  const isOn = (id) => linked.some((r) => r.id === id);

  return (
    <div className="end-video">
      <button type="button" className={`btn-ghost small ${linked.length ? "active" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="clip" size={16} />{linked.length ? fill(c.endVideoLinked, { end, n: linked.length }) : c.endVideo}
      </button>
      {open && (
        <div className="end-video-list" role="group" aria-label={fill(c.endVideoPick, { end })}>
          <p className="muted">{fill(c.endVideoPick, { end })}</p>
          {clips == null ? <p className="muted">{c.loading}</p>
            : !clips.length ? <p className="muted">{fill(c.endVideoNone, { name: athlete.name })}</p>
            : clips.map((x) => (
              <label key={x.id} className="pz-check">
                <input type="checkbox" checked={isOn(x.id)} onChange={(e) => link(x, e.target.checked)} />
                <span dir="ltr">{new Date(x.recordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                {x.durationS ? <small className="muted">{Math.round(x.durationS)} s</small> : null}
              </label>
            ))}
        </div>
      )}
    </div>
  );
}
