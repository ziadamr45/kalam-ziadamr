import test from "node:test";
import assert from "node:assert/strict";
import { resolveSection, SECTIONS } from "../src/lib/sections";

const live = [
  { slug: "موازين", name: "موازين", id: "live" },
  { slug: "الإسلام-والحياة", name: "الإسلام والحياة", id: "islam" },
];

test("live slugs and new sections resolve without renaming", () => {
  assert.equal(resolveSection("موازين", live), live[0]);
  assert.equal(resolveSection("الإسلام-والحياة", live), live[1]);
});

test("a known legacy alias resolves to the unique active section", () => {
  assert.equal(resolveSection("mawazeen", live), live[0]);
});

test("retired and unknown sections do not invent empty pages or unrelated redirects", () => {
  for (const slug of ["al-athar", "zawaya-ruya", "afkar-liltatbeq", "أفكار-للتطبيق", "unknown", "constructor", "toString", "__proto__"]) {
    assert.equal(resolveSection(slug, live), null, slug);
  }
  assert.equal(resolveSection("mawazeen", []), null);
});

test("an exact live slug takes precedence over a legacy name alias", () => {
  const exact = { slug: "mawazeen", name: "New name", id: "exact" };
  assert.equal(resolveSection("mawazeen", [...live, exact]), exact);
});

test("ambiguous display names must not choose a redirect destination", () => {
  assert.equal(resolveSection("mawazeen", [...live, { slug: "second", name: "موازين", id: "other" }]), null);
});

test("a renamed or deleted section does not inherit a guessed alias", () => {
  assert.equal(resolveSection("mawazeen", [{ slug: "new", name: "اسم جديد" }]), null);
});

test("each legacy alias works only when its corresponding section is live", () => {
  for (const section of SECTIONS) {
    const current = { ...section, slug: section.name.replaceAll(" ", "-") };
    assert.equal(resolveSection(section.slug, [current]), current);
    assert.equal(resolveSection(section.slug, []), null);
  }
});

test("empty valid sections remain valid, article count does not determine existence", () => {
  const section = { slug: "empty", name: "Empty", articles: [] };
  assert.equal(resolveSection("empty", [section]), section);
});


test("explicitly removed application-ideas URLs cannot revive from stale data", () => {
  for (const slug of ["afkar-liltatbeq", "أفكار-للتطبيق"]) {
    assert.equal(resolveSection(slug, [{ slug, name: "أفكار للتطبيق" }]), null);
  }
  assert.ok(!SECTIONS.some((section) => section.slug === "afkar-liltatbeq"));
});
