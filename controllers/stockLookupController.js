const roicService = require("../services/roicService");
const stockSearchService = require("../services/stockSearchService");
const {
  getMonthRangeValidationMessage,
  getTrimmedString,
} = require("../middleware/validate");

// This controller owns the read-only stock lookup API.
// Its job is to validate incoming request data, call the correct service, and
// return a clean JSON response. It does not read from MongoDB or create
// watchlist records because lookup and persistence are separate concerns.

// GET /api/stock-prices/:ticker
// This endpoint returns live price history from ROIC for charting and preview
// flows. Looking up prices should never create or update a Mongo document.
async function getStockPrices(req, res) {
  const identifier = getTrimmedString(req.params.ticker).toUpperCase();
  const startDate = getTrimmedString(req.query.startDate);
  const endDate = getTrimmedString(req.query.endDate);

  if (!identifier) {
    return res.status(400).json({
      message: "Ticker symbol is required.",
    });
  }

  // The controller only validates the month filters here.
  // ROIC-specific date conversion and price normalization stay inside
  // roicService so the same rules are not duplicated across the app.
  const monthRangeValidationMessage = getMonthRangeValidationMessage(
    startDate,
    endDate,
    roicService.isValidMonthString,
    {
      startLabel: "startDate",
      endLabel: "endDate",
    },
  );

  if (monthRangeValidationMessage) {
    return res.status(400).json({
      message: monthRangeValidationMessage,
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
  const rawQuery = getTrimmedString(req.query.q);

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
