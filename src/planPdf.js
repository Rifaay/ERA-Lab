// The season plan as an interactive PDF for the archer (A4). Interactive in the ways PDF apps support:
// - a "?" on every section opens a short note on what it is and why it is there (and the last page repeats them all,
//   for PDF apps that don't open notes);
// - tapping a week in the season strip jumps to that week; each page has a way back to the season;
// - exercise names open their video links; bookmarks list the sections.
// Text is drawn with Noto Naskh Arabic (Arabic and Latin letters), so Arabic plans and Arabic names print correctly.
import { jsPDF } from "jspdf";
import { PHASES, COLORS, MIX, compsIn, weekStart, dayFilled } from "./plan.js";
import { planWeek } from "./stats.js";

const W = 595.28, H = 841.89, M = 36; // A4 in points, margin
const MIXC = { tech: "#3498db", dist: "#9b59b6", score: "#f39c12", sim: "#e74c3c" };
const INK = "#111111", MUTED = "#666666", LINE = "#dddddd", YELLOW = "#f2c40c", LINK = "#0b57d0";
const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || "").trim()) ? String(u).trim() : "");
// PDF strings in UTF-16 (hex), so a note can hold Arabic.
const hex = (s) => "<FEFF" + [...String(s)].map((c) => { const p = c.codePointAt(0); return p > 0xffff ? "fffd" : p.toString(16).padStart(4, "0"); }).join("") + ">";
const rgb = (h) => [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
const tint = (h, a) => "#" + [1, 3, 5].map((i) => Math.round(255 - (255 - parseInt(h.slice(i, i + 2), 16)) * a).toString(16).padStart(2, "0")).join("");

// fonts: { regular, bold } as base64 TTF. Returns the PDF as an ArrayBuffer.
export function planPdf({ plan, year, first = 1, opt, pl, lang, athlete, goals, exercises, shot = {}, ramadan = [], fonts, coach = "" }) {
  // Arabic digits; the percent sign goes before the number in the string so it prints after it (the library's bidi)
  const ar = lang === "ar", n = (t) => (ar ? String(t).replace(/(\d+(?:\.\d+)?)%/g, "%$1").replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]).replace(/%/g, "٪") : String(t));
  const sep = ar ? "  |  " : "  ·  "; // in Arabic a middle dot looks like the digit zero
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.addFileToVFS("N-R.ttf", fonts.regular); doc.addFont("N-R.ttf", "Naskh", "normal");
  doc.addFileToVFS("N-B.ttf", fonts.bold); doc.addFont("N-B.ttf", "Naskh", "bold");
  doc.setProperties({ title: `${pl.fileName} — ${athlete.name} ${year}`, author: coach || "ERA Lab", creator: "ERA Lab" });
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const G = byId(goals), X = byId(exercises), comps = compsIn(plan.comps, year).sort((a, b) => a.week - b.week);
  const date = (iso, o = { day: "numeric", month: "short" }) => { const [y, m, d] = iso.split("-").map(Number); return n(new Date(y, m - 1, d).toLocaleDateString(ar ? "ar-EG" : "en-GB", o)); };
  const weeks = Array.from({ length: 52 }, (_, i) => i + 1).filter((w) => w >= first && (plan.weeks?.[w] || plan.targets?.[w]?.arrows || comps.some((c) => c.week === w)));
  const help = pl.help;

  // ── drawing helpers (x measured from the reading start: left in English, right in Arabic) ──
  const X0 = (x, w = 0) => (ar ? W - x - w : x);
  const font = (size, bold = false, color = INK) => { doc.setFont("Naskh", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color); };
  // The library puts Arabic in right-to-left order but doesn't mirror brackets, so they are swapped beforehand.
  const bidi = (s) => (ar && /[؀-ۿ]/.test(s) ? s.replace(/[()]/g, (c) => (c === "(" ? ")" : "(")) : s);
  const text = (s, x, y, o = {}) => doc.text(bidi(String(s)), X0(x), y, { align: ar ? "right" : "left", ...o });
  // a small "opens a link" arrow, drawn (the font has no ↗)
  const outArrow = (x, yy) => { doc.setDrawColor(LINK); doc.setLineWidth(0.9); doc.line(x, yy, x + 5, yy - 5); doc.line(x + 1.5, yy - 5, x + 5, yy - 5); doc.line(x + 5, yy - 5, x + 5, yy - 1.5); };
  const wrap = (s, width) => doc.splitTextToSize(String(s), width);
  const notes = []; // "?" notes, written into the file as it is built (see the buildDocument hook below)
  const linksTo = []; // links to week pages, added once every page exists
  let y = M, page = 1;
  const newPage = () => { doc.addPage(); page++; y = M; backLink(); };
  const room = (h) => { if (y + h > H - M - 14) newPage(); };

  // "?" in a section's corner: a drawn circle (always visible) under a PDF note that opens on tap.
  const ask = (key, x, yy) => {
    const cx = X0(x, 16) + 8, cy = yy;
    doc.setFillColor(INK); doc.circle(cx, cy, 8, "F");
    font(10, true, YELLOW); doc.text("?", cx, cy + 3.5, { align: "center" });
    notes.push({ page, x: cx - 9, y: cy - 9, title: help[key].title, body: help[key].body });
  };
  const section = (title, key, gap = 18) => {
    room(60); y += gap;
    doc.setDrawColor(INK); doc.setLineWidth(1.6); doc.line(M, y, W - M, y);
    y += 18; font(14, true); text(title.toUpperCase(), M, y);
    ask(key, W - M - 16, y - 5);
    y += 12;
  };
  const backLink = () => {
    if (page === 1) return;
    font(8.5, false, LINK);
    const label = `‹ ${pl.backToSeason}`, w = doc.getTextWidth(label);
    text(label, M, H - 18);
    doc.link(X0(M, w), H - 28, w, 14, { pageNumber: 1 });
    font(8.5, false, MUTED); text(`${athlete.name}${sep}${n(year)}`, W - M - doc.getTextWidth(`${athlete.name}${sep}${n(year)}`), H - 18);
  };

  // Small icons drawn with shapes, so they print the same in every PDF app.
  const icon = {
    target: (x, yy) => { [7, 5, 3, 1.4].forEach((r, i) => { doc.setFillColor(["#2e7fd8", "#e2483d", YELLOW, "#000"][i]); doc.circle(x, yy, r, "F"); }); },
    dumbbell: (x, yy) => { doc.setFillColor(INK); doc.rect(x - 7, yy - 4, 3, 8, "F"); doc.rect(x + 4, yy - 4, 3, 8, "F"); doc.rect(x - 4, yy - 1, 8, 2, "F"); },
    mind: (x, yy) => { doc.setDrawColor("#8e44ad"); doc.setLineWidth(1.4); doc.circle(x, yy, 6, "S"); doc.setFillColor("#8e44ad"); doc.circle(x, yy, 2, "F"); },
    bow: (x, yy) => { doc.setDrawColor(INK); doc.setLineWidth(1.3); doc.lines([[4, 4], [-4, 4]], x - 2, yy - 4, [1, 1], "S"); doc.setLineWidth(0.6); doc.line(x - 2, yy - 4, x - 2, yy + 4); },
    moon: (x, yy, r = 4, bg = "#ffffff") => { doc.setFillColor(INK); doc.circle(x, yy, r, "F"); doc.setFillColor(bg); doc.circle(x + r * 0.45, yy - r * 0.25, r * 0.85, "F"); },
    flag: (x, yy, p) => { doc.setFillColor(p === "A" ? INK : p === "B" ? "#666666" : "#bbbbbb"); doc.circle(x, yy, 6.5, "F"); font(8, true, p === "A" ? YELLOW : "#ffffff"); doc.text(p, x, yy + 3, { align: "center" }); },
  };

  // ── page 1: header ──
  doc.setFillColor(INK); doc.rect(0, 0, W, 86, "F");
  doc.setFillColor(YELLOW); doc.rect(0, 86, W, 4, "F");
  font(24, true, "#ffffff"); text(athlete.name, M, 44);
  font(11, false, YELLOW); text(`${pl.fileName} ${n(year)}${coach ? sep + coach : ""}${sep}ERA Lab`, M, 66);
  y = 104;

  // ── season strip: 2 rows × 26 weeks, in time order left to right (as calendars and charts read) ──
  section(pl.glance, "glance", 0);
  const cw = (W - 2 * M) / 26, ch = 26, stripTop = y;
  for (let w = 1; w <= 52; w++) {
    const r = w <= 26 ? 0 : 1, c = (w - 1) % 26, x = M + c * cw, yy = stripTop + r * (ch + 16), k = plan.weeks?.[w];
    doc.setFillColor(k ? COLORS[k] : "#eeeeee"); doc.roundedRect(x + 1, yy, cw - 2, ch, 2, 2, "F");
    if (w >= first && weeks.includes(w)) linksTo.push({ page: 1, x: x + 1, y: yy, w: cw - 2, h: ch, week: w });
    const cp = comps.find((z) => z.week === w);
    if (cp) icon.flag(x + cw / 2, yy + ch / 2, cp.priority);
    else if (ramadan.includes(w)) icon.moon(x + cw / 2, yy + ch / 2, 4, k ? COLORS[k] : "#eeeeee");
    if (c % 4 === 0) { font(7, false, MUTED); doc.text(n(w), x + cw / 2, yy + ch + 9, { align: "center" }); }
  }
  y = stripTop + 2 * (ch + 16) + 6;
  // legend
  let lx = M; font(9);
  const used = PHASES.filter((k) => Object.values(plan.weeks || {}).includes(k));
  const legend = [...used.map((k) => ({ c: COLORS[k], t: pl.phases[k] })), ...(ramadan.length ? [{ moon: true, t: pl.ramadan }] : [])];
  for (const it of legend) {
    const tw = doc.getTextWidth(it.t) + 22;
    if (lx + tw > W - M) { lx = M; y += 14; }
    if (it.moon) icon.moon(X0(lx, 10) + 5, y - 3, 4); else { doc.setFillColor(it.c); doc.roundedRect(X0(lx, 10), y - 8, 10, 10, 2, 2, "F"); }
    font(9); text(it.t, lx + 14, y);
    lx += tw;
  }
  y += 10; font(8, false, MUTED); text(pl.tapWeekPdf, M, y += 4);

  // ── competitions ──
  if (opt.comps && comps.length) {
    section(pl.comps, "comps");
    for (const c of comps) {
      room(26);
      icon.flag(X0(M, 14) + 7, y + 4, c.priority);
      font(11, true); text(c.name, M + 22, y + 8);
      font(9, false, MUTED); text(`${date(c.date, { weekday: "short", day: "numeric", month: "long" })}${sep}${pl.prio[c.priority]}${sep}${pl.wk}${n(c.week)}`, M + 22, y + 20);
      linksTo.push({ page, x: M, y: y - 4, w: W - 2 * M, h: 28, week: c.week });
      y += 30;
    }
  }

  // ── planned arrows chart ──
  if (opt.targets) {
    section(pl.loadPlan, "loadPlan");
    const max = Math.max(100, ...Array.from({ length: 52 }, (_, i) => Math.max(+plan.targets?.[i + 1]?.arrows || 0, opt.shot ? shot[i + 1] || 0 : 0)));
    const chH = 90, top = y + 4, bw = (W - 2 * M) / 52;
    room(chH + 30);
    doc.setDrawColor(LINE); doc.setLineWidth(0.5);
    [0, 0.5, 1].forEach((f) => { const yy = top + chH - f * chH; doc.line(M, yy, W - M, yy); font(7, false, MUTED); doc.text(n(Math.round(max * f)), M - 3, yy + 2.5, { align: "right" }); });
    for (let w = 1; w <= 52; w++) {
      const a = +plan.targets?.[w]?.arrows || 0, s = opt.shot ? shot[w] || 0 : 0, x = M + (w - 1) * bw, k = plan.weeks?.[w];
      if (a) { doc.setFillColor(k ? COLORS[k] : "#999999"); doc.rect(x + 1, top + chH - (a / max) * chH, bw - 2, (a / max) * chH, "F"); }
      if (s) { doc.setFillColor(INK); doc.rect(x + bw / 2 - 1, top + chH - (s / max) * chH, 2, (s / max) * chH, "F"); }
      if ((w - 1) % 4 === 0) { font(7, false, MUTED); doc.text(n(w), x + bw / 2, top + chH + 9, { align: "center" }); }
    }
    y = top + chH + 16;
    font(8, false, MUTED); text(opt.shot ? pl.chartPdfShot : pl.chartPdf, M, y);
  }

  // An exercise as a line: its name opens its video when it has one.
  const exLine = (e, yy) => {
    const u = safeUrl(e.videoUrl), detail = [e.sets && `${e.sets}×${e.reps || ""}`, e.frequency].filter(Boolean).join(sep);
    font(9.5, !!u, u ? LINK : INK); const label = `•  ${e.name}`; text(label, M + 18, yy);
    const lw = doc.getTextWidth(label) + (u ? 12 : 0);
    if (u) { outArrow(X0(M + 18 + lw - 8, 5), yy - 1); doc.setDrawColor(LINK); doc.setLineWidth(0.5); doc.line(X0(M + 18, lw), yy + 2, X0(M + 18, lw) + lw, yy + 2); doc.link(X0(M + 18, lw), yy - 10, lw, 13, { url: u }); }
    if (detail) { font(8.5, false, MUTED); text(n(detail), M + 26 + lw, yy); }
  };

  // ── week by week ──
  const weekPage = {};
  section(pl.weeksTitle, "weeks");
  for (const w of weeks) {
    const k = plan.weeks?.[w], t = plan.targets?.[w] || {}, cs = comps.filter((c) => c.week === w);
    const ex = (t.exercises || []).map((id) => X[id]).filter(Boolean), gs = (t.goals || []).map((id) => G[id]).filter(Boolean);
    const noteLines = opt.notes && t.note ? wrap(t.note, W - 2 * M - 40) : [];
    const h = 48 + (opt.mix && t.mix ? 26 : 0) + (opt.exercises && ex.length ? 16 + ex.length * 14 : 0) + (opt.goals && gs.length ? 16 + gs.length * 14 : 0) + (noteLines.length ? 10 + noteLines.length * 13 : 0) + cs.length * 16;
    room(h + 8);
    weekPage[w] = page;
    const top = y, color = k ? COLORS[k] : "#cccccc";
    doc.setFillColor(tint(color, 0.08)); doc.setDrawColor(LINE); doc.setLineWidth(0.6); doc.roundedRect(M, top, W - 2 * M, h, 5, 5, "FD");
    doc.setFillColor(color); doc.rect(X0(M, 5), top, 5, h, "F");
    // header line
    font(13, true); text(`${pl.wk}${n(w)}`, M + 14, top + 20);
    font(10, false, MUTED); text(`${date(weekStart(year, w))}${k ? sep + pl.phases[k] : ""}`, M + 52, top + 20);
    if (ramadan.includes(w)) icon.moon(X0(M + 46, 0) + (ar ? -4 : 4), top + 16, 3.5, tint(color, 0.08));
    if (opt.targets && t.arrows) { font(13, true); const s = `${n(t.arrows)} ${pl.arrowsShort}`; text(s, W - M - 14 - doc.getTextWidth(s), top + 20); icon.target(X0(W - M - 26 - doc.getTextWidth(s), 0), top + 15); }
    let yy = top + 38;
    for (const c of cs) { icon.flag(X0(M + 14, 13) + 6.5, yy - 4, c.priority); font(10, true); text(c.name, M + 34, yy); yy += 16; }
    if (opt.targets) {
      let x = M + 14; font(9.5);
      const bits = [t.physical ? ["dumbbell", `${pl.physical}: ${n(t.physical)}`] : null, t.mental ? ["mind", `${pl.mental}: ${n(t.mental)}`] : null, t.drawWeight ? ["bow", `${pl.drawWeight}: ${n(t.drawWeight)}`] : null, opt.shot && shot[w] ? ["target", `${pl.shot}: ${n(shot[w])}`] : null].filter(Boolean);
      for (const [ic, s] of bits) { icon[ic](X0(x, 0) + (ar ? -6 : 6), yy - 3.5); font(9.5); text(s, x + 16, yy); x += doc.getTextWidth(s) + 32; }
      if (bits.length) yy += 6;
    }
    if (opt.mix && t.mix) {
      const total = MIX.reduce((s, m) => s + (+t.mix[m] || 0), 0) || 1, bwid = W - 2 * M - 28;
      let x = M + 14; yy += 6;
      for (const m of MIX) { const w2 = (+t.mix[m] || 0) / total * bwid; if (w2) { doc.setFillColor(MIXC[m]); doc.rect(X0(x, w2), yy - 6, w2, 7, "F"); x += w2; } }
      yy += 13; x = M + 14;
      for (const m of MIX.filter((q) => +t.mix[q])) { const s = `${pl.mixKinds[m]} ${n(t.mix[m] + "%")}`; doc.setFillColor(MIXC[m]); doc.rect(X0(x, 7), yy - 6, 7, 7, "F"); font(8.5, false, MUTED); text(s, x + 10, yy); x += doc.getTextWidth(s) + 22; }
      yy += 4;
    }
    if (opt.exercises && ex.length) {
      yy += 12; font(9.5, true); text(pl.exercises, M + 14, yy);
      for (const e of ex) {
        yy += 14; exLine(e, yy);
      }
    }
    if (opt.goals && gs.length) {
      yy += 16; font(9.5, true); text(pl.goals, M + 14, yy);
      for (const g of gs) { yy += 14; font(9.5); text(`•  ${g.name}${g.target ? `  —  ${n(g.target)}` : ""}${g.dueDate ? `${sep}${date(g.dueDate)}` : ""}`, M + 18, yy); }
    }
    if (noteLines.length) {
      yy += 8; doc.setFillColor("#fff6cc"); doc.roundedRect(M + 12, yy, W - 2 * M - 24, noteLines.length * 13 + 8, 3, 3, "F");
      font(9.5); noteLines.forEach((l, i) => text(l, M + 20, yy + 14 + i * 13));
    }
    y = top + h + 8;
  }

  // ── day by day: what the coach planned for single days (the calendar view) ──
  const days = Object.entries(plan.days || {})
    .filter(([iso, d]) => iso.startsWith(`${year}-`) && planWeek(iso) >= first && dayFilled(d)).sort(([a], [b]) => a.localeCompare(b));
  if (days.length) {
    section(pl.cal.daysTitle, "days");
    for (const [iso, d] of days) {
      const ex = (d.exercises || []).map((id) => X[id]).filter(Boolean);
      const mat = (d.materials || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const focusL = d.focus ? wrap(d.focus, W - 2 * M - 190) : [], noteL = d.note ? wrap(d.note, W - 2 * M - 40) : [];
      const h = 24 + Math.max(0, focusL.length - 1) * 13 + (ex.length + mat.length) * 14 + (noteL.length ? 6 + noteL.length * 13 : 0);
      room(h + 6);
      const top = y, k = plan.weeks?.[planWeek(iso)];
      doc.setFillColor(k ? COLORS[k] : "#cccccc"); doc.rect(X0(M, 3), top, 3, h, "F");
      font(10.5, true); text(date(iso, { weekday: "short", day: "numeric", month: "short" }), M + 10, top + 14);
      focusL.forEach((l, i) => text(l, M + 120, top + 14 + i * 13));
      if (d.arrows) { const s = `${n(d.arrows)} ${pl.arrowsShort}`; font(10, true); text(s, W - M - 4 - doc.getTextWidth(s), top + 14); }
      let yy = top + 14 + Math.max(0, focusL.length - 1) * 13;
      for (const e of ex) { yy += 14; exLine(e, yy); }
      for (const line of mat) { // a link opens; other lines are plain text
        yy += 14; const u = safeUrl(line), s = `›  ${wrap(line, W - 2 * M - 60)[0]}`;
        font(9.5, false, u ? LINK : INK); text(s, M + 18, yy);
        if (u) { const lw = doc.getTextWidth(s); doc.link(X0(M + 18, lw), yy - 10, lw, 13, { url: u }); }
      }
      if (noteL.length) { yy += 6; font(9.5, false, MUTED); noteL.forEach((l) => { yy += 13; text(l, M + 18, yy); }); }
      y = top + h + 6;
    }
  }

  // ── goals and exercises, all of them ──
  if (opt.goals && goals.length) {
    section(pl.goals, "goals");
    for (const g of goals) {
      const lines = wrap(`${g.name}${g.specific ? ` — ${g.specific}` : ""}`, W - 2 * M - 30);
      room(lines.length * 13 + 12);
      doc.setFillColor(YELLOW); doc.circle(X0(M + 4, 0) + (ar ? -4 : 4), y + 4, 3, "F");
      font(10, true); lines.forEach((l, i) => text(l, M + 14, y + 8 + i * 13));
      y += lines.length * 13 + (g.dueDate ? 0 : 6);
      if (g.dueDate) { font(8.5, false, MUTED); text(`${pl.due}: ${date(g.dueDate, { day: "numeric", month: "long", year: "numeric" })}`, M + 14, y + 6); y += 18; }
    }
  }
  if (opt.exercises && exercises.length) {
    section(pl.exercises, "exercises");
    for (const e of exercises) {
      room(30);
      const u = safeUrl(e.videoUrl); font(10, true, u ? LINK : INK);
      text(e.name, M + 4, y + 8);
      if (u) { const lw = doc.getTextWidth(e.name) + 12; outArrow(X0(M + 4 + lw - 8, 5), y + 7); doc.link(X0(M + 4, lw), y - 3, lw, 14, { url: u }); }
      y += 14;
      const d = [e.sets && `${e.sets}×${e.reps || ""}`, e.frequency, e.notes].filter(Boolean).join(sep);
      if (d) { const lines = wrap(n(d), W - 2 * M - 10); font(8.5, false, MUTED); lines.forEach((l, i) => text(l, M + 4, y + 6 + i * 11)); y += lines.length * 11 + 4; }
      y += 6;
    }
  }

  // ── every explainer on one page, for PDF apps that don't open the "?" notes ──
  newPage();
  section(pl.aboutTitle, "about", 0);
  for (const key of ["glance", "comps", "loadPlan", "weeks", "days", "goals", "exercises"]) {
    const lines = wrap(help[key].body, W - 2 * M - 20);
    room(lines.length * 13 + 26);
    font(11, true); text(help[key].title, M, y += 14);
    font(9.5, false, "#333333"); lines.forEach((l) => text(l, M, y += 13));
    y += 8;
  }

  // links to week pages, now that every page exists
  for (const L of linksTo) if (weekPage[L.week]) { doc.setPage(L.page); doc.link(L.x, L.y, L.w, L.h, { pageNumber: weekPage[L.week] }); }
  // bookmarks
  if (doc.outline) {
    doc.outline.add(null, pl.glance, { pageNumber: 1 });
    const months = {};
    for (const w of weeks) { const mo = date(weekStart(year, w), { month: "long" }); months[mo] ||= weekPage[w]; }
    const wk = doc.outline.add(null, pl.weeksTitle, { pageNumber: weekPage[weeks[0]] || 1 });
    for (const [mo, p] of Object.entries(months)) doc.outline.add(wk, mo, { pageNumber: p });
    doc.outline.add(null, pl.aboutTitle, { pageNumber: page });
  }
  // the "?" notes: created as the file is written (the library starts each write from a clean slate)
  doc.internal.events.subscribe("buildDocument", () => {
    for (const z of notes) {
      const list = doc.internal.getPageInfo(z.page).pageContext.annotations;
      for (let i = list.length - 1; i >= 0; i--) if (list[i].eraNote) list.splice(i, 1);
    }
    for (const z of notes) {
      const obj = doc.internal.newAdditionalObject();
      obj.content = `<</Type /Annot /Subtype /Text /Name /Help /F 4 /Open false /Rect [${z.x.toFixed(1)} ${(H - z.y - 18).toFixed(1)} ${(z.x + 18).toFixed(1)} ${(H - z.y).toFixed(1)}] /C [${rgb(YELLOW)}] /T ${hex(z.title)} /Contents ${hex(z.body)}>>`;
      doc.internal.getPageInfo(z.page).pageContext.annotations.push({ type: "reference", object: obj, eraNote: true });
    }
  });
  doc.setPage(page);
  return doc.output("arraybuffer");
}
