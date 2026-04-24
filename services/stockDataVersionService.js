const ANNUAL_HISTORY_FETCH_VERSION = 3;
const CURRENT_STOCK_DATA_VERSION = 1;

function hasLegacyAnnualHistoryGap(stockDocument) {
  const importRangeYears = stockDocument?.sourceMeta?.importRangeYears;
  const importRangeYearsExplicit = stockDocument?.sourceMeta?.importRangeYearsExplicit === true;
  const annualHistoryFetchVersion = Number(stockDocument?.sourceMeta?.annualHistoryFetchVersion);
  const annualRowCount = Array.isArray(stockDocument?.annualData) ? stockDocument.annualData.length : 0;
  const needsVersionUpgrade =
    !Number.isInteger(annualHistoryFetchVersion) ||
    annualHistoryFetchVersion < ANNUAL_HISTORY_FETCH_VERSION;
  const hasLegacyTruncatedUncappedHistory =
    importRangeYears == null && (annualRowCount === 10 || annualRowCount === 20);

  if (importRangeYearsExplicit) {
    return false;
  }

  return needsVersionUpgrade || (
    hasLegacyTruncatedUncappedHistory &&
    annualHistoryFetchVersion !== ANNUAL_HISTORY_FETCH_VERSION
  );
}

function isStockDataVersionStale(stockDocument) {
  const stockDataVersion = Number(stockDocument?.sourceMeta?.stockDataVersion);
  return !Number.isInteger(stockDataVersion) || stockDataVersion < CURRENT_STOCK_DATA_VERSION;
}

function isStockDocumentRefreshRequired(stockDocument) {
  // We keep one shared upgrade decision so future ROIC-backed field additions
  // only need a version bump instead of another one-off migration rule.
  return isStockDataVersionStale(stockDocument) || hasLegacyAnnualHistoryGap(stockDocument);
}

module.exports = {
  ANNUAL_HISTORY_FETCH_VERSION,
  CURRENT_STOCK_DATA_VERSION,
  hasLegacyAnnualHistoryGap,
  isStockDataVersionStale,
  isStockDocumentRefreshRequired,
};
