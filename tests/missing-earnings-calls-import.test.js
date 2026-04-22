// Purpose of this test file:
// This file protects the business rule that missing ROIC earnings-call data is
// optional during watchlist import and refresh. If ROIC returns its specific
// "No earnings calls found" 404, the backend should still build the stock
// document and fall back to `fiscalYearEndDate + 60 days` for
// `earningsReleaseDate`. At the same time, real upstream failures such as 503s
// should still fail loudly instead of being silently ignored.

require("dotenv").config();

// We give this test file its own port so it does not collide with other test
// runs or with a locally running dev server.
process.env.PORT = "3103";

const assert = require("node:assert/strict");
const test = require("node:test");

const { startServer, stopServer } = require("../server");
const roicService = require("../services/roicService");

const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;
const TEST_CATEGORY = "Profitable Hi Growth";
const TEST_YEARS = 3;
const IMPORT_TICKER = "NOEARNINGS01";
const REFRESH_TICKER = "NOEARNINGS02";
const FAILURE_TICKER = "NOEARNINGS03";

// We temporarily replace the real ROIC methods with fake ones during this
// test. Keeping a copy of the originals lets us put everything back in the
// `finally` block so other tests are not affected.
const originalRoicService = {
  fetchCompanyProfile: roicService.fetchCompanyProfile,
  fetchAnnualPerShare: roicService.fetchAnnualPerShare,
  fetchAnnualProfitability: roicService.fetchAnnualProfitability,
  fetchAnnualBalanceSheet: roicService.fetchAnnualBalanceSheet,
  fetchAnnualIncomeStatement: roicService.fetchAnnualIncomeStatement,
  fetchAnnualCashFlow: roicService.fetchAnnualCashFlow,
  fetchAnnualCreditRatios: roicService.fetchAnnualCreditRatios,
  fetchAnnualEnterpriseValue: roicService.fetchAnnualEnterpriseValue,
  fetchAnnualMultiples: roicService.fetchAnnualMultiples,
  fetchStockPrices: roicService.fetchStockPrices,
  fetchEarningsCalls: roicService.fetchEarningsCalls,
};

// The next few helpers build small fake ROIC payloads.
// They give the import pipeline enough realistic-looking data to build a stock
// document, without depending on the live third-party API.
function buildPerShareRows() {
  return [
    { fiscalYear: 2024, fiscalYearEndDate: "2024-06-30", bs_sh_out: 1000, eps: 10, div_per_shr: 2, book_val_per_sh: 25 },
    { fiscalYear: 2023, fiscalYearEndDate: "2023-06-30", bs_sh_out: 980, eps: 9, div_per_shr: 1.8, book_val_per_sh: 24 },
    { fiscalYear: 2022, fiscalYearEndDate: "2022-06-30", bs_sh_out: 960, eps: 8, div_per_shr: 1.5, book_val_per_sh: 23 },
  ];
}

function buildProfitabilityRows() {
  return [
    { fiscalYear: 2024, return_on_inv_capital: 0.31 },
    { fiscalYear: 2023, return_on_inv_capital: 0.29 },
    { fiscalYear: 2022, return_on_inv_capital: 0.27 },
  ];
}

function buildBalanceSheetRows() {
  return [
    { fiscalYear: 2024, bs_c_and_ce_and_sti_detailed: 100, short_and_long_term_debt: 300, bs_tot_asset: 1200, bs_tot_liab: 400, bs_total_equity: 800 },
    { fiscalYear: 2023, bs_c_and_ce_and_sti_detailed: 90, short_and_long_term_debt: 260, bs_tot_asset: 1100, bs_tot_liab: 380, bs_total_equity: 720 },
    { fiscalYear: 2022, bs_c_and_ce_and_sti_detailed: 80, short_and_long_term_debt: 220, bs_tot_asset: 1000, bs_tot_liab: 360, bs_total_equity: 640 },
  ];
}

function buildIncomeStatementRows() {
  return [
    {
      fiscalYear: 2024,
      is_sales_revenue_turnover: 1000,
      is_gross_profit: 250,
      ebitda: 300,
      depreciation_and_amortization: 40,
      is_oper_income: 260,
      net_interest_expense: 20,
      pretax_income: 240,
      income_tax_expense: 30,
      is_net_income: 210,
    },
    {
      fiscalYear: 2023,
      is_sales_revenue_turnover: 900,
      is_gross_profit: 220,
      ebitda: 260,
      depreciation_and_amortization: 35,
      is_oper_income: 225,
      net_interest_expense: 18,
      pretax_income: 207,
      income_tax_expense: 28,
      is_net_income: 179,
    },
    {
      fiscalYear: 2022,
      is_sales_revenue_turnover: 800,
      is_gross_profit: 200,
      ebitda: 220,
      depreciation_and_amortization: 30,
      is_oper_income: 190,
      net_interest_expense: 16,
      pretax_income: 174,
      income_tax_expense: 26,
      is_net_income: 148,
    },
  ];
}

function buildCashFlowRows() {
  return [
    { fiscalYear: 2024, cf_cap_expenditures: 60, free_cash_flow: 140 },
    { fiscalYear: 2023, cf_cap_expenditures: 55, free_cash_flow: 120 },
    { fiscalYear: 2022, cf_cap_expenditures: 50, free_cash_flow: 100 },
  ];
}

function buildMultiplesRows() {
  return [
    { fiscalYear: 2024, pe_ratio: 20 },
    { fiscalYear: 2023, pe_ratio: 18 },
    { fiscalYear: 2022, pe_ratio: 17 },
  ];
}

function buildPriceRows() {
  return [
    { date: "2022-08-30", close: 160 },
    { date: "2023-08-30", close: 180 },
    { date: "2024-08-30", close: 200 },
  ];
}

// This mimics the exact ROIC error shape we saw in production for stocks that
// simply have no earnings-call history. The new business rule should treat
// this as optional data, not as a fatal import failure.
function buildMissingEarningsCallsError() {
  const error = new Error("Request failed with status code 404");
  error.response = {
    status: 404,
    data: { error: "No earnings calls found" },
  };
  return error;
}

// This represents a real upstream problem. We still expect the backend to fail
// in this case, because the fix is only for the special "missing data" 404.
function buildUpstreamFailureError() {
  const error = new Error("Request failed with status code 503");
  error.response = {
    status: 503,
    data: { error: "Upstream earnings service unavailable" },
  };
  return error;
}

// Instead of mocking the whole server, we swap out just the ROIC service
// methods. That gives us a realistic end-to-end backend test while still
// keeping the input data fully under our control.
function installRoicStub({ earningsError }) {
  Object.assign(roicService, {
    async fetchCompanyProfile() {
      return {
        companyName: "Stubbed Missing Earnings Company",
        priceCurrency: "USD",
      };
    },
    async fetchAnnualPerShare() {
      return buildPerShareRows();
    },
    async fetchAnnualProfitability() {
      return buildProfitabilityRows();
    },
    async fetchAnnualBalanceSheet() {
      return buildBalanceSheetRows();
    },
    async fetchAnnualIncomeStatement() {
      return buildIncomeStatementRows();
    },
    async fetchAnnualCashFlow() {
      return buildCashFlowRows();
    },
    async fetchAnnualCreditRatios() {
      return [];
    },
    async fetchAnnualEnterpriseValue() {
      return [];
    },
    async fetchAnnualMultiples() {
      return buildMultiplesRows();
    },
    async fetchStockPrices() {
      return buildPriceRows();
    },
    async fetchEarningsCalls() {
      // Each test chooses which earnings-call error it wants to simulate.
      throw earningsError;
    },
  });
}

// Always restore the real ROIC methods after each test. This avoids cross-test
// pollution, where one fake implementation accidentally leaks into another file.
function restoreRoicService() {
  Object.assign(roicService, originalRoicService);
}

// Small helper for calling our real Express routes and decoding JSON.
// Returning `{ status, ok, body }` keeps each test easy to read.
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
    // Raw text is easier to debug when a test fails unexpectedly.
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

// Cleanup helper so each test starts from a known MongoDB state.
// Deleting first prevents a previous failed run from breaking the next run.
async function deleteIfPresent(ticker) {
  const response = await requestJson(`/api/watchlist/${ticker}`, {
    method: "DELETE",
  });

  if (response.status !== 200 && response.status !== 404) {
    assert.fail(`Cleanup delete failed for ${ticker}: ${JSON.stringify(response.body, null, 2)}`);
  }
}

// This is the heart of the regression test.
// We are not only checking that import succeeds; we are proving that the
// backend stored the fallback earnings-release dates produced by
// "fiscal year end + 60 days" and marked them as system-generated.
function assertFallbackDates(stockDocument) {
  assert.equal(stockDocument.annualData.length, TEST_YEARS);

  // Convert the array into a Map so we can look up each fiscal year directly
  // instead of depending on array position.
  const fallbackByYear = new Map(
    stockDocument.annualData.map((annualRow) => [
      annualRow.fiscalYear,
      {
        date: annualRow.earningsReleaseDate?.effectiveValue,
        sourceOfTruth: annualRow.earningsReleaseDate?.sourceOfTruth,
      },
    ])
  );

  assert.deepEqual(fallbackByYear.get(2024), {
    date: "2024-08-29",
    sourceOfTruth: "system",
  });
  assert.deepEqual(fallbackByYear.get(2023), {
    date: "2023-08-29",
    sourceOfTruth: "system",
  });
  assert.deepEqual(fallbackByYear.get(2022), {
    date: "2022-08-29",
    sourceOfTruth: "system",
  });
}

test("import tolerates the ROIC missing-earnings-calls 404 and stores fallback release dates", { concurrency: false }, async () => {
  // Simulate the production case: all other ROIC data exists, but the
  // earnings-call endpoint returns "No earnings calls found".
  installRoicStub({ earningsError: buildMissingEarningsCallsError() });
  await startServer();

  try {
    await deleteIfPresent(IMPORT_TICKER);

    // Hit the real import route, not the controller directly.
    // That proves the whole request path works: route -> controller -> service
    // -> normalization -> MongoDB write.
    const response = await requestJson("/api/watchlist/import", {
      method: "POST",
      body: JSON.stringify({
        tickerSymbol: IMPORT_TICKER,
        investmentCategory: TEST_CATEGORY,
        years: TEST_YEARS,
      }),
    });

    assert.equal(response.status, 201, JSON.stringify(response.body, null, 2));
    assert.equal(response.body.tickerSymbol, IMPORT_TICKER);
    assertFallbackDates(response.body);
  } finally {
    // `finally` always runs, even if an assertion fails. That makes test cleanup
    // much more reliable for beginners than trying to remember cleanup manually.
    await deleteIfPresent(IMPORT_TICKER);
    await stopServer();
    restoreRoicService();
  }
});

test("refresh also tolerates missing earnings calls and keeps fallback release dates", { concurrency: false }, async () => {
  installRoicStub({ earningsError: buildMissingEarningsCallsError() });
  await startServer();

  try {
    await deleteIfPresent(REFRESH_TICKER);

    // First import the stock so there is an existing MongoDB document to refresh.
    const importResponse = await requestJson("/api/watchlist/import", {
      method: "POST",
      body: JSON.stringify({
        tickerSymbol: REFRESH_TICKER,
        investmentCategory: TEST_CATEGORY,
        years: TEST_YEARS,
      }),
    });
    assert.equal(importResponse.status, 201, JSON.stringify(importResponse.body, null, 2));

    // Then call the real refresh route and confirm it uses the same
    // missing-earnings fallback behavior as import.
    const refreshResponse = await requestJson(`/api/watchlist/${REFRESH_TICKER}/refresh`, {
      method: "POST",
    });

    assert.equal(refreshResponse.status, 200, JSON.stringify(refreshResponse.body, null, 2));
    assertFallbackDates(refreshResponse.body);
  } finally {
    await deleteIfPresent(REFRESH_TICKER);
    await stopServer();
    restoreRoicService();
  }
});

test("import still fails when earnings calls break for a real upstream reason", { concurrency: false }, async () => {
  // This test protects us from making the fix too broad.
  // We only want to ignore the specific "missing earnings calls" 404, not every
  // possible error from the upstream endpoint.
  installRoicStub({ earningsError: buildUpstreamFailureError() });
  await startServer();

  try {
    await deleteIfPresent(FAILURE_TICKER);

    const response = await requestJson("/api/watchlist/import", {
      method: "POST",
      body: JSON.stringify({
        tickerSymbol: FAILURE_TICKER,
        investmentCategory: TEST_CATEGORY,
        years: TEST_YEARS,
      }),
    });

    assert.equal(response.status, 500, JSON.stringify(response.body, null, 2));
    assert.equal(response.body.error, "Internal server error");
    // The details should still mention the earnings-calls fetch path so the
    // error remains debuggable for us during development.
    assert.match(response.body.details, /earnings calls/i);
  } finally {
    await deleteIfPresent(FAILURE_TICKER);
    await stopServer();
    restoreRoicService();
  }
});
