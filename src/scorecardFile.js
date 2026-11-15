// Turns the rendered scorecard into one standalone web file: opens offline in any browser, fits any screen,
// reacts to taps, and its Save as PDF button prints one A4 page.
import css from "./scorecard.css?raw";

// Runs inside the downloaded file. Tap an end row, a score row or an arrow on the target to pick it; tap again to clear.
const script = `(() => {
  const S = document.querySelector(".sc-sheet"), info = S.querySelector(".sc-info"), L = JSON.parse(S.dataset.labels);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const loc = (t) => (document.documentElement.lang === "ar" ? t.replace(/\\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]) : t);
  let picked = "";
  const pick = (key, match, text) => {
    picked = picked === key ? "" : key;
    S.classList.toggle("picking", !!picked);
    S.querySelectorAll(".sc-hit, .sc-ends tbody tr, .sc-ends td[data-score], .sc-dist tr").forEach((el) => el.classList.toggle("on", !!picked && match(el)));
    info.innerHTML = picked ? loc(text) : esc(L.hint);
  };
  const act = (el) => {
    if (el.matches(".sc-hit")) {
      const { end, n, score, note, feel } = el.dataset;
      pick("a" + end + "-" + n, (x) => x === el || (x.matches("tr") && x.dataset.end === end),
        "<b>" + esc(L.end) + " " + end + " · " + esc(L.arrow) + " " + n + ": " + esc(score) + "</b>" + (feel ? " · " + esc(L.feel) + " " + feel + "/5" : "") + (note ? " · " + esc(note) : ""));
    } else if (el.dataset.end) {
      const end = el.dataset.end;
      pick("e" + end, (x) => x.dataset.end === end && !x.matches("td"), "<b>" + esc(L.end) + " " + end + ": " + el.dataset.sum + "</b> · " + esc(L.running) + " " + el.dataset.run);
    } else if (el.dataset.score && +el.dataset.count) {
      const s = el.dataset.score;
      pick("s" + s, (x) => x.dataset.score === s, "<b>" + esc(s) + "</b> · " + el.dataset.count + " " + esc(L.times));
    }
  };
  S.addEventListener("click", (e) => { const el = e.target.closest(".sc-hit, .sc-ends tbody tr, .sc-dist tr"); if (el) act(el); });
  S.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[role=button]")) { e.preventDefault(); act(e.target); } });
  S.querySelector(".sc-pdf").addEventListener("click", () => window.print());
})();`;

export const scorecardFile = (sheetHtml, { lang, title }) => `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600&family=Noto+Kufi+Arabic:wght@500;700&display=swap">
<style>${css}</style>
</head>
<body>
${sheetHtml}
<script>${script}</script>
</body>
</html>`;

// Hands a finished web file to the device: the share sheet where there is one (WhatsApp, Drive), else a download.
export async function saveHtmlFile(name, html) {
  const file = new File([html], name, { type: "text/html" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(file), a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
