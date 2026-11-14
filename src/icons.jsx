// One icon system: 24 px grid, 1.5 px stroke, never filled (the brand's rule).
// The archery icons come from the brand design system; the rest are drawn to match.
const PATHS = {
  // brand archery set
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="3" /></>,
  bow: <><path d="M5 5 Q12 10 5 19" /><path d="M5 5v14" /><path d="M5 12h14" /><path d="M16 9l3 3-3 3" /></>,
  archer: <><circle cx="12" cy="4.5" r="1.6" /><path d="M12 6.5 10 10l-2 4" /><path d="M12 8q3 1 5-1" /><path d="M17 7v7" /><path d="M10 10v6l-2 5" /><path d="M10 16l3 5" /></>,
  shield: <><path d="M12 2l8 4v7q0 6-8 9-8-3-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  medal: <><circle cx="12" cy="15" r="6" /><path d="M8.5 5 12 9l3.5-4" /><path d="M8.5 5 6 2" /><path d="M15.5 5 18 2" /></>,
  // interface
  clip: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5v5l4.5-2.5z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4" /><path d="M12 16V8" /><path d="M16 16v-6" /></>,
  file: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6" /><path d="M10 17h6" /></>,
  settings: <><path d="M4 6h8" /><path d="M16 6h4" /><circle cx="14" cy="6" r="2" /><path d="M4 12h2" /><path d="M10 12h10" /><circle cx="8" cy="12" r="2" /><path d="M4 18h10" /><path d="M18 18h2" /><circle cx="16" cy="18" r="2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  x: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  check: <path d="M5 12l5 5 9-10" />,
  down: <path d="M6 9l6 6 6-6" />,
  next: <path d="M9 6l6 6-6 6" />, // mirrored in right-to-left layouts by CSS
  prev: <path d="M15 6l-6 6 6 6" />,
  up: <><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></>,
  fall: <><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></>,
  flat: <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
  download: <><path d="M12 4v12" /><path d="M7 11l5 5 5-5" /><path d="M5 20h14" /></>,
  moon: <path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" />,
};

export default function Icon({ name, size = 20, label }) {
  return (
    <svg className={`icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {PATHS[name]}
    </svg>
  );
}
