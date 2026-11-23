import test from "node:test";
import assert from "node:assert/strict";
import { selectTourSteps, isReadingToolsPanelStep } from "../src/lib/tour-steps";

const visible = () => true;
const hidden = () => false;
const exists = () => true;
const missing = () => false;

test("visible steps are always kept", () => {
  const steps = [{ selector: "#a" }, { selector: "#b" }];
  assert.equal(selectTourSteps(steps, visible, missing).length, 2);
});

test("step without selector is always kept", () => {
  const steps = [{ selector: undefined }];
  assert.equal(selectTourSteps(steps, hidden, missing).length, 1);
});

test("hidden target with beforeShow is kept only when it exists in the DOM", () => {
  const steps = [{ selector: "[data-tour='tashkeel-btn']", beforeShow: () => {} }];
  assert.equal(selectTourSteps(steps, hidden, exists).length, 1);
  assert.equal(selectTourSteps(steps, hidden, missing).length, 0);
});

test("hidden target without beforeShow is dropped so the counter stays honest", () => {
  const steps = [{ selector: "[data-tour='reading-tools-btn']" }, { selector: "#article-body" }];
  const kept = selectTourSteps(steps, (sel) => sel === "#article-body", exists);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].selector, "#article-body");
});

test("reading-tools panel steps are recognized by exact selector", () => {
  assert.equal(isReadingToolsPanelStep("[data-tour='tashkeel-btn']"), true);
  assert.equal(isReadingToolsPanelStep("[data-tour='summary-btn']"), true);
  assert.equal(isReadingToolsPanelStep("[data-tour='pdf-btn']"), true);
  assert.equal(isReadingToolsPanelStep("[data-tour='quote-btn']"), true);
  assert.equal(isReadingToolsPanelStep("[data-tour='reading-tools-btn']"), false);
  assert.equal(isReadingToolsPanelStep("[data-tour='save-btn']"), false);
  assert.equal(isReadingToolsPanelStep(null), false);
});
