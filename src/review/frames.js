// Exact frames from a <video>: seek to the middle of each frame and copy it. The next seek starts while the caller is
// still working on this frame, so reading and tracking overlap. ctl.stopped ends it early.
export async function* frames(vid, fps, from, to, ctl = {}) {
  const seek = (f) => new Promise((r) => { vid.addEventListener("seeked", r, { once: true }); vid.currentTime = (f + 0.5) / fps; });
  vid.pause();
  await seek(from);
  for (let f = from; f < to && !ctl.stopped; f++) {
    const bmp = await createImageBitmap(vid);
    const next = f + 1 < to ? seek(f + 1) : null;
    yield { f, bmp };
    await next;
  }
}
