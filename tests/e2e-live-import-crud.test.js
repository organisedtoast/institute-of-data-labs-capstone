// Purpose of this test file:
// This is a true end-to-end "live" harness. It talks to the real Express app,
// the real local MongoDB database, and the real ROIC API. Instead of checking
// exact imported numbers, it checks that the full import -> override ->
// refresh -> delete workflow succeeds against live data and that the stored
// document has the expected overall schema shape.

require("dotenv").config();

// Use a dedicated port so this live harness does not clash with other tests or
// with a local server you may already be running.
process.env.PORT = "3102";

const assert = require("node:assert/strict");
const test = require("node:test");

const { startServer, stopServer } = require("../server");

const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;
const TEST_TICKER = "AAPL";
const TEST_YEARS = 3;
const TEST_CATEGORY = "Profitable Hi Growth";
const TEST_COMPANY_OVERRIDE = "Apple Inc Test Override";

// Small helper for calling the running API server and decoding JSON.
// Returning `{ status, ok, body }` makes the assertions below easier to read.
async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const rawBody = await response.text();
  let body = rawBody;

  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Keeping the raw text helps explain failures to a beginner.
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

// Build a useful error message so a beginner can see *which* step failed and
// what the API actually returned.
function buildFailureMessage(step, response) {
  return [
    `${step} failed.`,
    `Status: ${response.status}`,
    `Body: ${JSON.stringify(response.body, null, 2)}`,
  ].join("\n");
}

// Safety check for live-data tests:
// this harness refuses to run if the test ticker already exists in MongoDB.
// That protects real local data from being overwritten by a test run.
async function assertTickerSafeForHarness() {
  const response = await requestJson(`/api/watchlist/${TEST_TICKER}`);
  if (response.status === 404) {
    return;
  }

  if (response.status !== 200) {
    assert.fail(buildFailureMessage("Preflight ticker lookup", response));
  }

  assert.fail(
    [
      `Refusing to run the live harness against ${TEST_TICKER}.`,
      "A record for this ticker already exists in MongoDB.",
      "Delete or move that record manually before running the live harness.",
    ].join("\n")
  );
}

// Cleanup helper so the test can remove the imported record if it was created.
// The route is allowed to return either:
// - 200 if the document existed and was deleted
// - 404 if the document was not present
async function deleteIfPresent() {
  const response = await requestJson(`/api/watchlist/${TEST_TICKER}`, {
    method: "DELETE",
  });

  if (response.status !== 200 && response.status !== 404) {
    assert.fail(buildFailureMessage("Cleanup delete", response));
  }
}

test("live ROIC import populates grouped fields and preserves new override routes", async () => {
  // Start the real server. Unlike stubbed tests, this run will use the actual
  // networked ROIC API and the actual local MongoDB connection.
  await startServer();

  try {
    // Quick sanity check that the server actually booted before we begin the
    // more expensive live import workflow.
    const healthResponse = await requestJson("/api/health");
    assert.equal(healthResponse.status, 200, buildFailureMessage("Health check", healthResponse));

    // Refuse to continue if the ticker already exists, then clear any leftover
    // copy just in case a previous test run partially cleaned up.
    await assertTickerSafeForHarness();
    await deleteIfPresent();

    // Hit the real import route with a real ticker and a small explicit year cap.
    const importResponse = await requestJson("/api/watchlist/import", {
      method: "POST",
      body: JSON.stringify({
        tickerSymbol: TEST_TICKER,
        investmentCategory: TEST_CATEGORY,
        years: TEST_YEARS,
      }),
    });

    assert.equal(importResponse.status, 201, buildFailureMessage("Import route", importResponse));
    const importedDoc = importResponse.body;

    // Check the top-level shape first.
    // In a live-data test we avoid brittle exact-value assertions because the
    // upstream provider can change prices and fundamentals over time.
    assert.equal(importedDoc.tickerSymbol, TEST_TICKER);
    assert.equal(importedDoc.investmentCategory, TEST_CATEGORY);
    assert.equal(typeof importedDoc.companyName, "object");
    assert.ok(Array.isArray(importedDoc.annualData));
    assert.ok(importedDoc.annualData.length > 0);
    assert.ok(importedDoc.forecastData?.fy1);
    assert.ok(importedDoc.growthForecasts);
    assert.ok(importedDoc.analystRevisions);

    // Then check that one annual row has the grouped metric-field structure we expect.
    const firstAnnualEntry = importedDoc.annualData[0];
    assert.equal(typeof firstAnnualEntry.earningsReleaseDate, "object");
    assert.equal(typeof firstAnnualEntry.base.sharePrice, "object");
    assert.equal(typeof firstAnnualEntry.balanceSheet.cash, "object");
    assert.equal(typeof firstAnnualEntry.incomeStatement.revenue, "object");
    assert.equal(typeof firstAnnualEntry.ownerEarningsBridge.deemedMaintenanceCapex, "object");
    assert.equal(typeof firstAnnualEntry.valuationMultiples.peTrailing, "object");
    assert.equal(typeof firstAnnualEntry.epsAndDividends.epsTrailing, "object");

    // Annual override route: user edits one annual metric, and the stored
    // metric should now say its source of truth is "user".
    const annualOverrideResponse = await requestJson(`/api/watchlist/${TEST_TICKER}/annual/${firstAnnualEntry.fiscalYear}/overrides`, {
      method: "PATCH",
      body: JSON.stringify({
        base: { sharePrice: 123.45 },
      }),
    });
    assert.equal(annualOverrideResponse.status, 200, buildFailureMessage("Annual override", annualOverrideResponse));
    assert.equal(annualOverrideResponse.body.annualData[0].base.sharePrice.sourceOfTruth, "user");

    // Forecast override route: same idea, but for forward-looking forecast fields.
    const forecastOverrideResponse = await requestJson(`/api/watchlist/${TEST_TICKER}/forecast/fy1/overrides`, {
      method: "PATCH",
      body: JSON.stringify({
        sharesOnIssue: 999999,
        eps: 7.7,
      }),
    });
    assert.equal(forecastOverrideResponse.status, 200, buildFailureMessage("Forecast override", forecastOverrideResponse));
    assert.equal(forecastOverrideResponse.body.forecastData.fy1.sharesOnIssue.sourceOfTruth, "user");

    // Top-level override route: this covers grouped fields that are not nested
    // inside one annual row or one forecast bucket.
    const topLevelOverrideResponse = await requestJson(`/api/watchlist/${TEST_TICKER}/metrics/overrides`, {
      method: "PATCH",
      body: JSON.stringify({
        growthForecasts: { revenueCagr3y: 0.12 },
      }),
    });
    assert.equal(topLevelOverrideResponse.status, 200, buildFailureMessage("Top-level metric override", topLevelOverrideResponse));
    assert.equal(topLevelOverrideResponse.body.growthForecasts.revenueCagr3y.sourceOfTruth, "user");

    // Basic PATCH routes should still work on normal editable stock fields too.
    const patchCategoryResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`, {
      method: "PATCH",
      body: JSON.stringify({ investmentCategory: "Lender" }),
    });
    assert.equal(patchCategoryResponse.status, 200, buildFailureMessage("Patch investmentCategory", patchCategoryResponse));
    assert.equal(patchCategoryResponse.body.investmentCategory, "Lender");

    const patchCompanyResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`, {
      method: "PATCH",
      body: JSON.stringify({ companyName: TEST_COMPANY_OVERRIDE }),
    });
    assert.equal(patchCompanyResponse.status, 200, buildFailureMessage("Patch companyName", patchCompanyResponse));
    assert.equal(patchCompanyResponse.body.companyName.sourceOfTruth, "user");

    // Refresh should re-import ROIC-backed values *without* destroying the user
    // overrides we just set. These assertions protect that merge behavior.
    const refreshResponse = await requestJson(`/api/watchlist/${TEST_TICKER}/refresh`, {
      method: "POST",
    });
    assert.equal(refreshResponse.status, 200, buildFailureMessage("Refresh imported ticker", refreshResponse));
    assert.equal(refreshResponse.body.companyName.sourceOfTruth, "user");
    assert.equal(refreshResponse.body.annualData[0].base.sharePrice.sourceOfTruth, "user");
    assert.equal(refreshResponse.body.forecastData.fy1.sharesOnIssue.sourceOfTruth, "user");
    assert.equal(refreshResponse.body.growthForecasts.revenueCagr3y.sourceOfTruth, "user");

    // Finally, prove the imported stock can be deleted cleanly again.
    const deleteResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 200, buildFailureMessage("Delete imported ticker", deleteResponse));
  } finally {
    // Always attempt cleanup and server shutdown, even if the test fails partway through.
    try {
      await deleteIfPresent();
    } finally {
      await stopServer();
    }
  }
});
