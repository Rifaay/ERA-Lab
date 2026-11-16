import { useEffect, useRef, useState } from "react";

// A small "?" in a section's corner. Tapping it shows what the section is and why it is there.
export default function Help({ text }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className="help" ref={box}>
      <button type="button" className="help-btn" aria-expanded={open} aria-label={text.title} onClick={() => setOpen(!open)}>?</button>
      {open && <span className="help-pop" role="note"><b>{text.title}</b>{text.body}</span>}
    </span>
  );
}
