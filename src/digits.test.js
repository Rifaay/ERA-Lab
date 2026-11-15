import test from "node:test";
import assert from "node:assert/strict";
import { toArabic, toLatin } from "./digits.js";

test("Arabic digits for what is read; exact text for what is copied", () => {
  assert.equal(toArabic("129 / 180 · 7.17"), "١٢٩ / ١٨٠ · ٧.١٧");
  assert.equal(toArabic("coach1@club.example"), "coach1@club.example");
  assert.equal(toArabic("2026-11-15_101500_Sam_phone.mp4"), "2026-11-15_101500_Sam_phone.mp4");
  assert.equal(toLatin("١٢٩ / ١٨٠"), "129 / 180");
});
