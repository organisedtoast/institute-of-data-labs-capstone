// Purpose of this test file:
// This file protects three related backend rules:
// 1. how import-range `years` values are parsed and validated,
// 2. how annual history is capped or left uncapped in normalized stock
//    documents, and
// 3. how earnings-release dates are chosen from ROIC calls or, when needed,
//    from the fallback rule of `fiscalYearEndDate + 60 days`.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseRequestedImportRangeYears,
  resolveStoredImportRange,
} = require("../services/importRangeService");
const {
  ANNUAL_HISTORY_FETCH_VERSION,
  buildStockDocument,
  normalizeEarningsCalls,
  selectEarningsReleaseDate,
} = require("../services/normalizationService");

// Build a simple set of annual rows covering many fiscal years.
// This gives the tests predictable history to slice down when checking import
// range behavior.
function buildAnnualRows(startYear, endYear) {
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => {
    const fiscalYear = startYear + index;

    return {
      fiscalYear,
      fiscalYearEndDate: `${fiscalYear}-12-31`,
      shares_outstanding: 1000000000 + (index * 1000000),
      eps: 1 + index,
    };
  });
}

// Shared fixture for building a normalized stock document.
// Most tests in this file care about import-range and earnings-date behavior,
// so we keep the other datasets empty unless a specific test needs to override them.
function buildStockDocumentFixture(overrides = {}) {
  return buildStockDocument({
    tickerSymbol: "AAPL",
    profile: { companyName: "Apple Inc.", currency: "USD" },
    perShare: buildAnnualRows(2010, 2025),
    profitability: [],
    prices: [],
    earnings: [],
    incomeStatement: buildAnnualRows(2010, 2025).map((row) => ({
      fiscalYear: row.fiscalYear,
      fiscalYearEndDate: row.fiscalYearEndDate,
      currency: "GBP",
    })),
    balanceSheet: buildAnnualRows(2010, 2025).map((row) => ({
      fiscalYear: row.fiscalYear,
      fiscalYearEndDate: row.fiscalYearEndDate,
      currency: "GBP",
    })),
    cashFlow: [],
    creditRatios: [],
    enterpriseValue: [],
    multiples: [],
    investmentCategory: "Compounders",
    ...overrides,
  });
}

test("parseRequestedImportRangeYears treats omitted or null years as uncapped", () => {
  // If the caller omits `years`, the backend should interpret that as:
  // "import all available annual history", not as a validation error.
  assert.deepEqual(parseRequestedImportRangeYears(undefined), {
    years: null,
    importRangeYearsExplicit: false,
  });
  assert.deepEqual(parseRequestedImportRangeYears(null), {
    years: null,
    importRangeYearsExplicit: false,
  });
});

test("parseRequestedImportRangeYears preserves explicit positive integer caps", () => {
  // These values represent a user or caller explicitly asking for a capped
  // number of years, so the parser should preserve both the value and the fact
  // that the cap was intentional.
  assert.deepEqual(parseRequestedImportRangeYears(5), {
    years: 5,
    importRangeYearsExplicit: true,
  });
  assert.deepEqual(parseRequestedImportRangeYears("10"), {
    years: 10,
    importRangeYearsExplicit: true,
  });
});

test("parseRequestedImportRangeYears rejects invalid year caps", () => {
  // The import-range parser is strict: only positive integers are allowed.
  // These assertions protect the service from silent coercion of bad inputs.
  assert.throws(() => parseRequestedImportRangeYears(0), /positive integer/);
  assert.throws(() => parseRequestedImportRangeYears(-1), /positive integer/);
  assert.throws(() => parseRequestedImportRangeYears(1.5), /positive integer/);
  assert.throws(() => parseRequestedImportRangeYears("abc"), /positive integer/);
});

test("buildStockDocument keeps all available annual rows when years is omitted", () => {
  const stockDocument = buildStockDocumentFixture();

  // When the request is uncapped, the metadata should record that choice so
  // later refreshes know the full history was intended.
  assert.equal(stockDocument.sourceMeta.importRangeYears, null);
  assert.equal(stockDocument.sourceMeta.importRangeYearsExplicit, false);
  assert.equal(stockDocument.sourceMeta.annualHistoryFetchVersion, ANNUAL_HISTORY_FETCH_VERSION);

  // The fixture covers 2010 through 2025 inclusive, which is 16 rows.
  // The normalized annual history is sorted newest-first.
  assert.equal(stockDocument.annualData.length, 16);
  assert.equal(stockDocument.annualData[0].fiscalYear, 2025);
  assert.equal(stockDocument.annualData.at(-1).fiscalYear, 2010);
});

test("buildStockDocument limits annual rows when an explicit cap is provided", () => {
  // Here we simulate a caller explicitly asking for only 5 years of history.
  const stockDocument = buildStockDocumentFixture({
    years: 5,
    importRangeYearsExplicit: true,
  });

  assert.equal(stockDocument.sourceMeta.importRangeYears, 5);
  assert.equal(stockDocument.sourceMeta.importRangeYearsExplicit, true);
  assert.equal(stockDocument.sourceMeta.annualHistoryFetchVersion, ANNUAL_HISTORY_FETCH_VERSION);

  // With a 5-year cap, the newest five years should be kept: 2025 down to 2021.
  assert.equal(stockDocument.annualData.length, 5);
  assert.equal(stockDocument.annualData[0].fiscalYear, 2025);
  assert.equal(stockDocument.annualData.at(-1).fiscalYear, 2021);
});

test("buildStockDocument keeps ticker price currency separate from reporting currency and stores annual reporting currency", () => {
  const stockDocument = buildStockDocumentFixture();

  // Trading currency comes from the company profile, while reporting currency
  // comes from the statement rows. Keeping them separate avoids assuming every
  // stock reports in the same currency that it trades in.
  assert.equal(stockDocument.priceCurrency, "USD");
  assert.equal(stockDocument.reportingCurrency, "GBP");
  assert.equal(stockDocument.annualData[0].reportingCurrency, "GBP");
  assert.equal(stockDocument.annualData.at(-1).reportingCurrency, "GBP");
});

test("buildStockDocument records balance-sheet reporting-currency mismatches without changing the canonical value", () => {
  const stockDocument = buildStockDocumentFixture({
    balanceSheet: buildAnnualRows(2010, 2025).map((row) => ({
      fiscalYear: row.fiscalYear,
      fiscalYearEndDate: row.fiscalYearEndDate,
      currency: row.fiscalYear === 2025 ? "EUR" : "GBP",
    })),
  });

  // Income statement is the canonical writer. Balance sheet still gets checked
  // so import diagnostics can show a mismatch instead of silently hiding it.
  assert.equal(stockDocument.reportingCurrency, "GBP");
  assert.equal(stockDocument.sourceMeta.currencyDiagnostics.reportingCurrencySource, "incomeStatement");
  assert.equal(stockDocument.sourceMeta.currencyDiagnostics.balanceSheetMismatches.length, 1);
  assert.deepEqual(stockDocument.sourceMeta.currencyDiagnostics.balanceSheetMismatches[0], {
    fiscalYear: 2025,
    incomeStatementCurrency: "GBP",
    balanceSheetCurrency: "EUR",
  });
});

test("selectEarningsReleaseDate uses a same-fiscal-year ROIC call after year-end", () => {
  // `normalizeEarningsCalls` standardizes the shape before the selector runs.
  // The important part here is that the 2024 call belongs to fiscal year 2024
  // and happens after the 2024 year-end date.
  const normalizedCalls = normalizeEarningsCalls([
    { fiscalYear: 2024, date: "2025-02-20" },
    { fiscalYear: 2023, date: "2024-02-15" },
  ]);

  // Because there is a matching same-fiscal-year call after year end, the
  // selector should trust ROIC and use that date directly.
  assert.deepEqual(
    selectEarningsReleaseDate({
      fiscalYear: 2024,
      fiscalYearEndDate: "2024-12-31",
      normalizedCalls,
    }),
    {
      date: "2025-02-20",
      sourceOfTruth: "roic",
    }
  );
});

test("selectEarningsReleaseDate falls back to fiscalYearEndDate plus 60 days when only unrelated later calls exist", () => {
  // These calls happen later in time, but they belong to the wrong fiscal years.
  // The selector should not accidentally match them just because the dates look plausible.
  const normalizedCalls = normalizeEarningsCalls([
    { fiscalYear: 2023, date: "2025-02-20" },
    { fiscalYear: 2022, date: "2024-02-15" },
  ]);

  // With no valid call for fiscal year 2024, the backend should use the
  // system fallback rule: FY end + 60 days.
  assert.deepEqual(
    selectEarningsReleaseDate({
      fiscalYear: 2024,
      fiscalYearEndDate: "2024-12-31",
      normalizedCalls,
    }),
    {
      date: "2025-03-01",
      sourceOfTruth: "system",
    }
  );
});

test("selectEarningsReleaseDate falls back when the same-fiscal-year call is before year-end", () => {
  // A same-fiscal-year call that happens *before* year end is not a valid
  // earnings-release anchor for that completed fiscal year.
  const normalizedCalls = normalizeEarningsCalls([
    { fiscalYear: 2024, date: "2024-12-15" },
  ]);

  // So the selector should still use the fallback date, not the early call.
  assert.deepEqual(
    selectEarningsReleaseDate({
      fiscalYear: 2024,
      fiscalYearEndDate: "2024-12-31",
      normalizedCalls,
    }),
    {
      date: "2025-03-01",
      sourceOfTruth: "system",
    }
  );
});

test("selectEarningsReleaseDate falls back when calls have no usable fiscal year", () => {
  // If the calls are missing the fiscal-year linkage, the selector cannot
  // safely match them to a specific annual record.
  const normalizedCalls = normalizeEarningsCalls([
    { date: "2025-02-20" },
  ]);

  assert.deepEqual(
    selectEarningsReleaseDate({
      fiscalYear: 2024,
      fiscalYearEndDate: "2024-12-31",
      normalizedCalls,
    }),
    {
      date: "2025-03-01",
      sourceOfTruth: "system",
    }
  );
});

test("selectEarningsReleaseDate falls back when no calls exist", () => {
  // The empty-array case is the simplest proof that the fallback rule is a
  // first-class behavior, not an accident.
  assert.deepEqual(
    selectEarningsReleaseDate({
      fiscalYear: 2024,
      fiscalYearEndDate: "2024-12-31",
      normalizedCalls: [],
    }),
    {
      date: "2025-03-01",
      sourceOfTruth: "system",
    }
  );
});

test("resolveStoredImportRange preserves explicit caps and upgrades legacy default caps to uncapped", () => {
  // Modern documents store whether the year cap was explicit.
  // If it was explicit, refresh should keep using it.
  assert.deepEqual(resolveStoredImportRange({
    importRangeYears: 5,
    importRangeYearsExplicit: true,
  }), {
    years: 5,
    importRangeYearsExplicit: true,
  });

  assert.deepEqual(resolveStoredImportRange({
    importRangeYears: null,
    importRangeYearsExplicit: false,
  }), {
    years: null,
    importRangeYearsExplicit: false,
  });

  // Older documents may have a stored value like 10 without the explicit flag.
  // Those legacy default caps should now be treated as uncapped so refresh can
  // upgrade them to the newer full-history behavior.
  assert.deepEqual(resolveStoredImportRange({
    importRangeYears: 10,
  }), {
    years: null,
    importRangeYearsExplicit: false,
  });
});
