import test from "node:test";
import assert from "node:assert/strict";
import {
  followTargetDirection,
  followReturnLabel,
  followReturnAriaLabel,
  withinComfortBand,
  gentleFollowScrollTop,
  isWordOutOfUsableArea,
} from "../src/lib/follow-target";

test("narration above the viewport points up", () => {
  assert.equal(followTargetDirection(-500, -460, 844), "up");
  assert.equal(followTargetDirection(-1, -0.5, 844), "up");
});

test("narration below the viewport points down", () => {
  assert.equal(followTargetDirection(900, 940, 844), "down");
});

test("narration inside the viewport is here, not a direction", () => {
  assert.equal(followTargetDirection(300, 340, 844), "here");
  assert.equal(followTargetDirection(0, 40, 844), "here");
  assert.equal(followTargetDirection(820, 844, 844), "here");
});

test("comfort band keeps middle lines still, flags only near-edge words", () => {
  assert.equal(withinComfortBand(300, 340, 844), true);
  assert.equal(withinComfortBand(186, 220, 844), true);
  assert.equal(withinComfortBand(100, 140, 844), false);
  assert.equal(withinComfortBand(700, 740, 844), false);
});

test("gentle follow settles the word at a reading line, not dead center", () => {
  const top = gentleFollowScrollTop(700, 1200, 844);
  assert.equal(top, 1200 + 700 - 844 * 0.33);
  assert.notEqual(top, 1200 + 700 - 844 / 2);
  assert.equal(gentleFollowScrollTop(10, 0, 844), 0);
});

test("word counts as gone only outside the usable area past the fixed chrome", () => {
  assert.equal(isWordOutOfUsableArea(300, 340, 844, 12, 130), false);
  assert.equal(isWordOutOfUsableArea(-40, 5, 844, 12, 130), true);
  assert.equal(isWordOutOfUsableArea(800, 830, 844, 12, 130), true);
  assert.equal(isWordOutOfUsableArea(700, 710, 844, 12, 130), false);
});

test("return wording names the reading place and preserves resume-in-place", () => {
  assert.equal(followReturnLabel("up"), "ارجع للقراءة");
  assert.equal(followReturnLabel("down"), "ارجع للقراءة");
  assert.equal(followReturnLabel("here"), "تابع مع الصوت");
  assert.equal(followReturnAriaLabel("down"), "العودة إلى مكان القراءة");
  assert.equal(followReturnAriaLabel("here"), "استئناف تتبع القراءة مع الصوت");
});