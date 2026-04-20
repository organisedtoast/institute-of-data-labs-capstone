const roicService = require("../services/roicService");
const stockSearchService = require("../services/stockSearchService");

// This controller owns the read-only stock lookup API.
// Its job is to validate incoming request data, call the correct service, and
// return a clean JSON response. It does not read from MongoDB or create
// watchlist records because lookup and persistence are separate concerns.

// GET /api/stock-prices/:ticker
// This endpoint returns live price history from ROIC for charting and preview
// flows. Looking up prices should never create or update a Mongo document.
async function getStockPrices(req, res) {
  const identifier = String(req.params.ticker || "").trim().toUpperCase();
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate.trim() : "";
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate.trim() : "";

  if (!identifier) {
    return res.status(400).json({
      message: "Ticker symbol is required.",
    });
  }

  // The controller only validates the month filters here.
  // ROIC-specific date conversion and price normalization stay inside
  // roicService so the same rules are not duplicated across the app.
  if ((startDate && !roicService.isValidMonthString(startDate)) || (endDate && !roicService.isValidMonthString(endDate))) {
    return res.status(400).json({
      message: "startDate and endDate must use the YYYY-MM format.",
    });
  }

  if (startDate && endDate && startDate > endDate) {
    return res.status(400).json({
      message: "startDate must be earlier than or equal to endDate.",
    });
  }

  try {
    const prices = await roicService.fetchStockPrices(identifier, {
      startDate,
      endDate,
      order: startDate || endDate ? "ASC" : "DESC",
    });

    return res.json({
      identifier,
      prices,
    });
  } catch (error) {
    const statusCode = error.response?.status || 502;
    return res.status(statusCode).json({
      message: `Unable to load stock price data for ${identifier}.`,
      details: error.response?.data || error.message,
    });
  }
}

// GET /api/stocks/search
// This endpoint returns live search suggestions from ROIC. The heavy lifting
// lives in stockSearchService because that service owns ranking, suffix
// probing, de-duplication, and other search-specific behavior.
async function searchStocks(req, res) {
  const rawQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!rawQuery) {
    return res.status(400).json({
      message: "Please provide a search query with ?q=",
    });
  }

  try {
    const responseBody = await stockSearchService.searchStocks(rawQuery);
    return res.json(responseBody);
  } catch (error) {
    return res.status(error.statusCode || 502).json({
      message: error.message || `Unable to search stocks for "${rawQuery}".`,
      details: error.details || error.message,
    });
  }
}

module.exports = {
  getStockPrices,
  searchStocks,
};
