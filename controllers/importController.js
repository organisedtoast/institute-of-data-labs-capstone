// This controller file handles the initial import of a stock from ROIC.
// It first calls the service layer being roicService to fetch the raw data
// Then it calls the normalizationService to transform it into our schema shape
// Finally, it upserts the document into MongoDB using the WatchlistStock model.

const roicService = require("../services/roicService");
const normalize = require("../services/normalizationService");
const WatchlistStock = require("../models/WatchlistStock");

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
    const { tickerSymbol, investmentCategory, years = 10 } = req.body;

    if (!tickerSymbol) {
      return res.status(400).json({ error: "tickerSymbol is required" });
    }
 
    // 1. Fetch raw data from all ROIC endpoints
    const [profile, perShare, profitability, prices, earnings] =
      await Promise.all([
        fetchWithContext("company profile", roicService.fetchCompanyProfile, tickerSymbol),
        fetchWithContext("annual per-share", roicService.fetchAnnualPerShare, tickerSymbol),
        fetchWithContext("annual profitability", roicService.fetchAnnualProfitability, tickerSymbol),
        fetchWithContext("historical prices", roicService.fetchStockPrices, tickerSymbol),
        fetchWithContext("earnings calls", roicService.fetchEarningsCalls, tickerSymbol),
      ]);
 
    // 2. Normalise into our schema shape
    const stockData = normalize.buildStockDocument({
      tickerSymbol, profile, perShare,
      profitability, prices, earnings,
      years, investmentCategory,
    });
 
    // 3. Upsert: create or update the document
    const doc = await WatchlistStock.findOneAndUpdate(
      { tickerSymbol: tickerSymbol.toUpperCase() },
      stockData,
      { upsert: true, returnDocument: "after", runValidators: true }
    );
 
    res.status(201).json(doc);
  } catch (error) {
    next(error);
  }
}
 
module.exports = { importStock };
