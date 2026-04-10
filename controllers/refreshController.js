// This controller file re-fetches data from ROIC without destroying user overrides.

// The critical rule: refresh updates roicValue but never touches userValue. 
// Then effectiveValue is recalculated.
// This allows users to keep their overrides intact while still benefiting from updated ROIC data.
 
const roicService = require("../services/roicService");
const normalize = require("../services/normalizationService");
const WatchlistStock = require("../models/WatchlistStock");
const { resolveEffectiveValue } = require("../utils/effectiveValue");
const { recalculateDerived } = require("../utils/derivedCalc");

async function fetchWithContext(label, fetcher, tickerSymbol) {
  try {
    return await fetcher(tickerSymbol);
  } catch (error) {
    error.message = `ROIC ${label} fetch failed for ${tickerSymbol}: ${error.message}`;
    throw error;
  }
}
 
async function refreshStock(req, res, next) {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const stock = await WatchlistStock.findOne({ tickerSymbol: ticker });
    if (!stock) return res.status(404).json({ error: "Stock not found" });
 
    // Fetch fresh data from ROIC
    const [profile, perShare, profitability, prices, earnings] =
      await Promise.all([
        fetchWithContext("company profile", roicService.fetchCompanyProfile, ticker),
        fetchWithContext("annual per-share", roicService.fetchAnnualPerShare, ticker),
        fetchWithContext("annual profitability", roicService.fetchAnnualProfitability, ticker),
        fetchWithContext("historical prices", roicService.fetchStockPrices, ticker),
        fetchWithContext("earnings calls", roicService.fetchEarningsCalls, ticker),
      ]);
 
    const freshData = normalize.buildStockDocument({
      tickerSymbol: ticker, profile, perShare,
      profitability, prices, earnings,
      years: stock.sourceMeta.importRangeYears,
    });
 
    // Merge: update roicValue, preserve userValue
    for (const freshYear of freshData.annualData) {
      const existing = stock.annualData.find(
        (y) => y.fiscalYear === freshYear.fiscalYear
      );
      if (existing) {
        // Update only roicValue for each metric
        for (const metric of [
          "stockPrice", "sharesOutstanding",
          "returnOnInvestedCapital", "marketAnchorDate",
        ]) {
          existing[metric].roicValue = freshYear[metric].roicValue;
          const resolved = resolveEffectiveValue(existing[metric]);
          existing[metric].effectiveValue = resolved.effectiveValue;
          existing[metric].sourceOfTruth = resolved.sourceOfTruth;
        }
        recalculateDerived(existing);
      }
    }
 
    stock.sourceMeta.lastRefreshAt = new Date();
    await stock.save();
    res.json(stock);
  } catch (err) { next(err); }
}
 
module.exports = { refreshStock };
