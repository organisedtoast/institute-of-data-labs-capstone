// This smoke test proves the CLI inspection script can print a category's
// visible fields without a frontend. It is intentionally light on assertions
// because the deeper field-content checks live in lens-visibility.test.js.

require("dotenv").config();

const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

test("inspect-lens-fields script prints seeded category fields", () => {
  const result = spawnSync(process.execPath, ["scripts/inspect-lens-fields.js", "--category", "Lenders"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Lens: Lenders/);
  assert.match(result.stdout, /Assets/);
  assert.match(result.stdout, /FY end date/);
});
