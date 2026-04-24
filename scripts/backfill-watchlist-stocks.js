require("dotenv").config();

const { connectDB, disconnectDB } = require("../config/db");
const { backfillStaleWatchlistStocks } = require("../services/watchlistStockBackfillService");

async function run() {
  // This script is the explicit "refresh everything now" path. It uses the
  // same stale-document rules as the app so future API-backed fields reuse one
  // maintenance workflow instead of another field-specific backfill.
  await connectDB();

  try {
    const result = await backfillStaleWatchlistStocks({ logger: console });
    console.log(`[backfill:stocks] Total watchlist stocks: ${result.totalStocks}`);
    console.log(`[backfill:stocks] Stale watchlist stocks: ${result.staleStocks}`);
    console.log(`[backfill:stocks] Refreshed watchlist stocks: ${result.refreshedCount}`);

    if (result.failures.length) {
      console.error(`[backfill:stocks] Failures: ${result.failures.length}`);
      process.exitCode = 1;
      return;
    }

    console.log("[backfill:stocks] Completed successfully.");
  } finally {
    await disconnectDB();
  }
}

run().catch((error) => {
  console.error(`[backfill:stocks] Fatal error: ${error.message}`);
  process.exitCode = 1;
});
