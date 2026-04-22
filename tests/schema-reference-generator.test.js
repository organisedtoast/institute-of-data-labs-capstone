// Purpose of this test file:
// This file checks that the schema-reference generator produces the key
// markdown lines developers rely on when reading the generated docs. It also
// checks that the generator fails loudly if a required section would render as
// empty, because silently shipping incomplete docs would be confusing and risky.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSchemaReferenceMarkdown,
  validateSections,
} = require("../scripts/generate-schema-reference.js");

test("schema reference generator emits the key anchor lines developers need", () => {
  // We check a few high-signal anchors instead of snapshotting the whole file.
  // That keeps the test easy for a beginner to maintain while still proving the
  // generator is covering annual, forecast, top-level, and ROIC/manual fields.

  // Run the real markdown generator function.
  // The result is one big markdown string, similar to what the docs script
  // would write out for developers to read.
  const markdown = buildSchemaReferenceMarkdown();

  // The document should always start with the expected top-level heading.
  assert.match(markdown, /^# Schema Reference/m);

  // These are "anchor" checks:
  // we pick a few representative field paths from important parts of the schema
  // rather than checking every single rendered line.
  assert.match(markdown, /annualData\[\]\.base\.sharePrice/);
  assert.match(markdown, /forecastData\.fy1\.eps/);
  assert.match(markdown, /growthForecasts\.revenueCagr3y/);

  // The schema reference should also include the upstream ROIC endpoint path
  // for fields that come from imported data.
  assert.match(markdown, /\/v2\/fundamental\/per-share\/\{identifier\}/);

  // Some fields are manual-only, so the docs should explicitly say that too.
  assert.match(markdown, /manualOnly/);

  // These checks protect the docs from showing internal helper/detail fields
  // that should stay out of the published schema reference.
  assert.doesNotMatch(markdown, /sharesOnIssueDetailed/);
  assert.doesNotMatch(markdown, /marketCapDetailed/);
});

test("schema reference generator fails fast when a required section would be empty", () => {
  // The real script exits non-zero when validation throws. Testing the throw
  // directly gives us the same safety signal without spawning a child process.

  // Here we simulate a broken section: it has a title, but no rows to render.
  // That should be treated as a generator bug, not silently accepted.
  assert.throws(
    () => validateSections([{ title: "broken section", rows: [] }]),
    /rendered no rows/
  );
});
