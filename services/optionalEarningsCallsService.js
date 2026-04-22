const roicService = require("./roicService");

function getEarningsCallErrorMessage(error) {
  return String(
    error?.response?.data?.error
    || error?.response?.data?.message
    || error?.details?.error
    || error?.details?.message
    || error?.message
    || ""
  ).toLowerCase();
}

function isMissingEarningsCallsError(error) {
  const statusCode = error?.response?.status || error?.statusCode || null;
  if (statusCode !== 404) {
    return false;
  }

  return getEarningsCallErrorMessage(error).includes("no earnings calls found");
}

async function fetchOptionalEarningsCalls(fetchWithContext, tickerSymbol) {
  try {
    return await fetchWithContext("earnings calls", roicService.fetchEarningsCalls, tickerSymbol);
  } catch (error) {
    // Earnings calls are helpful when ROIC has them, but some valid tickers
    // only have fundamentals and prices. Those stocks should still import.
    if (isMissingEarningsCallsError(error)) {
      // Returning [] intentionally lets normalization fall back to FY end + 60 days.
      return [];
    }

    throw error;
  }
}

module.exports = {
  fetchOptionalEarningsCalls,
  isMissingEarningsCallsError,
};
