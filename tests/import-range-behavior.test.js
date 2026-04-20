const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseRequestedImportRangeYears,
  resolveStoredImportRange,
} = require("../services/importRangeService");
const { buildStockDocument } = require("../services/normalizationService");

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

function buildStockDocumentFixture(overrides = {}) {
  return buildStockDocument({
    tickerSymbol: "AAPL",
    profile: { companyName: "Apple Inc.", priceCurrency: "USD" },
    perShare: buildAnnualRows(2010, 2025),
    profitability: [],
    prices: [],
    earnings: [],
    incomeStatement: [],
    balanceSheet: [],
    cashFlow: [],
    creditRatios: [],
    enterpriseValue: [],
    multiples: [],
    investmentCategory: "Compounders",
    ...overrides,
  });
}

test("parseRequestedImportRangeYears treats omitted or null years as uncapped", () => {
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
  assert.throws(() => parseRequestedImportRangeYears(0), /positive integer/);
  assert.throws(() => parseRequestedImportRangeYears(-1), /positive integer/);
  assert.throws(() => parseRequestedImportRangeYears(1.5), /positive integer/);
  assert.throws(() => parseRequestedImportRangeYears("abc"), /positive integer/);
});

test("buildStockDocument keeps all available annual rows when years is omitted", () => {
  const stockDocument = buildStockDocumentFixture();

  assert.equal(stockDocument.sourceMeta.importRangeYears, null);
  assert.equal(stockDocument.sourceMeta.importRangeYearsExplicit, false);
  assert.equal(stockDocument.annualData.length, 16);
  assert.equal(stockDocument.annualData[0].fiscalYear, 2025);
  assert.equal(stockDocument.annualData.at(-1).fiscalYear, 2010);
});

test("buildStockDocument limits annual rows when an explicit cap is provided", () => {
  const stockDocument = buildStockDocumentFixture({
    years: 5,
    importRangeYearsExplicit: true,
  });

  assert.equal(stockDocument.sourceMeta.importRangeYears, 5);
  assert.equal(stockDocument.sourceMeta.importRangeYearsExplicit, true);
  assert.equal(stockDocument.annualData.length, 5);
  assert.equal(stockDocument.annualData[0].fiscalYear, 2025);
  assert.equal(stockDocument.annualData.at(-1).fiscalYear, 2021);
});

test("resolveStoredImportRange preserves explicit caps and upgrades legacy default caps to uncapped", () => {
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

  assert.deepEqual(resolveStoredImportRange({
    importRangeYears: 10,
  }), {
    years: null,
    importRangeYearsExplicit: false,
  });
});
