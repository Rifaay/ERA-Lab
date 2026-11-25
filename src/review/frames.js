// Exact frames from a <video>: seek to the middle of each frame and copy it. The next seek starts while the caller is
// still working on this frame, so reading and tracking overlap. ctl.stopped ends it early.
// A phone records with a frame rate that varies, so a seek can land on the frame before or after the one asked for.
// Where the browser says which frame it showed (requestVideoFrameCallback), each frame is numbered by its own time,
// the way the Labeller numbers what is on screen, and a frame shown twice is read once.
export const frameOfTime = (mediaTime, fps) => Math.round(mediaTime * fps);

export async function* frames(vid, fps, from, to, ctl = {}) {
  let told = "requestVideoFrameCallback" in vid, heard = false, quiet = 0, shownLast = -1; // told: the browser can say which frame it showed
  const seek = (f) => new Promise((r) => {
    let shown = null, seeked = false, wait = 0;
    const done = (same) => { clearTimeout(wait); const at = same ? shownLast : shown == null ? f : frameOfTime(shown, fps); shownLast = at; r(at); };
    if (told) vid.requestVideoFrameCallback((now, m) => { heard = true; shown = m.mediaTime; if (seeked) done(); });
    vid.addEventListener("seeked", () => {
      seeked = true;
      if (!told || shown != null) return done();
      // Silence: after earlier callbacks, the seek stayed on the frame already shown. Silent three times from the start
      // (the first seek often stays on the first frame): this browser doesn't call back while paused, so frames are
      // numbered as asked from then on.
      wait = setTimeout(() => { if (heard) done(true); else { if (++quiet >= 3) told = false; done(); } }, 150);
    }, { once: true });
    vid.currentTime = (f + 0.5) / fps;
  });
  vid.pause();
  let at = await seek(from), last = -1;
  for (let f = from; f < to && !ctl.stopped; f++) {
    const fresh = at > last && at < to; // a frame already read (the seek fell short) is not read again
    const bmp = fresh ? await createImageBitmap(vid) : null;
    const next = f + 1 < to ? seek(f + 1) : null;
    if (fresh) { last = at; yield { f: at, bmp }; }
    if (next) at = await next;
  }
}
