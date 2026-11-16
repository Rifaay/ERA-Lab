// The season plan as one standalone web file for the archer: opens offline on any phone or computer, each week opens
// on a tap, exercise links open their videos, and Save as PDF prints every week open on A4 (links stay clickable in
// the PDF). Built from text, every value escaped: names, notes and links are the coach's typing.
import { PHASES, COLORS, MIX, compsIn, weekStart } from "./plan.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || "").trim()) ? String(u).trim() : "");
const digits = (lang) => (t) => (lang === "ar" ? String(t).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]).replace(/%/g, "٪") : String(t));

const css = `
:root{--ink:#111;--muted:#666;--line:#ddd;--bg:#fff;--yellow:#f2c40c}
*{box-sizing:border-box}body{margin:0;background:#f3f3f3;color:var(--ink);font:15px/1.5 Inter,"Noto Kufi Arabic",system-ui,sans-serif}
main{max-width:820px;margin:0 auto;padding:16px;background:var(--bg);min-height:100vh}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:3px solid var(--ink);padding-bottom:10px;margin-bottom:14px}
h1{font:800 28px/1.1 "Barlow Condensed",system-ui,sans-serif;text-transform:uppercase;margin:0}h2{font:800 19px "Barlow Condensed",system-ui,sans-serif;text-transform:uppercase;margin:22px 0 8px;border-top:2px solid var(--ink);padding-top:8px}
.muted{color:var(--muted);font-size:13px}.pdf{border:0;background:var(--ink);color:var(--yellow);font:700 14px system-ui;padding:10px 16px;border-radius:8px;cursor:pointer}
.strip{display:grid;grid-template-columns:repeat(26,1fr);gap:2px;margin:8px 0}.strip i{height:22px;border-radius:2px;background:#eee;position:relative}.strip i b{position:absolute;inset:0;display:grid;place-items:center;font:700 10px system-ui;color:#000}
.legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px}.legend span{display:inline-flex;gap:4px;align-items:center}.legend i{width:12px;height:12px;border-radius:2px;display:inline-block}
.comp{display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)}.prio{font:800 12px system-ui;min-width:24px;height:24px;display:grid;place-items:center;border-radius:50%;background:var(--ink);color:var(--yellow)}
details{border:1px solid var(--line);border-inline-start:6px solid var(--c,#ccc);border-radius:8px;margin:6px 0;padding:0 12px;break-inside:avoid}
summary{cursor:pointer;padding:10px 0;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;list-style:none}summary::-webkit-details-marker{display:none}
summary b{font:800 16px "Barlow Condensed",system-ui,sans-serif;text-transform:uppercase}summary .arrows{margin-inline-start:auto;font-weight:700}
.mix{display:flex;height:10px;border-radius:5px;overflow:hidden;margin:4px 0 8px}.mix i{display:block}
.row{display:flex;gap:16px;flex-wrap:wrap;font-size:14px;margin-bottom:6px}ul{margin:4px 0 10px;padding-inline-start:20px}a{color:#0b57d0;font-weight:600}
.note{background:#fffbea;border-radius:6px;padding:6px 10px;margin:6px 0 10px}.now{outline:3px solid var(--yellow)}
@media print{body{background:#fff}main{padding:0;max-width:none}.pdf{display:none}details{border-color:#bbb}@page{size:A4;margin:12mm}}
`;
const MIXC = { tech: "#3498db", dist: "#9b59b6", score: "#f39c12", sim: "#e74c3c" };

export function planFile({ plan, year, first = 1, opt, pl, lang, athlete, goals, exercises, shot, ramadan }) {
  const n = digits(lang), byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const G = byId(goals), X = byId(exercises), comps = compsIn(plan.comps, year).sort((a, b) => a.week - b.week);
  const date = (iso, o = { day: "numeric", month: "short" }) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", o); };
  const weeks = Array.from({ length: 52 }, (_, i) => i + 1).filter((w) => w >= first && (plan.weeks?.[w] || plan.targets?.[w]?.arrows || comps.some((c) => c.week === w)));

  const strip = `<div class="strip" dir="ltr">${Array.from({ length: 52 }, (_, i) => {
    const w = i + 1, k = plan.weeks?.[w], c = comps.find((x) => x.week === w);
    return `<i style="background:${k ? COLORS[k] : "#eee"}" title="${esc(pl.wk + w)}">${c ? `<b>${esc(c.priority)}</b>` : ""}</i>`;
  }).join("")}</div>`;
  const legend = `<div class="legend">${PHASES.filter((k) => Object.values(plan.weeks || {}).includes(k)).map((k) => `<span><i style="background:${COLORS[k]}"></i>${esc(pl.phases[k])}</span>`).join("")}</div>`;

  const week = (w) => {
    const k = plan.weeks?.[w], t = plan.targets?.[w] || {}, cs = comps.filter((c) => c.week === w);
    const mixTotal = MIX.reduce((s, m) => s + (+t.mix?.[m] || 0), 0) || 1;
    const ex = (t.exercises || []).map((id) => X[id]).filter(Boolean), gs = (t.goals || []).map((id) => G[id]).filter(Boolean);
    const body = [
      cs.map((c) => `<p><span class="prio">${esc(c.priority)}</span> <b>${esc(c.name)}</b> · ${esc(n(date(c.date, { day: "numeric", month: "long" })))}</p>`).join(""),
      opt.targets ? `<div class="row">${t.physical ? `<span>${esc(pl.physical)}: <b>${esc(n(t.physical))}</b></span>` : ""}${t.mental ? `<span>${esc(pl.mental)}: <b>${esc(n(t.mental))}</b></span>` : ""}${t.drawWeight ? `<span>${esc(pl.drawWeight)}: <b>${esc(n(t.drawWeight))}</b></span>` : ""}${opt.shot && shot[w] ? `<span>${esc(pl.shot)}: <b>${esc(n(shot[w]))}</b></span>` : ""}${ramadan.includes(w) ? `<span>☾ ${esc(pl.ramadan)}</span>` : ""}</div>` : "",
      opt.mix && t.mix ? `<div class="mix" dir="ltr">${MIX.map((m) => `<i style="width:${(+t.mix[m] || 0) / mixTotal * 100}%;background:${MIXC[m]}"></i>`).join("")}</div><div class="row muted">${MIX.filter((m) => +t.mix[m]).map((m) => `<span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${MIXC[m]}"></i> ${esc(pl.mixKinds[m])} ${esc(n(t.mix[m] + "%"))}</span>`).join("")}</div>` : "",
      opt.exercises && ex.length ? `<b>${esc(pl.exercises)}</b><ul>${ex.map((x) => { const u = safeUrl(x.videoUrl), d = [x.sets && `${x.sets}×${x.reps || ""}`, x.frequency].filter(Boolean).join(" · "); return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(x.name)} ↗</a>` : esc(x.name)}${d ? ` <span class="muted">${esc(n(d))}</span>` : ""}${x.notes ? `<br><span class="muted">${esc(x.notes)}</span>` : ""}</li>`; }).join("")}</ul>` : "",
      opt.goals && gs.length ? `<b>${esc(pl.goals)}</b><ul>${gs.map((g) => `<li>${esc(g.name)}${g.target ? ` — ${esc(n(g.target))}` : ""}${g.dueDate ? ` <span class="muted">(${esc(n(date(g.dueDate)))})</span>` : ""}</li>`).join("")}</ul>` : "",
      opt.notes && t.note ? `<p class="note">${esc(t.note)}</p>` : "",
    ].join("");
    return `<details style="--c:${k ? COLORS[k] : "#ccc"}"${w === first ? " open" : ""}><summary><b>${esc(pl.wk)}${esc(n(w))}</b><span>${esc(n(date(weekStart(year, w))))}</span><span>${k ? esc(pl.phases[k]) : ""}</span>${cs.length ? `<span class="prio">${esc(cs[0].priority)}</span>` : ""}${opt.targets && t.arrows ? `<span class="arrows">${esc(n(t.arrows))} ${esc(pl.arrowsShort)}</span>` : ""}</summary>${body || `<p class="muted">—</p>`}</details>`;
  };

  const allGoals = opt.goals && goals.length ? `<h2>${esc(pl.goals)}</h2><ul>${goals.map((g) => `<li><b>${esc(g.name)}</b>${g.specific ? ` — ${esc(g.specific)}` : ""}${g.dueDate ? ` <span class="muted">(${esc(n(date(g.dueDate, { day: "numeric", month: "long", year: "numeric" })))})</span>` : ""}</li>`).join("")}</ul>` : "";
  const allEx = opt.exercises && exercises.length ? `<h2>${esc(pl.exercises)}</h2><ul>${exercises.map((x) => { const u = safeUrl(x.videoUrl); return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(x.name)} ↗</a>` : `<b>${esc(x.name)}</b>`}${x.notes ? ` — ${esc(x.notes)}` : ""}</li>`; }).join("")}</ul>` : "";

  return `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pl.fileName)} — ${esc(athlete.name)} ${esc(year)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Inter:wght@400;600;700&family=Noto+Kufi+Arabic:wght@400;700&display=swap">
<style>${css}</style></head><body><main>
<header><div><h1>${esc(athlete.name)}</h1><div class="muted">${esc(pl.fileName)} ${esc(n(year))} · ERA Lab</div></div><button class="pdf" type="button">${esc(pl.savePdf)}</button></header>
${strip}${legend}
${opt.comps && comps.length ? `<h2>${esc(pl.comps)}</h2>${comps.map((c) => `<div class="comp"><span class="prio">${esc(c.priority)}</span><span><b>${esc(c.name)}</b><br><span class="muted">${esc(n(date(c.date, { weekday: "short", day: "numeric", month: "long" })))} · ${esc(pl.prio[c.priority])}</span></span></div>`).join("")}` : ""}
<h2>${esc(pl.weeksTitle)}</h2><p class="muted">${esc(pl.tapWeek)}</p>
${weeks.map(week).join("") || `<p class="muted">—</p>`}
${allGoals}${allEx}
</main><script>(()=>{const all=()=>document.querySelectorAll("details").forEach(d=>d.open=true);addEventListener("beforeprint",all);document.querySelector(".pdf").onclick=()=>{all();print()};})();</script>
</body></html>`;
}
