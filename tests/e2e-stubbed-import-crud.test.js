// This end-to-end harness uses fake ROIC responses but the real Express app,
// real MongoDB writes, and real normalization logic. It is the safest place to
// prove the grouped schema, override routes, and derived calculations all work
// together without depending on the live third-party API.

require("dotenv").config();

process.env.PORT = "3101";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ANNUAL_HISTORY_FETCH_VERSION } = require("../services/normalizationService");

const TEST_TICKER = "STUBLENS01";
const TEST_CATEGORY = "Profitable Hi Growth";
const TEST_YEARS = 3;
const TEST_COMPANY_OVERRIDE = "Stubbed Company Override";
const BASE_URL = `http://127.0.0.1:${process.env.PORT}`;

const EXPECTED_ROIC_ENDPOINTS = [
  "/v2/company/profile/{identifier}",
  "/v2/fundamental/per-share/{identifier}",
  "/v2/company/earnings-calls/list/{identifier}",
  "/v2/stock-prices/{identifier}",
  "/v2/fundamental/income-statement/{identifier}",
  "/v2/fundamental/balance-sheet/{identifier}",
  "/v2/fundamental/cash-flow/{identifier}",
  "/v2/fundamental/ratios/profitability/{identifier}",
  "/v2/fundamental/ratios/credit/{identifier}",
  "/v2/fundamental/enterprise-value/{identifier}",
  "/v2/fundamental/multiples/{identifier}",
];
const annualFetchCalls = [];

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
    { date: "2022-09-29", close: 160 },
    { date: "2023-08-16", close: 180 },
    { date: "2024-09-30", close: 200 },
  ];
}

function buildEarningsRows() {
  return [
    { date: "2023-08-15", fiscalYear: 2023 },
    { date: "2022-08-15", fiscalYear: 2022 },
  ];
}

const stubbedRoicService = {
  async fetchCompanyProfile() {
    return {
      companyName: "Stubbed Test Company",
      priceCurrency: "USD",
    };
  },
  async fetchAnnualPerShare(ticker, options) {
    annualFetchCalls.push({ method: "fetchAnnualPerShare", ticker, options });
    return buildPerShareRows();
  },
  async fetchAnnualProfitability(ticker, options) {
    annualFetchCalls.push({ method: "fetchAnnualProfitability", ticker, options });
    return buildProfitabilityRows();
  },
  async fetchAnnualBalanceSheet(ticker, options) {
    annualFetchCalls.push({ method: "fetchAnnualBalanceSheet", ticker, options });
    return buildBalanceSheetRows();
  },
  async fetchAnnualIncomeStatement(ticker, options) {
    annualFetchCalls.push({ method: "fetchAnnualIncomeStatement", ticker, options });
    return buildIncomeStatementRows();
  },
  async fetchAnnualCashFlow(ticker, options) {
    annualFetchCalls.push({ method: "fetchAnnualCashFlow", ticker, options });
    return buildCashFlowRows();
  },
  async fetchAnnualCreditRatios(ticker, options) {
    annualFetchCalls.push({ method: "fetchAnnualCreditRatios", ticker, options });
    return [];
  },
  async fetchAnnualEnterpriseValue(ticker, options) {
    annualFetchCalls.push({ method: "fetchAnnualEnterpriseValue", ticker, options });
    return [];
  },
  async fetchAnnualMultiples(ticker, options) {
    annualFetchCalls.push({ method: "fetchAnnualMultiples", ticker, options });
    return buildMultiplesRows();
  },
  async fetchStockPrices() { return buildPriceRows(); },
  async fetchEarningsCalls() { return buildEarningsRows(); },
  async searchRoicByCompanyName() { return []; },
};

const roicService = require("../services/roicService");
Object.assign(roicService, stubbedRoicService);

const { startServer, stopServer } = require("../server");

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
    // Returning raw text on parse failure makes debugging easier for beginners.
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

function buildFailureMessage(step, response) {
  return [
    `${step} failed.`,
    `Status: ${response.status}`,
    `Body: ${JSON.stringify(response.body, null, 2)}`,
  ].join("\n");
}

async function deleteIfPresent() {
  const response = await requestJson(`/api/watchlist/${TEST_TICKER}`, { method: "DELETE" });
  if (response.status !== 200 && response.status !== 404) {
    assert.fail(buildFailureMessage("Cleanup delete", response));
  }
}

test("stubbed import populates grouped annual fields, placeholders, overrides, and lens-backed category data", async () => {
  await startServer();

  try {
    annualFetchCalls.length = 0;
    await deleteIfPresent();

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

    assert.equal(importedDoc.tickerSymbol, TEST_TICKER);
    assert.equal(importedDoc.investmentCategory, TEST_CATEGORY);
    assert.equal(importedDoc.sourceMeta.importRangeYears, TEST_YEARS);
    assert.equal(importedDoc.sourceMeta.annualHistoryFetchVersion, ANNUAL_HISTORY_FETCH_VERSION);
    assert.deepEqual(importedDoc.sourceMeta.roicEndpointsUsed, EXPECTED_ROIC_ENDPOINTS);
    assert.equal(annualFetchCalls.length, 8);
    annualFetchCalls.forEach((fetchCall) => {
      assert.equal(fetchCall.ticker, TEST_TICKER);
      assert.deepEqual(fetchCall.options, { years: TEST_YEARS });
    });
    assert.equal(importedDoc.companyName.roicValue, "Stubbed Test Company");
    assert.equal(importedDoc.priceCurrency, "USD");
    assert.equal(importedDoc.annualData.length, TEST_YEARS);

    const firstAnnualEntry = importedDoc.annualData[0];
    assert.equal(firstAnnualEntry.fiscalYear, 2024);
    assert.equal(firstAnnualEntry.fiscalYearEndDate, "2024-06-30");
    assert.equal(firstAnnualEntry.earningsReleaseDate.effectiveValue, "2024-09-28");
    assert.equal(firstAnnualEntry.base.sharePrice.effectiveValue, 200);
    assert.equal(firstAnnualEntry.base.marketCap.effectiveValue, 200000);
    assert.equal(firstAnnualEntry.balanceSheet.netDebtOrCash.effectiveValue, 200);
    assert.equal(firstAnnualEntry.balanceSheet.enterpriseValueTrailing.effectiveValue, 200200);
    assert.equal(firstAnnualEntry.incomeStatement.codb.effectiveValue, 50);
    assert.equal(firstAnnualEntry.ownerEarningsBridge.deemedMaintenanceCapex.effectiveValue, 40);
    assert.equal(firstAnnualEntry.ownerEarningsBridge.ownerEarnings.effectiveValue, 210);
    assert.equal(firstAnnualEntry.valuationMultiples.priceToNta.effectiveValue, 8);
    assert.equal(firstAnnualEntry.valuationMultiples.dividendPayout.effectiveValue, 0.2);
    assert.equal(firstAnnualEntry.epsAndDividends.dyTrailing.effectiveValue, 0.01);

    // Forecast and top-level placeholders should exist even before any user
    // enters data. That proves the schema was expanded up front, not only when
    // the frontend someday decides to render those fields.
    assert.equal(firstAnnualEntry.base.sharePrice.sourceOfTruth, "roic");
    assert.equal(importedDoc.forecastData.fy1.sharesOnIssue.sourceOfTruth, "system");
    assert.equal(importedDoc.growthForecasts.revenueCagr3y.sourceOfTruth, "system");
    assert.equal(importedDoc.analystRevisions.revenueFy1Last1m.sourceOfTruth, "system");

    const annualOverrideResponse = await requestJson(`/api/watchlist/${TEST_TICKER}/annual/2024/overrides`, {
      method: "PATCH",
      body: JSON.stringify({
        base: { sharePrice: 250 },
        balanceSheet: { cash: 110 },
      }),
    });
    assert.equal(annualOverrideResponse.status, 200, buildFailureMessage("Annual override", annualOverrideResponse));
    assert.equal(annualOverrideResponse.body.annualData[0].base.sharePrice.userValue, 250);
    assert.equal(annualOverrideResponse.body.annualData[0].base.sharePrice.sourceOfTruth, "user");
    assert.equal(annualOverrideResponse.body.annualData[0].base.marketCap.effectiveValue, 250000);

    const forecastOverrideResponse = await requestJson(`/api/watchlist/${TEST_TICKER}/forecast/fy1/overrides`, {
      method: "PATCH",
      body: JSON.stringify({
        sharesOnIssue: 1100,
        eps: 11,
        dps: 2.2,
        ebit: 260,
      }),
    });
    assert.equal(forecastOverrideResponse.status, 200, buildFailureMessage("Forecast override", forecastOverrideResponse));
    assert.equal(forecastOverrideResponse.body.forecastData.fy1.sharesOnIssue.sourceOfTruth, "user");
    assert.equal(forecastOverrideResponse.body.forecastData.fy1.marketCap.effectiveValue, 275000);
      assert.equal(forecastOverrideResponse.body.forecastData.fy1.enterpriseValue.effectiveValue, 275190);
    assert.ok(forecastOverrideResponse.body.forecastData.fy1.pe.effectiveValue);

    const topLevelOverrideResponse = await requestJson(`/api/watchlist/${TEST_TICKER}/metrics/overrides`, {
      method: "PATCH",
      body: JSON.stringify({
        growthForecasts: { revenueCagr3y: 0.15 },
        analystRevisions: { revenueFy1Last1m: 2 },
      }),
    });
    assert.equal(topLevelOverrideResponse.status, 200, buildFailureMessage("Top-level metric override", topLevelOverrideResponse));
    assert.equal(topLevelOverrideResponse.body.growthForecasts.revenueCagr3y.effectiveValue, 0.15);
    assert.equal(topLevelOverrideResponse.body.analystRevisions.revenueFy1Last1m.effectiveValue, 2);

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
    assert.equal(patchCompanyResponse.body.companyName.effectiveValue, TEST_COMPANY_OVERRIDE);

    const refreshResponse = await requestJson(`/api/watchlist/${TEST_TICKER}/refresh`, {
      method: "POST",
    });
    assert.equal(refreshResponse.status, 200, buildFailureMessage("Refresh imported ticker", refreshResponse));
    assert.equal(refreshResponse.body.sourceMeta.annualHistoryFetchVersion, ANNUAL_HISTORY_FETCH_VERSION);
    assert.equal(annualFetchCalls.length, 16);
    annualFetchCalls.slice(8).forEach((fetchCall) => {
      assert.equal(fetchCall.ticker, TEST_TICKER);
      assert.deepEqual(fetchCall.options, { years: TEST_YEARS });
    });
    assert.equal(refreshResponse.body.companyName.sourceOfTruth, "user");
    assert.equal(refreshResponse.body.annualData[0].base.sharePrice.sourceOfTruth, "user");
    assert.equal(refreshResponse.body.forecastData.fy1.sharesOnIssue.sourceOfTruth, "user");
    assert.equal(refreshResponse.body.growthForecasts.revenueCagr3y.sourceOfTruth, "user");

    const getOneResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`);
    assert.equal(getOneResponse.status, 200, buildFailureMessage("Get imported ticker", getOneResponse));

    const listResponse = await requestJson("/api/watchlist");
    assert.equal(listResponse.status, 200, buildFailureMessage("List watchlist", listResponse));
    assert.ok(listResponse.body.some((stock) => stock.tickerSymbol === TEST_TICKER));

    const deleteResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 200, buildFailureMessage("Delete imported ticker", deleteResponse));

    const getAfterDeleteResponse = await requestJson(`/api/watchlist/${TEST_TICKER}`);
    assert.equal(getAfterDeleteResponse.status, 404, buildFailureMessage("Get deleted ticker", getAfterDeleteResponse));
  } finally {
    try {
      await deleteIfPresent();
    } finally {
      await stopServer();
    }
  }
});
