// Body tracking off the screen's thread, so the Labeller stays smooth while it runs. One frame in, 33 points out
// (MediaPipe's numbering, x and y as fractions of the picture, s the confidence). Each frame is cropped round where
// the archer was in the last one, so the model sees the body at full detail even in a wide range shot.
// Engines: "mediapipe" (Google's Pose Landmarker, heavy model) or "rtm" (OpenMMLab's RTMPose-m, sharper on joints).
import { boxFrom, wholeBox, toTensor, decodeSimcc, fromCrop, sane, COCO_TO_MP, IN_W, IN_H } from "./crop.js";

const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";
let run = null, last = null; // the engine's frame → points function; the points of the last frame

async function mediapipe(base) {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks(`${base}vendor/mediapipe`, true); // the module build: workers like this one can't importScripts
  const make = (delegate) => PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MP_MODEL, delegate }, runningMode: "IMAGE", numPoses: 1,
    canvas: delegate === "GPU" ? new OffscreenCanvas(1, 1) : undefined,
    minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4,
  });
  const model = await make("GPU").catch(() => make("CPU"));
  const detect = async (bmp, box) => {
    const img = box ? await createImageBitmap(bmp, Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h)) : bmp;
    const lm = model.detect(img).landmarks?.[0];
    if (box) img.close();
    if (!lm) return null;
    const pts = lm.map((p) => ({ x: p.x, y: p.y, s: p.visibility ?? 1 }));
    return box ? fromCrop(pts, box, bmp.width, bmp.height) : pts;
  };
  return async (bmp) => {
    const box = boxFrom(last, bmp.width, bmp.height), near = box && (await detect(bmp, box));
    return sane(near, last, 8) ? near : detect(bmp, null); // lost or half-seen in the crop: look at the whole picture
  };
}

async function rtm(base) {
  const ort = await import("onnxruntime-web/webgpu");
  ort.env.wasm.wasmPaths = `${base}vendor/ort/`;
  ort.env.wasm.numThreads = 1; // threads need cross-origin isolation, which GitHub Pages can't give
  const opts = (ep) => ({ executionProviders: [ep], graphOptimizationLevel: "all" });
  const url = `${base}models/rtmpose-m-body7.onnx`;
  const session = await ort.InferenceSession.create(url, opts("webgpu"))
    .catch((gpu) => ort.InferenceSession.create(url, opts("wasm")).catch((cpu) => { throw new Error(`RTMPose could not start (graphics: ${gpu.message}; processor: ${cpu.message})`); }));
  const cv = new OffscreenCanvas(IN_W, IN_H), cx = cv.getContext("2d", { willReadFrequently: true });
  const once = async (bmp, box) => {
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = "#000"; cx.fillRect(0, 0, IN_W, IN_H);
    cx.setTransform(IN_W / box.w, 0, 0, IN_H / box.h, -box.x * IN_W / box.w, -box.y * IN_H / box.h);
    cx.drawImage(bmp, 0, 0);
    const input = new ort.Tensor("float32", toTensor(cx.getImageData(0, 0, IN_W, IN_H).data), [1, 3, IN_H, IN_W]);
    const r = await session.run({ input });
    return decodeSimcc(r.simcc_x.data, r.simcc_y.data, 17, box, bmp.width, bmp.height);
  };
  return async (bmp) => {
    const W = bmp.width, H = bmp.height;
    let box = boxFrom(last, W, H), pts = box && (await once(bmp, box));
    // No detector: from the whole picture, the rough points place a closer crop; twice is enough to settle.
    if (!sane(pts, last, 6)) { box = null; for (let i = 0; i < 3; i++) { pts = await once(bmp, box || wholeBox(W, H)); box = boxFrom(pts, W, H); if (!box) break; } }
    if (!pts || pts.filter((p) => p.s >= 0.3).length < 4) return null;
    const full = Array.from({ length: 33 }, () => ({ x: 0, y: 0, s: 0 }));
    pts.forEach((p, i) => { full[COCO_TO_MP[i]] = p; });
    return full;
  };
}

let queue = Promise.resolve(); // one message at a time: a model can't run two frames at once, and each crop needs the last frame
self.onmessage = ({ data }) => { queue = queue.then(() => handle(data)); };
async function handle(m) {
  try {
    if (m.type === "init") {
      last = null;
      run = await (m.engine === "rtm" ? rtm : mediapipe)(m.base);
      self.postMessage({ type: "ready" });
    } else if (m.type === "frame") {
      const pts = await run(m.bmp);
      m.bmp.close();
      last = pts;
      self.postMessage({ type: "pose", f: m.f, pts });
    }
  } catch (e) {
    m.bmp?.close?.();
    self.postMessage({ type: "error", message: String(e?.message || e) });
  }
}
