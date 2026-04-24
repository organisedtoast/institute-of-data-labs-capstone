const roicService = require("./roicService");
const normalize = require("./normalizationService");
const { recalculateDerived } = require("../utils/derivedCalc");
const { mergeAnnualEntry } = require("./stockMergeService");
const { fetchOptionalEarningsCalls } = require("./optionalEarningsCallsService");

async function fetchWithContext(label, fetcher, tickerSymbol, fetchOptions) {
  try {
    return await fetcher(tickerSymbol, fetchOptions);
  } catch (error) {
    error.message = `ROIC ${label} fetch failed for ${tickerSymbol}: ${error.message}`;
    throw error;
  }
}

async function fetchRoicStockDatasets(tickerSymbol, options = {}) {
  const { years = null } = options;
  const annualFetchOptions = { years };

  // All of these ROIC datasets feed the same normalized stock document, so we
  // fetch them in parallel and keep import/refresh perfectly aligned.
  const [
    profile,
    perShare,
    profitability,
    prices,
    earnings,
    incomeStatement,
    balanceSheet,
    cashFlow,
    creditRatios,
    enterpriseValue,
    multiples,
  ] = await Promise.all([
    fetchWithContext("company profile", roicService.fetchCompanyProfile, tickerSymbol),
    fetchWithContext("annual per-share", roicService.fetchAnnualPerShare, tickerSymbol, annualFetchOptions),
    fetchWithContext("annual profitability", roicService.fetchAnnualProfitability, tickerSymbol, annualFetchOptions),
    fetchWithContext("historical prices", roicService.fetchStockPrices, tickerSymbol),
    fetchOptionalEarningsCalls(fetchWithContext, tickerSymbol),
    fetchWithContext("annual income statement", roicService.fetchAnnualIncomeStatement, tickerSymbol, annualFetchOptions),
    fetchWithContext("annual balance sheet", roicService.fetchAnnualBalanceSheet, tickerSymbol, annualFetchOptions),
    fetchWithContext("annual cash flow", roicService.fetchAnnualCashFlow, tickerSymbol, annualFetchOptions),
    fetchWithContext("annual credit ratios", roicService.fetchAnnualCreditRatios, tickerSymbol, annualFetchOptions),
    fetchWithContext("annual enterprise value", roicService.fetchAnnualEnterpriseValue, tickerSymbol, annualFetchOptions),
    fetchWithContext("annual multiples", roicService.fetchAnnualMultiples, tickerSymbol, annualFetchOptions),
  ]);

  return {
    profile,
    perShare,
    profitability,
    prices,
    earnings,
    incomeStatement,
    balanceSheet,
    cashFlow,
    creditRatios,
    enterpriseValue,
    multiples,
  };
}

async function buildFreshStockData({
  tickerSymbol,
  investmentCategory,
  years = null,
  importRangeYearsExplicit = false,
}) {
  const datasets = await fetchRoicStockDatasets(tickerSymbol, { years });

  return normalize.buildStockDocument({
    tickerSymbol,
    ...datasets,
    years,
    importRangeYearsExplicit,
    investmentCategory,
  });
}

function applyFreshStockDataToExistingStock(stock, freshData) {
  stock.sourceMeta = stock.sourceMeta || {};
  stock.companyName.roicValue = freshData.companyName.roicValue;
  if (!stock.companyName.userValue) {
    stock.companyName.effectiveValue = freshData.companyName.effectiveValue;
    stock.companyName.sourceOfTruth = freshData.companyName.sourceOfTruth;
  }

  stock.priceCurrency = freshData.priceCurrency;
  stock.reportingCurrency = freshData.reportingCurrency;
  stock.sourceMeta.importRangeYears = freshData.sourceMeta.importRangeYears;
  stock.sourceMeta.importRangeYearsExplicit = freshData.sourceMeta.importRangeYearsExplicit;
  stock.sourceMeta.annualHistoryFetchVersion = freshData.sourceMeta.annualHistoryFetchVersion;
  stock.sourceMeta.stockDataVersion = freshData.sourceMeta.stockDataVersion;
  stock.sourceMeta.roicEndpointsUsed = freshData.sourceMeta.roicEndpointsUsed;
  stock.sourceMeta.currencyDiagnostics = freshData.sourceMeta.currencyDiagnostics;

  for (const freshYear of freshData.annualData) {
    const existingYear = stock.annualData.find((row) => row.fiscalYear === freshYear.fiscalYear);
    if (existingYear) {
      mergeAnnualEntry(existingYear, freshYear);
    } else {
      stock.annualData.push(freshYear);
    }
  }

  stock.annualData.sort((left, right) => right.fiscalYear - left.fiscalYear);
  recalculateDerived(stock);
}

module.exports = {
  applyFreshStockDataToExistingStock,
  buildFreshStockData,
  fetchRoicStockDatasets,
};
