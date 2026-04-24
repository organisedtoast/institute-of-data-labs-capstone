const assert = require("node:assert/strict");
const test = require("node:test");

const commonJsDefaultBoldHelper = require("../shared/defaultBoldStockRows");
const {
  defaultBoldStockRows,
  defaultBoldRowKeys,
  defaultBoldMainTableRowKeys,
  defaultBoldMetricsFieldPaths,
  isDefaultBoldRowKey,
  isDefaultBoldMainTableRowKey,
  isDefaultBoldMetricsFieldPath,
} = commonJsDefaultBoldHelper;

test("the shared default-bold stock-row source derives the backend and frontend lookups from one canonical list", () => {
  // This protects the real maintenance goal: backend row keys and frontend
  // fallback field paths should both come from one source instead of drifting.
  assert.equal(Array.isArray(defaultBoldStockRows), true);
  assert.ok(defaultBoldStockRows.length > 0);

  const uniqueRowKeys = new Set(defaultBoldStockRows.map((row) => row.rowKey));
  assert.equal(uniqueRowKeys.size, defaultBoldStockRows.length);

  assert.equal(isDefaultBoldMainTableRowKey("main::annualData[].base.sharePrice"), true);
  assert.equal(isDefaultBoldMainTableRowKey("main::annualData[].base.marketCap"), true);
  assert.equal(isDefaultBoldMetricsFieldPath("annualData[].forecastData.fy3.dps"), true);
  assert.equal(isDefaultBoldMetricsFieldPath("annualData[].forecastData.fy2.evSales"), true);
  assert.equal(isDefaultBoldRowKey("980::annualData[].valuationMultiples.peTrailing"), true);

  assert.equal(defaultBoldMainTableRowKeys.has("main::annualData[].base.sharesOnIssue"), false);
  assert.equal(isDefaultBoldMetricsFieldPath("annualData[].base.sharesOnIssue"), false);

  // Main-table and detail-metrics lookups are different views of the same
  // canonical list, so both subsets should still point back to real entries.
  assert.equal(
    defaultBoldStockRows.some((row) => row.surface === "main" && row.rowKey === "main::annualData[].base.sharePrice"),
    true,
  );
  assert.equal(
    defaultBoldStockRows.some((row) => row.surface === "detail" && row.fieldPath === "annualData[].forecastData.fy1.marketCap"),
    true,
  );

  assert.equal(defaultBoldRowKeys.has("1490::annualData[].epsAndDividends.dpsTrailing"), true);
  assert.equal(defaultBoldMetricsFieldPaths.has("annualData[].epsAndDividends.dpsTrailing"), true);
});

test("the browser-safe ESM wrapper stays aligned with the backend CommonJS helper", async () => {
  // This protects the Edge regression directly: the frontend import path must
  // stay browser-safe without drifting away from the backend's shared lookups.
  const esmDefaultBoldHelper = await import("../shared/defaultBoldStockRows.mjs");

  assert.deepEqual(esmDefaultBoldHelper.defaultBoldStockRows, commonJsDefaultBoldHelper.defaultBoldStockRows);
  assert.deepEqual(
    Array.from(esmDefaultBoldHelper.defaultBoldMainTableRowKeys),
    Array.from(commonJsDefaultBoldHelper.defaultBoldMainTableRowKeys),
  );
  assert.deepEqual(
    Array.from(esmDefaultBoldHelper.defaultBoldMetricsFieldPaths),
    Array.from(commonJsDefaultBoldHelper.defaultBoldMetricsFieldPaths),
  );
  assert.equal(
    esmDefaultBoldHelper.isDefaultBoldMainTableRowKey("main::annualData[].base.sharePrice"),
    true,
  );
  assert.equal(
    esmDefaultBoldHelper.isDefaultBoldMetricsFieldPath("annualData[].forecastData.fy3.dps"),
    true,
  );
});
