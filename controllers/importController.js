// This controller imports a stock by fetching the backend's supported ROIC
// datasets, normalizing them into the watchlist schema, and then upserting the
// resulting document into MongoDB.

const roicService = require("../services/roicService");
const { parseRequestedImportRangeYears } = require("../services/importRangeService");
const normalize = require("../services/normalizationService");
const WatchlistStock = require("../models/WatchlistStock");
const { assertActiveLensName } = require("../services/lensService");

async function fetchWithContext(label, fetcher, tickerSymbol) {
  try {
    return await fetcher(tickerSymbol);
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
      fetchWithContext("annual per-share", roicService.fetchAnnualPerShare, tickerSymbol),
      fetchWithContext("annual profitability", roicService.fetchAnnualProfitability, tickerSymbol),
      fetchWithContext("historical prices", roicService.fetchStockPrices, tickerSymbol),
      fetchWithContext("earnings calls", roicService.fetchEarningsCalls, tickerSymbol),
      fetchWithContext("annual income statement", roicService.fetchAnnualIncomeStatement, tickerSymbol),
      fetchWithContext("annual balance sheet", roicService.fetchAnnualBalanceSheet, tickerSymbol),
      fetchWithContext("annual cash flow", roicService.fetchAnnualCashFlow, tickerSymbol),
      fetchWithContext("annual credit ratios", roicService.fetchAnnualCreditRatios, tickerSymbol),
      fetchWithContext("annual enterprise value", roicService.fetchAnnualEnterpriseValue, tickerSymbol),
      fetchWithContext("annual multiples", roicService.fetchAnnualMultiples, tickerSymbol),
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
