import Labeller from "../review/Labeller";
import { getUi } from "../ui";

// Video tab → a clip → its analysis. The clip chosen in Clips is remembered, so a reload reopens it.
export default function Review({ selectedId, tr, onBack }) {
  const id = getUi().labClip || "";
  return <Labeller key={id} clipId={id} tr={tr} selectedId={selectedId} onBack={onBack} />;
}
