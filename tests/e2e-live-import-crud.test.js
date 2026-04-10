// This test is a full end-to-end flow against the real Express server and MongoDB instance, 
// using a real live ticker and the real ROIC API.

// Because this test is more complex and has more moving parts than a unit test,
// it is not meant to be run on every code change. Instead, run it manually when
// you want to verify the live import flow is working as expected.

// To run this test:
// 1. Make sure your local MongoDB is running and accessible.
// 2. Make sure your .env file has the correct PORT, MONGODB_URI, and ROIC_API_KEY.
// 3. Run this test file with Node: node --test tests/e2e-live-import-crud.test.js


// Because this test uses a real live ticker (AAPL), it includes safety checks
// to avoid accidentally deleting or overwriting a record that belongs to the user.
// If you want to run the test against a different ticker, change the TEST_TICKER
// constant below and make sure to update the safety check logic accordingly.

// Load environment variables from .env so this test can use the same
// PORT, MongoDB connection, and ROIC API key as the app itself.
require("dotenv").config();

// Put this harness on its own port so it does not collide with a dev server or
// with the stubbed harness while they are run separately.
process.env.PORT = "3102";

// Node's built-in assertion library lets us say "this must be true".
// If an assertion fails, the test fails and prints the message we provide.
const assert = require("node:assert/strict");

// Node's built-in test runner lets us create a test without installing Jest,
// Mocha, or any other extra test package.
const test = require("node:test");

// We import the real server lifecycle helpers so this test talks to the
// application the same way a real user or frontend would.
const { startServer, stopServer } = require("../server");

// This is the base URL for every HTTP request the test sends.
// We use 127.0.0.1 instead of "localhost" to avoid any local DNS oddities.
const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;

// We deliberately use one known live ticker for this end-to-end test.
// AAPL is a good candidate because it is very likely to exist in the ROIC API
// and to have enough history to make the import meaningful.
const TEST_TICKER = "AAPL";

// We request 10 years so the imported dataset is more meaningful than a tiny
// sample, while still keeping the test within a reasonable size.
const TEST_YEARS = 10;

// This special category is our safety marker.
// If we see a document with this category later, we know it was probably
// created by this harness rather than by a person manually using the app.
const TEST_CATEGORY = "e2e-live-test";

// After import, we update companyName to prove the CRUD update path still works
// on a document that originally came from the live ROIC import flow.
const TEST_COMPANY_OVERRIDE = "Apple Inc Test Override";

// Small helper: send an HTTP request to the running Express server and try to
// parse the response as JSON.
//
// Why this exists:
// - it keeps the main test readable
// - it centralizes our fetch logic in one place
// - it gives every step the same response shape: { status, ok, body }
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
    // Most of our API routes return JSON, so we try to parse it.
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Keep the raw text when the response is not valid JSON so failures still
    // show the actual server response.
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

// Build a detailed error message we can reuse in assertions.
// This makes failures easier to understand because we can see:
// - which step failed
// - the HTTP status code
// - the actual body the API returned
function buildFailureMessage(step, response) {
  return [
    `${step} failed.`,
    `Status: ${response.status}`,
    `Body: ${JSON.stringify(response.body, null, 2)}`,
  ].join("\n");
}

// Safety check before the test starts making writes.
//
// Why this matters:
// This is a REAL integration test against your REAL local MongoDB.
// Because we are using a real ticker symbol (AAPL), we do not want the test
// to accidentally delete or overwrite a record that belongs to the user.
//
// Behavior:
// - if AAPL is not in MongoDB, we are safe to continue
// - if AAPL exists but looks like an old harness-created record, we allow it
// - if AAPL exists and does NOT look like harness data, we fail on purpose
async function assertTickerSafeForHarness() {
  const response = await requestJson(`/api/watchlist/${TEST_TICKER}`);

  if (response.status === 404) {
    // 404 means the record does not exist yet, so the harness can proceed.
    return;
  }

  if (response.status !== 200) {
    assert.fail(buildFailureMessage("Preflight ticker lookup", response));
  }

  // The only safe pre-existing AAPL document is one that was clearly created
  // by this harness in an earlier run.
  if (response.body.investmentCategory !== TEST_CATEGORY) {
    assert.fail(
      [
        `Refusing to run the live harness against ${TEST_TICKER}.`,
        "A record for this ticker already exists in MongoDB and it does not look like a prior harness-created document.",
        "Delete or move that record manually, or change the harness ticker/category before running the test.",
        `Existing investmentCategory: ${JSON.stringify(response.body.investmentCategory)}`,
      ].join("\n")
    );
  }
}

// Cleanup helper used both before and after the main test flow.
//
// Why we do cleanup in two places:
// - before the test: remove leftovers from an interrupted earlier run
// - after the test: leave the database clean for the next run
async function deleteIfPresent() {
  const response = await requestJson(`/api/watchlist/${TEST_TICKER}`, {
    method: "DELETE",
  });

  // 200 means a document existed and was deleted.
  // 404 means nothing was there to delete, which is also fine for cleanup.
  if (response.status !== 200 && response.status !== 404) {
    assert.fail(buildFailureMessage("Cleanup delete", response));
  }
}

// This single test covers the whole production path end to end:
// 1. start the real server
// 2. import live data from the ROIC API
// 3. verify normalization and MongoDB persistence
// 4. run normal CRUD operations on the imported record
// 5. delete the record
// 6. stop the server and clean up
test("live ROIC import flows through normalization, MongoDB upsert, and follow-up CRUD routes", async () => {
  // Boot the Express app and MongoDB connection using the same code path the
  // application uses in real life.
  await startServer();

  try {
    // First prove the server is actually reachable before we try more specific
    // API routes. If this fails, the rest of the test would be noise.
    const healthResponse = await requestJson("/api/health");
    assert.equal(
      healthResponse.status,
      200,
      buildFailureMessage("Health check", healthResponse)
    );

    // Protect existing user data before the test writes anything.
    await assertTickerSafeForHarness();

    // Remove leftovers from a previous harness run so this test starts from a
    // known clean state.
    await deleteIfPresent();

    // This is the key import call.
    // It triggers:
    // - live ROIC API fetches
    // - normalization into the app's schema
    // - upsert into MongoDB
    const importResponse = await requestJson("/api/watchlist/import", {
      method: "POST",
      body: JSON.stringify({
        tickerSymbol: TEST_TICKER,
        investmentCategory: TEST_CATEGORY,
        years: TEST_YEARS,
      }),
    });

    assert.equal(
      importResponse.status,
      201,
      [
        "Live import failed.",
        "This usually means either the ROIC API request failed upstream or the server could not normalize/persist the response.",
        buildFailureMessage("Import route", importResponse),
      ].join("\n")
    );

    // From here onward, we inspect the created document to prove the import
    // flow produced the shape our app expects.
    const importedDoc = importResponse.body;

    // The ticker should be stored in uppercase consistently.
    assert.equal(importedDoc.tickerSymbol, TEST_TICKER);

    // The import route should preserve the category we sent.
    assert.equal(importedDoc.investmentCategory, TEST_CATEGORY);

    // The normalized metadata should remember how many years were requested.
    assert.equal(importedDoc.sourceMeta.importRangeYears, TEST_YEARS);

    // lastImportedAt tells us the document knows when the import happened.
    assert.ok(importedDoc.sourceMeta.lastImportedAt, "Expected sourceMeta.lastImportedAt to be populated.");

    // roicEndpointsUsed should tell us which upstream datasets participated in
    // building this document.
    assert.ok(Array.isArray(importedDoc.sourceMeta.roicEndpointsUsed), "Expected sourceMeta.roicEndpointsUsed to be an array.");
    assert.ok(importedDoc.sourceMeta.roicEndpointsUsed.length > 0, "Expected sourceMeta.roicEndpointsUsed to list the live ROIC endpoints used.");

    // annualData should be the normalized array of yearly entries.
    assert.ok(Array.isArray(importedDoc.annualData), "Expected annualData to be an array.");
    assert.ok(importedDoc.annualData.length > 0, "Expected imported annualData to contain at least one fiscal year.");
    assert.ok(importedDoc.annualData.length <= TEST_YEARS, "Expected imported annualData not to exceed the requested year limit.");

    // companyName should NOT be a plain string.
    // The schema expects an "overridable field" object so later user overrides
    // can coexist with imported ROIC values.
    assert.equal(typeof importedDoc.companyName, "object");
    assert.equal(
      importedDoc.companyName.sourceOfTruth,
      "roic",
      "Expected imported companyName to preserve the overridable-field shape."
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(importedDoc.companyName, "roicValue"),
      "Expected imported companyName to include roicValue."
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(importedDoc.companyName, "effectiveValue"),
      "Expected imported companyName to include effectiveValue."
    );

    // We inspect the first annual entry to make sure the important yearly
    // metrics were also normalized into the same overridable-field structure.
    // marketAnchorDate is now a hybrid field:
    // - earnings-call date when ROIC has it
    // - otherwise the annual period-end date fallback
    const firstAnnualEntry = importedDoc.annualData[0];
    for (const fieldName of [
      "marketAnchorDate",
      "stockPrice",
      "sharesOutstanding",
      "marketCap",
      "returnOnInvestedCapital",
    ]) {
      assert.equal(
        typeof firstAnnualEntry[fieldName],
        "object",
        `Expected annualData[0].${fieldName} to preserve the overridable-field shape.`
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(firstAnnualEntry[fieldName], "effectiveValue"),
        `Expected annualData[0].${fieldName} to include effectiveValue.`
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(firstAnnualEntry[fieldName], "sourceOfTruth"),
        `Expected annualData[0].${fieldName} to include sourceOfTruth.`
      );
    }

    // Now switch from import verification to CRUD verification.
    // GET by ticker should return the imported record from MongoDB.
    const getOneResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`);
    assert.equal(
      getOneResponse.status,
      200,
      buildFailureMessage("Get imported ticker", getOneResponse)
    );
    assert.equal(getOneResponse.body.tickerSymbol, TEST_TICKER);

    // GET list should include the imported record somewhere in the array.
    const listResponse = await requestJson("/api/watchlist");
    assert.equal(
      listResponse.status,
      200,
      buildFailureMessage("List watchlist", listResponse)
    );
    assert.ok(Array.isArray(listResponse.body), "Expected GET /api/watchlist to return an array.");
    assert.ok(
      listResponse.body.some((stock) => stock.tickerSymbol === TEST_TICKER),
      "Expected imported ticker to appear in the watchlist list response."
    );

    // PATCH investmentCategory proves the normal scalar update path works on a
    // document that was originally created by the import route.
    const patchCategoryResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`, {
      method: "PATCH",
      body: JSON.stringify({
        investmentCategory: "core",
      }),
    });
    assert.equal(
      patchCategoryResponse.status,
      200,
      buildFailureMessage("Patch investmentCategory", patchCategoryResponse)
    );
    assert.equal(patchCategoryResponse.body.investmentCategory, "core");

    // PATCH companyName is especially important because companyName is not just
    // a string in the schema. It is an overridable object.
    // This assertion proves the update flow preserves that object structure.
    const patchCompanyResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`, {
      method: "PATCH",
      body: JSON.stringify({
        companyName: TEST_COMPANY_OVERRIDE,
      }),
    });
    assert.equal(
      patchCompanyResponse.status,
      200,
      buildFailureMessage("Patch companyName", patchCompanyResponse)
    );
    assert.equal(typeof patchCompanyResponse.body.companyName, "object");
    assert.equal(patchCompanyResponse.body.companyName.userValue, TEST_COMPANY_OVERRIDE);
    assert.equal(patchCompanyResponse.body.companyName.effectiveValue, TEST_COMPANY_OVERRIDE);
    assert.equal(patchCompanyResponse.body.companyName.sourceOfTruth, "user");
    assert.ok(
      patchCompanyResponse.body.companyName.lastOverriddenAt,
      "Expected PATCH companyName to stamp lastOverriddenAt."
    );

    // DELETE should remove the imported record from MongoDB.
    const deleteResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`, {
      method: "DELETE",
    });
    assert.equal(
      deleteResponse.status,
      200,
      buildFailureMessage("Delete imported ticker", deleteResponse)
    );
    assert.equal(deleteResponse.body.tickerSymbol, TEST_TICKER);

    // Final check: once deleted, the record should no longer be retrievable.
    const getAfterDeleteResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`);
    assert.equal(
      getAfterDeleteResponse.status,
      404,
      buildFailureMessage("Get deleted ticker", getAfterDeleteResponse)
    );
  } finally {
    // finally always runs, even if one of the assertions above throws.
    // This is the safest place to put cleanup for real integration tests.
    try {
      await deleteIfPresent();
    } finally {
      // Shut down the HTTP server and MongoDB connection so the test process can
      // exit cleanly instead of hanging with open handles.
      await stopServer();
    }
  }
});
