// In Arabic the app shows Arabic-Indic digits (١٢٣) everywhere: scores, counts, times, the labeller, exported sheets.
// Done in one place, on the text the page shows, so no screen has to format its own numbers.
// Left alone: anything typed (inputs), codes and keys the reader must copy exactly, emails, links and file names.
const AR = "٠١٢٣٤٥٦٧٨٩";
const SKIP = "input, textarea, code, script, style, .invite-code, .code-input, .acct-qr, [data-latin]";
const exact = (t) => /@|https?:|\.(mp4|mov|webm|json|html|csv)\b/i.test(t);
export const toArabic = (t) => (exact(t) ? t : t.replace(/\d/g, (d) => AR[d]));
export const toLatin = (t) => t.replace(/[٠-٩]/g, (d) => AR.indexOf(d));

const fix = (node, lang) => {
  if (node.parentElement?.closest(SKIP)) return;
  const v = node.nodeValue, n = lang === "ar" ? toArabic(v) : toLatin(v);
  if (n !== v) node.nodeValue = n;
};
// Every text node under `root`. Also used on a sheet built off-screen, before it is saved as a file.
export const localize = (root, lang) => {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) fix(n, lang);
};

// Keeps the page in step while `lang` is Arabic. Returns the function that stops it.
export const watchDigits = (lang) => {
  localize(document.body, lang); // switching back to English turns the digits back once
  if (lang !== "ar") return () => {};
  const seen = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") fix(m.target, lang);
      else for (const n of m.addedNodes) { if (n.nodeType === 3) fix(n, lang); else if (n.nodeType === 1) localize(n, lang); }
    }
  });
  seen.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => seen.disconnect();
};
