import test from "node:test";
import assert from "node:assert/strict";
import { cn, slugify, stripDiacritics, wordCount } from "../src/lib/utils";

test("cn joins truthy class names", () => {
  assert.equal(cn("a", false, null, undefined, "b"), "a b");
});

test("slugify normalizes Arabic and Latin titles", () => {
  assert.equal(slugify("  كلام له لازمة!  "), "كلام-له-لازمة");
  assert.equal(slugify("Hello_World 2026"), "hello-world-2026");
});

test("stripDiacritics and wordCount handle tashkeel accurately", () => {
  assert.equal(stripDiacritics("مُحَمَّدٌ"), "محمد");
  assert.equal(wordCount("كَلَامٌ لَهُ لَازِمَةٌ"), 3);
  assert.equal(wordCount(""), 0);
});
