// Refresh re-fetches ROIC-backed fields without destroying user overrides.
// It updates imported/default values, then reruns backend formulas so derived
// fields stay in sync with any user-entered corrections.

const roicService = require("../services/roicService");
const { resolveStoredImportRange } = require("../services/importRangeService");
const normalize = require("../services/normalizationService");
const WatchlistStock = require("../models/WatchlistStock");
const { recalculateDerived } = require("../utils/derivedCalc");
const { mergeAnnualEntry } = require("../services/stockMergeService");

async function fetchWithContext(label, fetcher, tickerSymbol, fetchOptions) {
  try {
    return await fetcher(tickerSymbol, fetchOptions);
  } catch (error) {
    error.message = `ROIC ${label} fetch failed for ${tickerSymbol}: ${error.message}`;
    throw error;
  }
}

async function refreshStock(req, res, next) {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const stock = await WatchlistStock.findOne({ tickerSymbol: ticker });
    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    const {
      years,
      importRangeYearsExplicit,
    } = resolveStoredImportRange(stock.sourceMeta);
    const annualFetchOptions = { years };

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
      fetchWithContext("company profile", roicService.fetchCompanyProfile, ticker),
      fetchWithContext("annual per-share", roicService.fetchAnnualPerShare, ticker, annualFetchOptions),
      fetchWithContext("annual profitability", roicService.fetchAnnualProfitability, ticker, annualFetchOptions),
      fetchWithContext("historical prices", roicService.fetchStockPrices, ticker),
      fetchWithContext("earnings calls", roicService.fetchEarningsCalls, ticker),
      fetchWithContext("annual income statement", roicService.fetchAnnualIncomeStatement, ticker, annualFetchOptions),
      fetchWithContext("annual balance sheet", roicService.fetchAnnualBalanceSheet, ticker, annualFetchOptions),
      fetchWithContext("annual cash flow", roicService.fetchAnnualCashFlow, ticker, annualFetchOptions),
      fetchWithContext("annual credit ratios", roicService.fetchAnnualCreditRatios, ticker, annualFetchOptions),
      fetchWithContext("annual enterprise value", roicService.fetchAnnualEnterpriseValue, ticker, annualFetchOptions),
      fetchWithContext("annual multiples", roicService.fetchAnnualMultiples, ticker, annualFetchOptions),
    ]);

    const freshData = normalize.buildStockDocument({
      tickerSymbol: ticker,
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
      years,
      importRangeYearsExplicit,
      investmentCategory: stock.investmentCategory,
    });

    stock.companyName.roicValue = freshData.companyName.roicValue;
    if (!stock.companyName.userValue) {
      stock.companyName.effectiveValue = freshData.companyName.effectiveValue;
      stock.companyName.sourceOfTruth = freshData.companyName.sourceOfTruth;
    }

    stock.priceCurrency = freshData.priceCurrency;
    stock.sourceMeta.importRangeYears = freshData.sourceMeta.importRangeYears;
    stock.sourceMeta.importRangeYearsExplicit = freshData.sourceMeta.importRangeYearsExplicit;
    stock.sourceMeta.annualHistoryFetchVersion = freshData.sourceMeta.annualHistoryFetchVersion;
    stock.sourceMeta.roicEndpointsUsed = freshData.sourceMeta.roicEndpointsUsed;

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

    stock.sourceMeta.lastRefreshAt = new Date();
    await stock.save();
    res.json(stock);
  } catch (error) {
    next(error);
  }
}

module.exports = { refreshStock };
