const roicService = require("../services/roicService");

async function getStockPrices(req, res) {
  const identifier = String(req.params.ticker || "").trim().toUpperCase();
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate.trim() : "";
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate.trim() : "";

  if (!identifier) {
    return res.status(400).json({
      message: "Ticker symbol is required.",
    });
  }

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

async function searchStocks(req, res) {
  const rawQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (!rawQuery) {
    return res.status(400).json({
      message: "Please provide a search query with ?q=",
    });
  }

  const uppercaseQuery = rawQuery.toUpperCase();
  const isTickerQuery = roicService.isTickerLikeQuery(rawQuery);
  const companyNameSearchQuery = isTickerQuery ? uppercaseQuery : rawQuery;
  const searchTasks = [roicService.searchRoicByCompanyName(companyNameSearchQuery)];

  if (isTickerQuery) {
    searchTasks.unshift(roicService.searchRoicByExactTicker(uppercaseQuery));
    searchTasks.push(roicService.searchRoicByTickerVariants(uppercaseQuery));
  }

  const searchResults = await Promise.allSettled(searchTasks);
  const successfulResultLists = searchResults
    .filter((searchResult) => searchResult.status === "fulfilled")
    .map((searchResult) => searchResult.value);

  const mergedResults = roicService.mergeTickerSearchResults(rawQuery, ...successfulResultLists);

  if (mergedResults.length === 0) {
    const rejectedResults = searchResults.filter((searchResult) => searchResult.status === "rejected");

    if (rejectedResults.length === searchResults.length) {
      const firstError = rejectedResults[0]?.reason;
      const statusCode = firstError?.response?.status || 502;

      return res.status(statusCode).json({
        message: `Unable to search stocks for "${rawQuery}".`,
        details: firstError?.response?.data || firstError?.message || "ROIC search request failed.",
      });
    }
  }

  return res.json({
    query: rawQuery,
    queryType: isTickerQuery ? "ticker-or-name" : "name",
    results: mergedResults,
  });
}

module.exports = {
  getStockPrices,
  searchStocks,
};
