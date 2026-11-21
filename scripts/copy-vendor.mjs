// Copies the tracking engines' WebAssembly files out of node_modules into public/vendor, so the app serves them
// itself (the security policy lets the app run code only from its own address). Runs before `npm run dev` and
// `npm run build`; public/vendor is not kept in git.
import { cpSync, mkdirSync } from "node:fs";

const files = [
  ["@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js", "mediapipe"],
  ["@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.wasm", "mediapipe"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs", "ort"], // graphics card (WebGPU)
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm", "ort"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort"], // processor only
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort"],
];
for (const [from, to] of files) {
  const dir = new URL(`../public/vendor/${to}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  cpSync(new URL(`../node_modules/${from}`, import.meta.url), new URL(from.split("/").pop(), dir));
}
console.log(`copied ${files.length} engine files to public/vendor`);
