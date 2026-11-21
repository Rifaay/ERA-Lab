// trackPose's wiring, with the browser parts faked: a worker failing part-way ends tracking with that error instead of
// hanging, and stopping early still returns the frames done so far.
import test from "node:test";
import assert from "node:assert/strict";

const later = (fn) => setTimeout(fn, 0);
const video = () => ({ muted: false, currentSrc: "blob:x", pause() {}, set currentTime(_) {}, addEventListener(type, cb) { if (type !== "error") later(cb); } });
globalThis.document = { baseURI: "http://x/", createElement: video };
globalThis.createImageBitmap = async () => ({ close() {} });
let failAt = Infinity;
globalThis.Worker = class {
  postMessage(m) {
    later(() => {
      if (m.type === "init") this.onmessage({ data: { type: "ready" } });
      else if (m.f === failAt) this.onmessage({ data: { type: "error", message: "model failed" } });
      else this.onmessage({ data: { type: "pose", f: m.f, pts: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, s: 0.9 })) } });
    });
  }
  terminate() {}
};
const { trackPose } = await import("./pose.js");

test("a model failing part-way ends tracking with its error", async () => {
  failAt = 2;
  await assert.rejects(trackPose({ vid: video(), fps: 30, frames: 10 }).done, /model failed/);
});

test("all frames come back as the Labeller's points; stopping early keeps what was done", async () => {
  failAt = Infinity;
  const all = await trackPose({ vid: video(), fps: 30, frames: 6 }).done;
  assert.equal(Object.keys(all.bow_wrist).length, 6);
  const run = trackPose({ vid: video(), fps: 30, frames: 200 });
  setTimeout(() => run.stop(), 5);
  const some = await run.done;
  assert.ok(Object.keys(some.bow_wrist || {}).length < 200);
});
