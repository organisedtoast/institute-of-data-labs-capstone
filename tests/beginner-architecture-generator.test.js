const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  buildBeginnerArchitectureMarkdown,
  validateArchitectureDocSource,
} = require("../scripts/generate-beginner-architecture-doc.js");

const DOC_PATH = path.join(__dirname, "..", "docs", "beginner-architecture-diagram.md");

test("beginner architecture generator emits the key beginner-facing anchor lines", () => {
  const markdown = buildBeginnerArchitectureMarkdown();

  assert.match(markdown, /^# Beginner-Focused Architecture Diagram/m);
  assert.match(markdown, /Generated from \[`scripts\/architecture-doc-source\.js`\]/);
  assert.match(markdown, /subgraph presentation\[Presentation Layer\]/);
  assert.match(markdown, /subgraph frontend\[Frontend Application Layer<br\/>React App \(Browser\)\]/);
  assert.match(markdown, /subgraph backendApi\[Backend API Layer<br\/>Express Server\]/);
  assert.match(markdown, /subgraph external\[External Systems\]/);
  assert.match(markdown, /seeStock\[SEE STOCK\]/);
  assert.match(markdown, /addStock\[ADD STOCK\]/);
  assert.match(markdown, /src\/pages\/Stocks\.jsx/);
  assert.match(markdown, /services\/watchlistDashboardService\.js/);
  assert.match(markdown, /models\/WatchlistStock\.js/);
});

test("beginner architecture generator fails loudly when a required section is empty", () => {
  assert.throws(
    () => validateArchitectureDocSource({
      title: "Broken",
      sections: {
        beginnerNotes: ["note"],
        fileMapSections: [{ title: "Broken section", blocks: [] }],
      },
    }),
    /incomplete/
  );
});

test("checked-in beginner architecture doc matches generated output", () => {
  const checkedInMarkdown = fs.readFileSync(DOC_PATH, "utf8");
  const generatedMarkdown = buildBeginnerArchitectureMarkdown();

  assert.equal(
    checkedInMarkdown,
    generatedMarkdown,
    "The beginner architecture doc is out of date. Run `npm run docs:architecture` and commit the regenerated file."
  );
});
