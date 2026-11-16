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
