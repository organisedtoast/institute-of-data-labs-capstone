// This controller imports a stock by fetching the backend's supported ROIC
// datasets, normalizing them into the watchlist schema, and then upserting the
// resulting document into MongoDB.

const roicService = require("../services/roicService");
const { parseRequestedImportRangeYears } = require("../services/importRangeService");
const normalize = require("../services/normalizationService");
const WatchlistStock = require("../models/WatchlistStock");
const { assertActiveLensName } = require("../services/lensService");
const { fetchOptionalEarningsCalls } = require("../services/optionalEarningsCallsService");

async function fetchWithContext(label, fetcher, tickerSymbol, fetchOptions) {
  try {
    return await fetcher(tickerSymbol, fetchOptions);
  } catch (error) {
    error.message = `ROIC ${label} fetch failed for ${tickerSymbol}: ${error.message}`;
    throw error;
  }
}

async function importStock(req, res, next) {
  try {
    const { tickerSymbol, investmentCategory } = req.body;
    const {
      years,
      importRangeYearsExplicit,
    } = parseRequestedImportRangeYears(req.body.years);
    const annualFetchOptions = { years };

    if (!tickerSymbol) {
      return res.status(400).json({ error: "tickerSymbol is required" });
    }

    if (!investmentCategory || typeof investmentCategory !== "string" || investmentCategory.trim() === "") {
      return res.status(400).json({ error: "investmentCategory is required and must be a non-empty string." });
    }

    await assertActiveLensName(investmentCategory);

    // We fetch all supported annual datasets in parallel because they are
    // independent upstream requests that all feed the same normalization pass.
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

    const stockData = normalize.buildStockDocument({
      tickerSymbol,
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
      investmentCategory: investmentCategory.trim(),
    });

    const doc = await WatchlistStock.findOneAndUpdate(
      { tickerSymbol: tickerSymbol.toUpperCase() },
      stockData,
      { upsert: true, returnDocument: "after", runValidators: true }
    );

    res.status(201).json(doc);
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
}

module.exports = { importStock };
