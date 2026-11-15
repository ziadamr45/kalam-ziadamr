import test from "node:test";
import assert from "node:assert/strict";
import { fixNunation } from "../src/lib/nunation";

test("fixNunation moves tanween fatha before alef", () => {
  assert.equal(
    fixNunation("عالماً وشكراً ومرحباً"),
    "عالمًا وشكرًا ومرحبًا",
  );
});

test("fixNunation keeps already-correct nunation untouched", () => {
  assert.equal(fixNunation("فعلًا هذا صحيح"), "فعلًا هذا صحيح");
});

test("fixNunation handles empty strings safely", () => {
  assert.equal(fixNunation(""), "");
});
