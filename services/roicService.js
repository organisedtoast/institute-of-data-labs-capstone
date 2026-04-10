// services/roicService.js
const axios = require("axios");
 
const BASE_URL = "https://api.roic.ai/v2";
const API_KEY = process.env.ROIC_API_KEY;
 
// Helper: ROIC's current API documentation uses an `apikey` query parameter
// rather than a Bearer token header, so every request shares this config.
const requestConfig = (extraParams = {}) => ({
  params: {
    apikey: API_KEY,
    ...extraParams,
  },
});
 
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
async function fetchStockPrices(ticker) {
  const res = await axios.get(
    `${BASE_URL}/stock-prices/${ticker}`,
    requestConfig({ order: "ASC", limit: 100000 })
  );
  return res.data;
}
 
// Fetch earnings call dates
async function fetchEarningsCalls(ticker) {
  const res = await axios.get(
    `${BASE_URL}/company/earnings-calls/list/${ticker}`,
    requestConfig({ limit: 100 })
  );
  return res.data;
}

// Export all service functions
module.exports = {
  fetchCompanyProfile,
  fetchAnnualPerShare,
  fetchAnnualProfitability,
  fetchStockPrices,
  fetchEarningsCalls,
};
