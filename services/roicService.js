// services/roicService.js
const axios = require("axios");
 
const BASE_URL = "https://api.roic.ai/v2";
const API_KEY = process.env.ROIC_API_KEY;
const COMPANY_NAME_SEARCH_URL = `${BASE_URL}/tickers/search/name`;
const STOCK_PRICES_URL = `${BASE_URL}/stock-prices`;
const MAX_SEARCH_RESULTS = 10;
const MONTH_STRING_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
 
// Helper: ROIC's current API documentation uses an `apikey` query parameter
// rather than a Bearer token header, so every request shares this config.
const requestConfig = (extraParams = {}) => ({
  params: {
    apikey: API_KEY,
    ...extraParams,
  },
});

function convertToNumberIfPossible(value) {
  if (value === null || value === undefined || value === "") {
    return value;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? value : numericValue;
}

function normalizePriceRow(priceRow = {}) {
  return {
    ...priceRow,
    open: convertToNumberIfPossible(priceRow.open),
    high: convertToNumberIfPossible(priceRow.high),
    low: convertToNumberIfPossible(priceRow.low),
    close: convertToNumberIfPossible(priceRow.close),
    adj_close: convertToNumberIfPossible(priceRow.adj_close),
    volume: convertToNumberIfPossible(priceRow.volume),
    unadjusted_volume: convertToNumberIfPossible(priceRow.unadjusted_volume),
    change: convertToNumberIfPossible(priceRow.change),
    change_percent: convertToNumberIfPossible(priceRow.change_percent),
    vwap: convertToNumberIfPossible(priceRow.vwap),
  };
}

function sortPriceRowsByDateAscending(priceRows = []) {
  return [...priceRows].sort((left, right) => {
    const leftDate = left?.date || "";
    const rightDate = right?.date || "";
    return leftDate.localeCompare(rightDate);
  });
}

function isValidMonthString(value) {
  return typeof value === "string" && MONTH_STRING_PATTERN.test(value);
}

function convertMonthStringToStartDate(monthString) {
  if (!isValidMonthString(monthString)) {
    return "";
  }

  return `${monthString}-01`;
}

function convertMonthStringToEndDate(monthString) {
  if (!isValidMonthString(monthString)) {
    return "";
  }

  const [yearText, monthText] = monthString.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return `${monthString}-${String(lastDayOfMonth).padStart(2, "0")}`;
}

// Fetch company profile (name, currency, etc.)
async function fetchCompanyProfile(ticker) {
  const res = await axios.get(
    `${BASE_URL}/company/profile/${ticker}`,
    requestConfig()
  );
  return Array.isArray(res.data) ? res.data[0] || {} : res.data;
}
 
// Fetch annual per-share data (shares outstanding)
async function fetchAnnualPerShare(ticker) {
  const res = await axios.get(
    `${BASE_URL}/fundamental/per-share/${ticker}`,
    requestConfig({ period: "annual", order: "DESC", limit: 20 })
  );
  return res.data;
}
 
// Fetch annual profitability ratios (ROIC metric)
async function fetchAnnualProfitability(ticker) {
  const res = await axios.get(
    `${BASE_URL}/fundamental/ratios/profitability/${ticker}`,
    requestConfig({ period: "annual", order: "DESC", limit: 20 })
  );
  return res.data;
}
 
// Fetch historical stock prices
async function fetchStockPrices(ticker, options = {}) {
  const { startDate, endDate, order = "ASC", limit = 100000 } = options;
  const res = await axios.get(
    `${STOCK_PRICES_URL}/${ticker}`,
    requestConfig({
      order,
      limit,
      ...(startDate ? { date_start: convertMonthStringToStartDate(startDate) } : {}),
      ...(endDate ? { date_end: convertMonthStringToEndDate(endDate) } : {}),
    })
  );

  const priceRows = Array.isArray(res.data) ? res.data : [];
  return sortPriceRowsByDateAscending(priceRows.map(normalizePriceRow));
}
 
// Fetch earnings call dates
async function fetchEarningsCalls(ticker) {
  const res = await axios.get(
    `${BASE_URL}/company/earnings-calls/list/${ticker}`,
    requestConfig({ limit: 100 })
  );
  return res.data;
}

async function searchRoicByCompanyName(searchQuery) {
  const res = await axios.get(
    COMPANY_NAME_SEARCH_URL,
    requestConfig({ query: searchQuery, limit: MAX_SEARCH_RESULTS })
  );

  return Array.isArray(res.data) ? res.data : [];
}

// Export all service functions
module.exports = {
  isValidMonthString,
  fetchCompanyProfile,
  fetchAnnualPerShare,
  fetchAnnualProfitability,
  fetchStockPrices,
  fetchEarningsCalls,
  searchRoicByCompanyName,
};
