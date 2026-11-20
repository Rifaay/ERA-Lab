import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./clips.css";
import { pickMime } from "./clips";
import Icon from "./icons";

// Full-screen camera: record, stop, flip between the back and front camera. Hands the whole clip back on stop.
// Needs a secure page (https or localhost) and the coach's permission for the camera; sound is not recorded.
export default function Recorder({ tr, onDone, onClose }) {
  const r = tr.rec;
  const view = useRef(null), stream = useRef(null), rec = useRef(null), chunks = useRef([]), started = useRef(0);
  const supported = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const [facing, setFacing] = useState("environment");
  const [state, setState] = useState(supported ? "starting" : "error"); // starting | ready | recording | error
  const [error, setError] = useState(supported ? "" : r.noCamera);
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    let alive = true;
    const stop = () => stream.current?.getTracks().forEach((t) => t.stop());
    if (!supported) return undefined;
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } } })
      .then((s) => {
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s; view.current.srcObject = s; setState("ready");
      })
      .catch((e) => { if (alive) { setState("error"); setError(e.name === "NotAllowedError" ? r.denied : `${r.noCamera} (${e.name})`); } });
    return () => { alive = false; stop(); };
  }, [facing, r, supported]);

  useEffect(() => {
    if (state !== "recording") return undefined;
    const id = setInterval(() => setSecs(Math.floor((Date.now() - started.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [state]);

  const start = () => {
    const mime = pickMime((m) => MediaRecorder.isTypeSupported(m));
    const m = new MediaRecorder(stream.current, { ...(mime && { mimeType: mime }), videoBitsPerSecond: 8_000_000 });
    chunks.current = [];
    m.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    m.onstop = () => {
      const type = m.mimeType || mime || "video/webm";
      onDone({ blob: new Blob(chunks.current, { type }), mime: type, recordedAt: started.current, durationS: (Date.now() - started.current) / 1000 });
    };
    started.current = Date.now(); setSecs(0);
    m.start(1000); // a chunk every second, so a crash mid-shot loses at most a second
    rec.current = m; setState("recording");
    navigator.vibrate?.(30);
  };
  const stop = () => { rec.current?.stop(); setState("ready"); navigator.vibrate?.([20, 40, 20]); };

  // Drawn on the page itself, above the app bar: inside the screen it would sit under it.
  return createPortal(
    <div className="recorder" role="dialog" aria-label={r.title}>
      <video ref={view} autoPlay muted playsInline />
      {state === "recording" && <div className="rec-time" role="timer"><i />{String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</div>}
      {state === "error" && <div className="rec-error" role="alert">{error}</div>}
      <div className="rec-bar">
        <button className="rec-side" onClick={() => { if (state === "recording") stop(); onClose(); }} aria-label={r.close}><Icon name="x" size={26} /></button>
        <button className={`rec-btn ${state === "recording" ? "on" : ""}`} disabled={state !== "ready" && state !== "recording"}
          onClick={state === "recording" ? stop : start} aria-label={state === "recording" ? r.stop : r.start}><span /></button>
        <button className="rec-side" disabled={state === "recording"} onClick={() => { setState("starting"); setFacing(facing === "environment" ? "user" : "environment"); }} aria-label={r.flip}><Icon name="flip" size={26} /></button>
      </div>
      <p className="rec-hint">{state === "recording" ? r.recordingHint : r.readyHint}</p>
    </div>,
    document.body,
  );
}
