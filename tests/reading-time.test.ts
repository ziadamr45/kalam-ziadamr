import test from "node:test";
import assert from "node:assert/strict";
import {
  countArabicWords,
  readingSeconds,
  formatReadingTime,
  readingTimeLabel,
} from "../src/lib/readingTime";

test("countArabicWords strips diacritics and counts words", () => {
  assert.equal(countArabicWords("كَلَامٌ لَهُ لَازِمَةٌ"), 3);
  assert.equal(countArabicWords(""), 0);
});

test("readingSeconds enforces 30s floor and adds quote/heading pauses", () => {
  assert.equal(readingSeconds("كلمة"), 30);
  const body = Array(190).fill("كلمة").join(" ");
  const withExtras = `## عنوان\n\n> اقتباس\n\n${body}`;
  assert.ok(readingSeconds(withExtras) >= 67);
});

test("formatReadingTime formats Arabic singular, dual, and plural", () => {
  assert.equal(formatReadingTime(60), "دقيقة واحدة مركزة");
  assert.equal(formatReadingTime(120), "دقيقتان مركزتان");
  assert.equal(formatReadingTime(240), "٤ دقائق مركزة");
  assert.equal(formatReadingTime(660), "١١ دقيقة مركزة");
});

test("readingTimeLabel prefixes formatted duration", () => {
  assert.equal(
    readingTimeLabel("كلمة"),
    "مدة القراءة المتوقعة: دقيقة واحدة مركزة",
  );
});
