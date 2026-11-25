import test from "node:test";
import assert from "node:assert/strict";
import { frames } from "./frames.js";

// A fake paused video whose real frames come at uneven times, as a phone records them. A seek shows the last frame
// that starts at or before the time asked for, and calls back with that frame's own time, as Chrome does.
const phoneVideo = (times, callsBack = true) => {
  let cbs = [], seeked = [], shown = -1;
  const v = {
    pause() {},
    addEventListener(type, cb) { if (type === "seeked") seeked.push(cb); },
    set currentTime(t) {
      const i = times.filter((x) => x <= t + 1e-9).length - 1, moved = i !== shown;
      shown = i;
      setTimeout(() => {
        if (moved) { const c = cbs; cbs = []; c.forEach((cb) => cb(0, { mediaTime: times[i] })); }
        const s = seeked; seeked = []; s.forEach((cb) => cb());
      }, 0);
    },
  };
  if (callsBack) v.requestVideoFrameCallback = (cb) => cbs.push(cb);
  return v;
};
globalThis.createImageBitmap = async () => ({ close() {} });
const read = async (v, to) => { const out = []; for await (const { f } of frames(v, 30, 0, to)) out.push(f); return out; };

test("on a phone clip each frame is numbered by its own time, and a frame is never read twice", async () => {
  // 30 fps nominal, but frame 3 came late (0.110 s) and frame 5 was dropped
  const times = [0, 0.033, 0.067, 0.110, 0.133, 0.2, 0.233];
  const got = await read(phoneVideo(times), 7);
  assert.deepEqual(got, [0, 1, 2, 3, 4, 6, 7].filter((f) => f < 7), "frames as the screen numbers them, dropped one skipped");
  assert.equal(new Set(got).size, got.length);
});

test("a browser that never calls back while paused gets the frames as asked", async () => {
  const got = await read(phoneVideo([0, 0.033, 0.067, 0.1, 0.133], false), 5);
  assert.deepEqual(got, [0, 1, 2, 3, 4]);
});
