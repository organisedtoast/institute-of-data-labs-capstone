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
  const markdown = buildSchemaReferenceMarkdown();

  assert.match(markdown, /^# Schema Reference/m);
  assert.match(markdown, /annualData\[\]\.base\.sharePrice/);
  assert.match(markdown, /forecastData\.fy1\.eps/);
  assert.match(markdown, /growthForecasts\.revenueCagr3y/);
  assert.match(markdown, /\/v2\/fundamental\/per-share\/\{identifier\}/);
  assert.match(markdown, /manualOnly/);
  assert.doesNotMatch(markdown, /sharesOnIssueDetailed/);
  assert.doesNotMatch(markdown, /marketCapDetailed/);
});

test("schema reference generator fails fast when a required section would be empty", () => {
  // The real script exits non-zero when validation throws. Testing the throw
  // directly gives us the same safety signal without spawning a child process.
  assert.throws(
    () => validateSections([{ title: "broken section", rows: [] }]),
    /rendered no rows/
  );
});
