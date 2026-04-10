// This test verifies the full end-to-end flow of importing a ticker from the ROIC API, 
// through normalization, into MongoDB, and then exercising the CRUD routes on the imported document.
//
// The ROIC service is stubbed to return fixed data immediately, which makes this
// test stable and repeatable without relying on the live ROIC API. 

// However, the Express server, MongoDB persistence, and normalization logic are all
// real, which means this test still provides strong confidence that the pieces
// work together as expected.

// To run this test:
// 1. Make sure your local MongoDB is running.
// 2. Run this test file with Node.js by executing in terminal
//    node tests/e2e-stubbed-import-crud.test.js






// Load the same environment variables the app uses in normal development.
// Even though the ROIC responses are stubbed in this test, we still use the
// real local MongoDB and the real local Express server.
require("dotenv").config();

// Put this harness on its own port so it does not fight with a manually
// running dev server or a leftover test process on port 3000.
process.env.PORT = "3101";

// Node's built-in assertion library gives us the checks that make a test pass
// or fail. We use the "strict" version so comparisons behave predictably.
const assert = require("node:assert/strict");

// Node's built-in test runner lets us write automated tests without adding
// Jest, Mocha, or any other extra test framework dependency.
const test = require("node:test");

// This test is a "semi-integration" test.
//
// What is REAL here:
// - the Express routes
// - the controllers
// - the normalization service
// - the MongoDB writes and reads
// - the HTTP requests we send into the app
//
// What is FAKE/STUBBED here:
// - the upstream ROIC API responses
//
// Why do that?
// Because live third-party APIs can be slow, change shape, rate-limit us, or
// fail due to internet issues. By stubbing only the ROIC service layer, this
// test becomes repeatable and stable enough for everyday verification.

// This is the special ticker we use only for this stubbed harness.
// It is intentionally not a real market ticker, which helps avoid touching
// normal user data in the local MongoDB.
const TEST_TICKER = "STUBE2E10";

// This category is a visible marker that the document came from the stubbed
// semi-integration test rather than from a person manually using the app.
const TEST_CATEGORY = "e2e-stubbed-test";

// We request 10 years so the imported dataset is meaningful and gives the
// normalization code enough material to work with.
const TEST_YEARS = 10;

// We later update companyName to prove the CRUD update flow still works after
// the import route creates the document.
const TEST_COMPANY_OVERRIDE = "Stubbed Company Override";

// This is the base URL for our HTTP requests into the real Express server.
// We use 127.0.0.1 to avoid any machine-specific "localhost" resolution issues.
const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;

// These names match the ROIC endpoint labels recorded by normalization.
// We assert against them later to prove the import metadata was populated.
const EXPECTED_ROIC_ENDPOINTS = [
  "company/profile",
  "annual/per-share",
  "annual/profitability",
  "stock-prices",
  "earnings-calls",
];

// This helper creates 10 annual rows for per-share data.
// Normalization uses this dataset to discover:
// - fiscalYear
// - fiscalYearEndDate
// - sharesOutstanding
function buildPerShareRows() {
  return [
    { fiscalYear: 2024, fiscalYearEndDate: "2024-09-28", sharesOutstanding: 1000 },
    { fiscalYear: 2023, fiscalYearEndDate: "2023-09-30", sharesOutstanding: 980 },
    { fiscalYear: 2022, fiscalYearEndDate: "2022-09-24", sharesOutstanding: 960 },
    { fiscalYear: 2021, fiscalYearEndDate: "2021-09-25", sharesOutstanding: 940 },
    { fiscalYear: 2020, fiscalYearEndDate: "2020-09-26", sharesOutstanding: 920 },
    { fiscalYear: 2019, fiscalYearEndDate: "2019-09-28", sharesOutstanding: 900 },
    { fiscalYear: 2018, fiscalYearEndDate: "2018-09-29", sharesOutstanding: 880 },
    { fiscalYear: 2017, fiscalYearEndDate: "2017-09-30", sharesOutstanding: 860 },
    { fiscalYear: 2016, fiscalYearEndDate: "2016-09-24", sharesOutstanding: 840 },
    { fiscalYear: 2015, fiscalYearEndDate: "2015-09-26", sharesOutstanding: 820 },
  ];
}

// This helper creates 10 annual profitability rows.
// Normalization uses this dataset to populate returnOnInvestedCapital.
function buildProfitabilityRows() {
  return [
    { fiscalYear: 2024, returnOnInvestedCapital: 0.31 },
    { fiscalYear: 2023, returnOnInvestedCapital: 0.29 },
    { fiscalYear: 2022, returnOnInvestedCapital: 0.27 },
    { fiscalYear: 2021, returnOnInvestedCapital: 0.25 },
    { fiscalYear: 2020, returnOnInvestedCapital: 0.23 },
    { fiscalYear: 2019, returnOnInvestedCapital: 0.21 },
    { fiscalYear: 2018, returnOnInvestedCapital: 0.19 },
    { fiscalYear: 2017, returnOnInvestedCapital: 0.17 },
    { fiscalYear: 2016, returnOnInvestedCapital: 0.15 },
    { fiscalYear: 2015, returnOnInvestedCapital: 0.13 },
  ];
}

// This helper creates daily stock-price rows in ascending date order.
// Normalization uses this dataset to find the stock price that should be paired
// with each chosen market anchor date.
function buildPriceRows() {
  return [
    { date: "2015-10-29", close: 100 },
    { date: "2016-10-28", close: 110 },
    { date: "2017-11-04", close: 120 },
    { date: "2018-11-03", close: 130 },
    { date: "2019-11-01", close: 140 },
    { date: "2020-10-31", close: 150 },
    { date: "2021-10-30", close: 160 },
    { date: "2022-10-29", close: 170 },
    { date: "2023-11-04", close: 180 },
    { date: "2024-11-02", close: 190 },
  ];
}

// This helper creates earnings call rows.
// Notice that 2024 is intentionally missing.
//
// Why omit it?
// This lets the test prove the new hybrid behavior:
// - 2023 can still use a real earnings-call date
// - 2024 must fall back to the annual period-end date
// That mixed coverage is exactly the real-world problem we want to handle.
function buildEarningsRows() {
  return [
    { date: "2015-10-28", fiscalYear: 2015 },
    { date: "2016-10-27", fiscalYear: 2016 },
    { date: "2017-11-03", fiscalYear: 2017 },
    { date: "2018-11-02", fiscalYear: 2018 },
    { date: "2019-10-31", fiscalYear: 2019 },
    { date: "2020-10-30", fiscalYear: 2020 },
    { date: "2021-10-29", fiscalYear: 2021 },
    { date: "2022-10-28", fiscalYear: 2022 },
    { date: "2023-11-03", fiscalYear: 2023 },
  ];
}

// This object is our fake ROIC service.
// Each function returns fixed data immediately instead of making a network call.
// The import controller will use these functions exactly as if they were the
// real service functions, which is why this remains a useful integration test.
const stubbedRoicService = {
  async fetchCompanyProfile() {
    return {
      companyName: "Stubbed Test Company",
      priceCurrency: "USD",
    };
  },

  async fetchAnnualPerShare() {
    return buildPerShareRows();
  },

  async fetchAnnualProfitability() {
    return buildProfitabilityRows();
  },

  async fetchStockPrices() {
    return buildPriceRows();
  },

  async fetchEarningsCalls() {
    return buildEarningsRows();
  },
};

// The import controller requires roicService at module-load time.
// To keep the test deterministic, we load the real module here, replace its
// exported functions with our stub implementations, and only then load
// server.js. That way every later require() sees the patched version.
const roicService = require("../services/roicService");
Object.assign(roicService, stubbedRoicService);

// Now that the ROIC service exports are patched, loading server.js will cause
// the import controller to use the stubbed behavior instead of the live API.
const { startServer, stopServer } = require("../server");

// Small helper for sending JSON HTTP requests to the real Express app.
// Keeping this in one place makes the actual test flow easier to read.
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
    // If the server returns non-JSON text, keep that raw text so any failure
    // message still shows the real response body.
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

// Reusable failure formatter so every assertion prints the same style of
// debugging information.
function buildFailureMessage(step, response) {
  return [
    `${step} failed.`,
    `Status: ${response.status}`,
    `Body: ${JSON.stringify(response.body, null, 2)}`,
  ].join("\n");
}

// Cleanup helper used both before and after the main test.
// Because this test uses a dedicated fake ticker, it is safe to delete it if
// it exists from an earlier interrupted run.
async function deleteIfPresent() {
  const response = await requestJson(`/api/watchlist/${TEST_TICKER}`, {
    method: "DELETE",
  });

  if (response.status !== 200 && response.status !== 404) {
    assert.fail(buildFailureMessage("Cleanup delete", response));
  }
}

// This test verifies the full import + CRUD flow using:
// - stubbed ROIC data
// - real normalization
// - real Express routes
// - real MongoDB persistence
test("stubbed ROIC import flows through normalization, MongoDB upsert, and follow-up CRUD routes", async () => {
  await startServer();

  try {
    // First confirm the server is reachable at all.
    const healthResponse = await requestJson("/api/health");
    assert.equal(
      healthResponse.status,
      200,
      buildFailureMessage("Health check", healthResponse)
    );

    // Start from a clean database state for this dedicated ticker.
    await deleteIfPresent();

    // This import call goes through the real route and controller, but the
    // controller's upstream ROIC fetches are now deterministic stubs.
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
      buildFailureMessage("Import route", importResponse)
    );

    const importedDoc = importResponse.body;

    // Basic import assertions prove the route accepted the request and wrote a
    // document into MongoDB in the expected top-level shape.
    assert.equal(importedDoc.tickerSymbol, TEST_TICKER);
    assert.equal(importedDoc.investmentCategory, TEST_CATEGORY);
    assert.equal(importedDoc.sourceMeta.importRangeYears, TEST_YEARS);
    assert.ok(importedDoc.sourceMeta.lastImportedAt, "Expected sourceMeta.lastImportedAt to be populated.");
    assert.deepEqual(importedDoc.sourceMeta.roicEndpointsUsed, EXPECTED_ROIC_ENDPOINTS);
    assert.ok(Array.isArray(importedDoc.annualData), "Expected annualData to be an array.");
    assert.equal(importedDoc.annualData.length, TEST_YEARS);

    // companyName should be stored as an overridable object rather than a plain
    // string so later user overrides can coexist with imported data.
    assert.equal(typeof importedDoc.companyName, "object");
    assert.equal(importedDoc.companyName.roicValue, "Stubbed Test Company");
    assert.equal(importedDoc.companyName.effectiveValue, "Stubbed Test Company");
    assert.equal(importedDoc.companyName.sourceOfTruth, "roic");

    // Because the rows are sorted newest-first, the first annual entry should
    // represent the most recent fiscal year from our stub data.
    const firstAnnualEntry = importedDoc.annualData[0];
    assert.equal(firstAnnualEntry.fiscalYear, 2024);

    // These checks prove normalization preserved the expected overridable-field
    // object structure for the yearly metrics.
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
        `Expected annualData[0].${fieldName} to be an overridable-field object.`
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

    // These specific values prove the normalization logic produced the numbers
    // we expect from the stubbed upstream data.
    //
    // 2024 has no earnings-call row in the stub, so marketAnchorDate should
    // fall back to the annual period-end date from the annual fundamentals.
    assert.equal(firstAnnualEntry.marketAnchorDate.effectiveValue, "2024-09-28");
    assert.equal(firstAnnualEntry.stockPrice.effectiveValue, 190);
    assert.equal(firstAnnualEntry.sharesOutstanding.effectiveValue, 1000);
    assert.equal(firstAnnualEntry.marketCap.effectiveValue, 190000);
    assert.equal(firstAnnualEntry.marketCap.sourceOfTruth, "derived");
    assert.equal(firstAnnualEntry.returnOnInvestedCapital.effectiveValue, 0.31);
    assert.equal(firstAnnualEntry.returnOnInvestedCapital.sourceOfTruth, "roic");

    // The second row still has an earnings-call record available, so it should
    // use that real post-year-end date instead of the fiscal-year-end fallback.
    const secondAnnualEntry = importedDoc.annualData[1];
    assert.equal(secondAnnualEntry.fiscalYear, 2023);
    assert.equal(secondAnnualEntry.marketAnchorDate.effectiveValue, "2023-11-03");

    // GET by ticker proves the imported record is readable through the normal
    // CRUD route after being written to MongoDB.
    const getOneResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`);
    assert.equal(
      getOneResponse.status,
      200,
      buildFailureMessage("Get imported ticker", getOneResponse)
    );
    assert.equal(getOneResponse.body.tickerSymbol, TEST_TICKER);

    // GET list proves the record appears in the broader collection read path.
    const listResponse = await requestJson("/api/watchlist");
    assert.equal(
      listResponse.status,
      200,
      buildFailureMessage("List watchlist", listResponse)
    );
    assert.ok(Array.isArray(listResponse.body), "Expected GET /api/watchlist to return an array.");
    assert.ok(
      listResponse.body.some((stock) => stock.tickerSymbol === TEST_TICKER),
      "Expected the stub-imported ticker to appear in the watchlist list response."
    );

    // PATCH investmentCategory proves the ordinary update route still works on
    // a document that started life in the import route.
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

    // PATCH companyName is the more interesting CRUD update because companyName
    // must remain an overridable-field object instead of turning into a string.
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

    // DELETE proves the record can be removed cleanly after all prior steps.
    const deleteResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`, {
      method: "DELETE",
    });
    assert.equal(
      deleteResponse.status,
      200,
      buildFailureMessage("Delete imported ticker", deleteResponse)
    );
    assert.equal(deleteResponse.body.tickerSymbol, TEST_TICKER);

    // Final confirmation that the deleted record is really gone.
    const getAfterDeleteResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`);
    assert.equal(
      getAfterDeleteResponse.status,
      404,
      buildFailureMessage("Get deleted ticker", getAfterDeleteResponse)
    );
  } finally {
    // Even if the test fails halfway through, we still want to leave MongoDB in
    // a clean state and close the server so the process can exit normally.
    try {
      await deleteIfPresent();
    } finally {
      await stopServer();
    }
  }
});
