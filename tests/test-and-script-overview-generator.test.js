const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  buildTestAndScriptOverviewMarkdown,
  validateOverviewSource,
} = require("../scripts/generate-test-and-script-overview.js");

const DOC_PATH = path.join(__dirname, "..", "docs", "test-and-script-overview.md");

test("test-and-script overview generator emits the key anchors readers need", () => {
  const markdown = buildTestAndScriptOverviewMarkdown();

  assert.match(markdown, /^# Test And Script Overview/m);
  assert.match(markdown, /Generated from \[`scripts\/test-and-script-overview-source\.js`\]/);
  assert.match(markdown, /src\/pages\/__tests__\/Stocks\.test\.jsx/);
  assert.match(markdown, /automatic queue draining after an in-flight batch settles/);
  assert.match(markdown, /tests\/beginner-architecture-generator\.test\.js/);
  assert.match(markdown, /scripts\/generate-test-and-script-overview\.js/);
  assert.match(markdown, /npm run docs:test-overview/);
});

test("test-and-script overview generator fails loudly when a required section is empty", () => {
  assert.throws(
    () => validateOverviewSource({
      title: "Broken",
      sections: [{ heading: "Broken section", groups: [] }],
    }),
    /incomplete/
  );
});

test("checked-in test-and-script overview doc matches generated output", () => {
  const checkedInMarkdown = fs.readFileSync(DOC_PATH, "utf8");
  const generatedMarkdown = buildTestAndScriptOverviewMarkdown();

  assert.equal(
    checkedInMarkdown,
    generatedMarkdown,
    "The test-and-script overview doc is out of date. Run `npm run docs:test-overview` and commit the regenerated file."
  );
});
