import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchSnippet } from "../src/lib/search-snippet";

test("search snippet shows headings and emphasis as plain text", () => {
  assert.equal(buildSearchSnippet("## عندما يتحول **الركض** إلى هروب", "عندما"), "عندما يتحول الركض إلى هروب");
});
test("search snippet keeps words from lists, tables and directives", () => {
  const content = "- عنصر أول\n- عنصر ثان\n\n:::note\nنصيحة مهمة\n:::";
  assert.equal(buildSearchSnippet(content, "نصيحة"), "عنصر أول عنصر ثان نصيحة مهمة");
});
test("absent or empty query has no snippet", () => {
  assert.equal(buildSearchSnippet("نص", ""), null);
  assert.equal(buildSearchSnippet("نص", "غائب"), null);
});
