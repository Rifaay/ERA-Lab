import { ringOf } from "./insights";

// An end's arrow values as square cells in target colours on a black bar.
// Yellow may only sit on black (the brand's rule), so the bar is part of the mark, not decoration.
export default function EndStrip({ scores }) {
  return (
    <span className="endstrip" dir="ltr">
      {scores.map((s, i) => <span key={i} className={`cell ${s == null ? "ring-none" : `ring-${ringOf(s)}`}`}>{s ?? "·"}</span>)}
    </span>
  );
}
