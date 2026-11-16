import test from "node:test";
import assert from "node:assert/strict";
import { planFile } from "./planFile.js";
import { t } from "./i18n.js";

test("the plan file escapes the coach's text and only links real web addresses", () => {
  const pl = t.en.planner;
  const html = planFile({
    plan: { weeks: { 1: "gpp" }, targets: { 1: { arrows: 900, mix: { tech: 60, dist: 30, score: 10, sim: 0 }, exercises: ["e1", "e2"], goals: ["g1"], note: "<script>x</script>" } }, comps: [] },
    year: 2027, first: 1, opt: { targets: true, mix: true, exercises: true, goals: true, notes: true, comps: true }, pl, lang: "en",
    athlete: { name: "Sam <b>" }, goals: [{ id: "g1", name: "Hold 2 s" }],
    exercises: [{ id: "e1", name: "Clicker drill", videoUrl: "https://example.com/v?a=1" }, { id: "e2", name: "Bad link", videoUrl: "javascript:alert(1)" }],
    shot: {}, ramadan: [],
  });
  assert.ok(html.includes('href="https://example.com/v?a=1"'));
  assert.ok(!html.includes("javascript:alert"));
  assert.ok(!html.includes("<script>x</script>") && !html.includes("Sam <b>"));
  assert.ok(html.includes("900"));
});
