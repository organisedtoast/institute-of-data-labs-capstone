const WatchlistStock = require("../models/WatchlistStock");
const { resolveStoredImportRange } = require("./importRangeService");
const { isStockDocumentRefreshRequired } = require("./stockDataVersionService");
const {
  applyFreshStockDataToExistingStock,
  buildFreshStockData,
} = require("./watchlistStockRefreshService");

async function backfillStaleWatchlistStocks(options = {}) {
  const logger = options.logger || console;
  const stockDocuments = await WatchlistStock.find({});
  const staleStockDocuments = stockDocuments.filter((stockDocument) => isStockDocumentRefreshRequired(stockDocument));
  const failures = [];
  let refreshedCount = 0;

  // The script walks one stale stock at a time so logs stay readable and one
  // failure does not hide which ticker actually caused the problem.
  for (const stockDocument of staleStockDocuments) {
    const tickerSymbol = String(stockDocument?.tickerSymbol || "").trim().toUpperCase();

    try {
      const {
        years,
        importRangeYearsExplicit,
      } = resolveStoredImportRange(stockDocument.sourceMeta);
      const freshData = await buildFreshStockData({
        tickerSymbol,
        investmentCategory: stockDocument.investmentCategory,
        years,
        importRangeYearsExplicit,
      });

      applyFreshStockDataToExistingStock(stockDocument, freshData);
      stockDocument.sourceMeta.lastRefreshAt = new Date();
      await stockDocument.save();

      refreshedCount += 1;
      logger.info?.(`[backfill:stocks] Refreshed ${tickerSymbol}`);
    } catch (error) {
      failures.push({
        tickerSymbol,
        message: error.message,
      });
      logger.error?.(`[backfill:stocks] Failed ${tickerSymbol}: ${error.message}`);
    }
  }

  return {
    totalStocks: stockDocuments.length,
    staleStocks: staleStockDocuments.length,
    refreshedCount,
    failures,
  };
}

module.exports = {
  backfillStaleWatchlistStocks,
};
