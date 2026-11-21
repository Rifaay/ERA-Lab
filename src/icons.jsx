// One icon system: 24 px grid, 1.5 px line, never filled (the brand's rule).
// Drawings from Tabler Icons (MIT, github.com/tabler/tabler-icons) and, for archery, Iconoir (MIT, github.com/iconoir-icons/iconoir),
// fetched through Iconify. Their own line weight and colour are stripped so every icon takes ERA Lab's 1.5 px line and the text colour.
// To add one: https://api.iconify.design/<set>.json?icons=<name>, copy "body", remove its fill/stroke attributes.
const PATHS = {
  home: "<path d=\"M5 12H3l9-9l9 9h-2M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7\"/><path d=\"M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6\"/>", // tabler:home
  target: "<path d=\"M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0\"/><path d=\"M12 7a5 5 0 1 0 5 5\"/><path d=\"M13 3.055A9 9 0 1 0 20.941 11\"/><path d=\"M15 6v3h3l3-3h-3V3zm0 3l-3 3\"/>", // tabler:target-arrow
  archer: "<path d=\"M8 12h9m-9 0l-2-2H2l2 2l-2 2h4zm9 0l-2-2m2 2l-2 2m1 8.5c2.761 0 5-4.701 5-10.5S18.761 1.5 16 1.5S11 6.201 11 12s2.239 10.5 5 10.5\"/>", // iconoir:archery
  assess: "<path d=\"M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2\"/><path d=\"M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2m0 9l2 2l4-4\"/>", // tabler:clipboard-check
  clip: "<path d=\"m15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14zM3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>", // tabler:video
  calendar: "<path d=\"M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm12-4v4M8 3v4m-4 4h16\"/><path d=\"M8 15h2v2H8z\"/>", // tabler:calendar-event
  chart: "<path d=\"M3 13a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm12-4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM4 20h14\"/>", // tabler:chart-bar
  settings: "<path d=\"M12 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 6h8m4 0h4M6 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0m-2 0h2m4 0h10m-5 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 18h11m4 0h1\"/>", // tabler:adjustments-horizontal
  search: "<path d=\"M3 10a7 7 0 1 0 14 0a7 7 0 1 0-14 0m18 11l-6-6\"/>", // tabler:search
  plus: "<path d=\"M12 5v14m-7-7h14\"/>", // tabler:plus
  import: "<path d=\"M14 3v4a1 1 0 0 0 1 1h4\"/><path d=\"M5 13V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2h-5.5M2 19h7m-3-3l3 3l-3 3\"/>", // tabler:file-import
  x: "<path d=\"M18 6L6 18M6 6l12 12\"/>", // tabler:x
  flip: "<path d=\"M5 7h1a2 2 0 0 0 2-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2\"/><path d=\"M11.245 15.904A3 3 0 0 0 15 13m-2.25-2.905A3 3 0 0 0 9 13\"/><path d=\"M14 13h2v2m-6-2H8v-2\"/>", // tabler:camera-rotate
  check: "<path d=\"m5 12l5 5L20 7\"/>", // tabler:check
  down: "<path d=\"m6 9l6 6l6-6\"/>", // tabler:chevron-down
  next: "<path d=\"m9 6l6 6l-6 6\"/>", // tabler:chevron-right
  prev: "<path d=\"m15 6l-6 6l6 6\"/>", // tabler:chevron-left
  up: "<path d=\"M12 5v14m6-8l-6-6m-6 6l6-6\"/>", // tabler:arrow-up
  fall: "<path d=\"M12 5v14m6-6l-6 6m-6-6l6 6\"/>", // tabler:arrow-down
  flat: "<path d=\"M5 12h14m-6 6l6-6m-6-6l6 6\"/>", // tabler:arrow-right
  download: "<path d=\"M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5l5-5m-5-7v12\"/>", // tabler:download
  eye: "<path d=\"M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0\"/><path d=\"M21 12q-3.6 6-9 6t-9-6q3.6-6 9-6t9 6\"/>", // tabler:eye
  moon: "<path d=\"M12 3h.393a7.5 7.5 0 0 0 7.92 12.446A9 9 0 1 1 12 2.992z\"/>", // tabler:moon
};

export default function Icon({ name, size = 20, label }) {
  return (
    <svg className={`icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: PATHS[name] || "" }} />
  );
}
