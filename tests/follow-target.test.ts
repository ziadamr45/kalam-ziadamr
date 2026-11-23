import test from "node:test";
import assert from "node:assert/strict";
import {
  followTargetDirection,
  followReturnLabel,
  followReturnAriaLabel,
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

test("return wording names the reading place and preserves resume-in-place", () => {
  assert.equal(followReturnLabel("up"), "ارجع للقراءة");
  assert.equal(followReturnLabel("down"), "ارجع للقراءة");
  assert.equal(followReturnLabel("here"), "تابع مع الصوت");
  assert.equal(followReturnAriaLabel("down"), "العودة إلى مكان القراءة");
  assert.equal(followReturnAriaLabel("here"), "استئناف تتبع القراءة مع الصوت");
});