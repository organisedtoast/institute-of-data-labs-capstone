const axios = require("axios");

const BASE_URL = "https://api.roic.ai/v2";
const API_KEY = process.env.ROIC_API_KEY;
const COMPANY_NAME_SEARCH_URL = `${BASE_URL}/tickers/search/name`;
const STOCK_PRICES_URL = `${BASE_URL}/stock-prices`;
const MAX_SEARCH_RESULTS = 25;
const DEFAULT_UNCAPPED_ANNUAL_LIMIT = 100;
const MONTH_STRING_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function buildMissingApiKeyError() {
  const error = new Error("ROIC API key is not configured.");
  error.statusCode = 503;
  error.details = {
    source: "roic",
    reason: "missing-api-key",
    envVar: "ROIC_API_KEY",
  };
  return error;
}

// ROIC uses the `apikey` query parameter across its API surface, so we keep
// one helper for building request params instead of repeating that boilerplate
// in every fetcher.
const requestConfig = (extraParams = {}) => {
  if (!API_KEY) {
    throw buildMissingApiKeyError();
  }

  return {
    params: {
      apikey: API_KEY,
      ...extraParams,
    },
  };
};

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

// Most annual ROIC endpoints share the same period/order arguments. Uncapped
// imports still send a large explicit limit because ROIC appears to default to
// a much shorter annual history when the limit is omitted.
async function fetchAnnualEndpoint(endpointPath, ticker, options = {}) {
  const { years = null } = options;
  const normalizedYearLimit = Number.isInteger(Number(years)) && Number(years) > 0
    ? Number(years)
    : DEFAULT_UNCAPPED_ANNUAL_LIMIT;
  const res = await axios.get(
    `${BASE_URL}${endpointPath}/${ticker}`,
    requestConfig({
      period: "annual",
      order: "DESC",
      ...(normalizedYearLimit !== null ? { limit: normalizedYearLimit } : {}),
    })
  );

  return res.data;
}

// Company profile provides identity-style fields such as company name and
// price currency.
async function fetchCompanyProfile(ticker) {
  const res = await axios.get(
    `${BASE_URL}/company/profile/${ticker}`,
    requestConfig()
  );
  return Array.isArray(res.data) ? res.data[0] || {} : res.data;
}

// Per-share data currently feeds fiscal year end dates, share counts, EPS,
// DPS, and tangible book value per share.
async function fetchAnnualPerShare(ticker, options = {}) {
  return fetchAnnualEndpoint("/fundamental/per-share", ticker, options);
}

// Profitability ratios feed ROIC plus several trailing margin-style metrics.
async function fetchAnnualProfitability(ticker, options = {}) {
  return fetchAnnualEndpoint("/fundamental/ratios/profitability", ticker, options);
}

// Income statement rows provide revenue, profitability, and expense lines.
async function fetchAnnualIncomeStatement(ticker, options = {}) {
  return fetchAnnualEndpoint("/fundamental/income-statement", ticker, options);
}

// Balance sheet rows provide cash, debt, assets, liabilities, and equity.
async function fetchAnnualBalanceSheet(ticker, options = {}) {
  return fetchAnnualEndpoint("/fundamental/balance-sheet", ticker, options);
}

// Cash flow rows provide capex and free-cash-flow style figures.
async function fetchAnnualCashFlow(ticker, options = {}) {
  return fetchAnnualEndpoint("/fundamental/cash-flow", ticker, options);
}

// Credit ratios provide debt-to-EBITDA and interest-coverage style inputs.
async function fetchAnnualCreditRatios(ticker, options = {}) {
  return fetchAnnualEndpoint("/fundamental/ratios/credit", ticker, options);
}

// Enterprise value rows can provide direct EV-related metrics, but the backend
// still computes a fallback when those fields are absent.
async function fetchAnnualEnterpriseValue(ticker, options = {}) {
  return fetchAnnualEndpoint("/fundamental/enterprise-value", ticker, options);
}

// Valuation multiples provide trailing PE and related valuation fields.
async function fetchAnnualMultiples(ticker, options = {}) {
  return fetchAnnualEndpoint("/fundamental/multiples", ticker, options);
}

// Historical stock prices are used to select the first trading day after the
// chosen earnings release date.
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

// Earnings call dates are the preferred source for annual earnings release
// dates, with backend fallbacks handling tickers where ROIC has gaps.
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

module.exports = {
  buildMissingApiKeyError,
  fetchAnnualBalanceSheet,
  fetchAnnualCashFlow,
  fetchAnnualCreditRatios,
  fetchAnnualEnterpriseValue,
  fetchAnnualIncomeStatement,
  fetchAnnualMultiples,
  fetchAnnualPerShare,
  fetchAnnualProfitability,
  fetchCompanyProfile,
  fetchEarningsCalls,
  fetchStockPrices,
  isValidMonthString,
  searchRoicByCompanyName,
  DEFAULT_UNCAPPED_ANNUAL_LIMIT,
};
