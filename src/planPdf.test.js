import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { planPdf } from "./planPdf.js";
import { autoPlan } from "./plan.js";
import { t } from "./i18n.js";

const F = (w) => readFileSync(new URL(`../node_modules/@expo-google-fonts/noto-naskh-arabic/${w}`, import.meta.url)).toString("base64");
const fonts = { regular: F("400Regular/NotoNaskhArabic_400Regular.ttf"), bold: F("700Bold/NotoNaskhArabic_700Bold.ttf") };

test("the plan PDF has a ? note per section, week jumps, safe web links only, in English and Arabic", () => {
  const plan = autoPlan({ comps: [{ id: "c", name: "Nationals", date: "2026-09-15", priority: "A" }] }, 2026, []);
  plan.targets[34] = { ...plan.targets[34], exercises: ["e1", "e2"] };
  const exercises = [{ id: "e1", name: "SPT", videoUrl: "https://example.com/v" }, { id: "e2", name: "Bad", videoUrl: "javascript:alert(1)" }];
  for (const lang of ["en", "ar"]) {
    const opt = { comps: true, targets: true, mix: true, exercises: true, goals: true, notes: true };
    const pdf = Buffer.from(planPdf({ plan, year: 2026, first: 30, opt, pl: t[lang].planner, lang, athlete: { name: "سارة" }, goals: [], exercises, fonts })).toString("latin1");
    assert.ok(pdf.startsWith("%PDF"));
    assert.ok((pdf.match(/\/Subtype \/Text \/Name \/Help/g) || []).length >= 5, "a ? note per section");
    assert.ok(pdf.includes("https://example.com/v"));
    assert.ok(!pdf.includes("javascript:alert"));
  }
});

test("the plan PDF lists the coach's planned days, with links that open and none that are unsafe", () => {
  const plan = autoPlan({ comps: [] }, 2026, []);
  plan.days = {
    "2026-08-03": { focus: "Anchor and release", arrows: 120, exercises: ["e1"], materials: "https://example.com/drill\njavascript:alert(1)\nBring the clicker", note: "Easy day" },
    "2026-08-04": { focus: "", exercises: [] }, // empty: left out
    "2025-12-30": { focus: "Last year" },        // another year: left out
  };
  const exercises = [{ id: "e1", name: "SPT", videoUrl: "https://example.com/v" }];
  for (const lang of ["en", "ar"]) {
    const opt = { comps: true, targets: true, mix: true, exercises: true, goals: true, notes: true };
    const pdf = Buffer.from(planPdf({ plan, year: 2026, first: 1, opt, pl: t[lang].planner, lang, athlete: { name: "A" }, goals: [], exercises, fonts })).toString("latin1");
    assert.ok(pdf.includes("https://example.com/drill"), "a material link opens");
    assert.ok(pdf.includes("https://example.com/v"), "the day's exercise video opens");
    assert.ok(!pdf.includes("javascript:alert"));
  }
});
