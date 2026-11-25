import { useRef, useState } from "react";
import Icon from "./icons";

const OPEN = 88; // px: the Delete button behind the row

// A row that deletes by swiping it towards the start of the line: to the left in English, to the right in Arabic.
// A short swipe holds it open on a red Delete button; a long one (past 60% of the row) deletes straight away.
// onDelete may ask first and return false to keep the row. Up-and-down still scrolls the page.
export default function SwipeRow({ onDelete, label, className = "", children }) {
  const box = useRef(null), row = useRef(null), g = useRef(null);
  const [open, setOpen] = useState(false);
  const sign = () => (getComputedStyle(box.current).direction === "rtl" ? 1 : -1); // which way "towards the start" is
  const place = (px, animate) => {
    row.current.style.transition = animate ? "transform var(--t-s, 280ms) var(--ease-out, ease-out)" : "none";
    row.current.style.transform = px ? `translateX(${px}px)` : "";
    if (px) box.current.classList.add("on"); // the red shows only while the row is moved, never as a hairline under it
    else setTimeout(() => { if (box.current && !row.current.style.transform) box.current.classList.remove("on"); }, animate ? 300 : 0);
  };
  const del = async () => {
    const w = box.current.offsetWidth * sign();
    place(w, true);
    const gone = await onDelete();
    if (gone === false) { place(0, true); setOpen(false); }
  };
  const down = (e) => { if (e.button > 0) return; g.current = { x: e.clientX, y: e.clientY, from: open ? OPEN * sign() : 0, axis: null, px: 0 }; };
  const move = (e) => {
    const d = g.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.axis === "x") try { box.current.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer knows */ }
    }
    if (d.axis !== "x") return;
    const s = sign(), px = d.from + dx;
    d.px = s < 0 ? Math.min(0, px) : Math.max(0, px); // only towards the start
    place(d.px, false);
  };
  const up = () => {
    const d = g.current;
    g.current = null;
    if (!d || d.axis !== "x") return;
    const far = Math.abs(d.px), w = box.current.offsetWidth;
    if (far > w * 0.6) { del(); return; }
    const keep = far > OPEN / 2;
    setOpen(keep); place(keep ? OPEN * sign() : 0, true);
    box.current.dataset.swiped = "1"; // the click that ends a swipe doesn't open the row
    setTimeout(() => { if (box.current) delete box.current.dataset.swiped; }, 0);
  };
  const click = (e) => {
    if (e.target.closest(".swipe-del")) return;
    if (box.current.dataset.swiped || open) { e.stopPropagation(); e.preventDefault(); if (open && !box.current.dataset.swiped) { setOpen(false); place(0, true); } }
  };
  return (
    <div className={`swipe ${className}`} ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClickCapture={click}>
      <button type="button" className="swipe-del" onClick={del} tabIndex={open ? 0 : -1} aria-hidden={!open}><Icon name="x" size={18} />{label}</button>
      <div className="swipe-row" ref={row}>{children}</div>
    </div>
  );
}
