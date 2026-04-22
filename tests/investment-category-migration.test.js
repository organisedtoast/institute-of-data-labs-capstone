// Purpose of this test file:
// This integration test protects the startup migration that renames legacy
// plural investment-category names to the newer singular names. It proves the
// migration updates both stored watchlist documents and lens definitions, and
// it also proves that backend lens lookups accept the new names while rejecting
// the old legacy names after migration has run.

require("dotenv").config();

// This test uses its own port so it can boot the real server without
// clashing with another test file or a local dev server.
process.env.PORT = "3111";

const assert = require("node:assert/strict");
const test = require("node:test");

const Lens = require("../models/Lens");
const WatchlistStock = require("../models/WatchlistStock");
const { startServer, stopServer } = require("../server");
const { assertActiveLensName } = require("../services/lensService");

test("startup migration renames legacy plural investment categories in MongoDB and lens lookups", async () => {
  // We start the real server because the migration runs during server startup.
  // That means this test is checking real startup behavior, not just calling a
  // migration helper in isolation.
  await startServer();

  try {
    // First clean up any leftovers from an older test run. This keeps the test
    // repeatable and prevents duplicate records from affecting the result.
    await Lens.deleteMany({
      key: { $in: ["cyclical", "cyclicals", "lender", "lenders"] },
    });
    await WatchlistStock.deleteMany({
      tickerSymbol: { $in: ["MIGRCYC1", "MIGRLEND1"] },
    });

    // Seed the database with the *legacy* plural category names that we want
    // the startup migration to rename.
    await Lens.create([
      {
        key: "cyclicals",
        name: "Cyclicals",
        normalizedName: "cyclicals",
        isActive: true,
        fieldConfigs: [],
      },
      {
        key: "lenders",
        name: "Lenders",
        normalizedName: "lenders",
        isActive: true,
        fieldConfigs: [],
      },
    ]);

    // Seed stock documents that still use the old plural investment category
    // names. The migration should rename these too.
    await WatchlistStock.create([
      {
        tickerSymbol: "MIGRCYC1",
        investmentCategory: "Cyclicals",
      },
      {
        tickerSymbol: "MIGRLEND1",
        investmentCategory: "Lenders",
      },
    ]);

    // Stop and restart the server so startup runs again and applies the
    // migration to the data we just inserted.
    await stopServer();
    await startServer();

    // Re-read the documents from MongoDB and confirm the plural names were
    // converted to the new singular names.
    const cyclicalStock = await WatchlistStock.findOne({ tickerSymbol: "MIGRCYC1" }).lean();
    const lenderStock = await WatchlistStock.findOne({ tickerSymbol: "MIGRLEND1" }).lean();
    assert.equal(cyclicalStock.investmentCategory, "Cyclical");
    assert.equal(lenderStock.investmentCategory, "Lender");

    // The lens definitions should also be renamed, and the old plural versions
    // should no longer exist in the database.
    const cyclicalLens = await Lens.findOne({ key: "cyclical" }).lean();
    const lenderLens = await Lens.findOne({ key: "lender" }).lean();
    assert.equal(cyclicalLens.name, "Cyclical");
    assert.equal(lenderLens.name, "Lender");
    assert.equal(await Lens.countDocuments({ key: "cyclicals" }), 0);
    assert.equal(await Lens.countDocuments({ key: "lenders" }), 0);

    // Finally, check the business-facing lookup behavior.
    // Old plural names should now be rejected, while the new singular names
    // should resolve successfully through the shared lens validation service.
    await assert.rejects(() => assertActiveLensName("Cyclicals"), /Unknown investmentCategory: Cyclicals/);
    await assert.rejects(() => assertActiveLensName("Lenders"), /Unknown investmentCategory: Lenders/);
    await assert.doesNotReject(() => assertActiveLensName("Cyclical"));
    await assert.doesNotReject(() => assertActiveLensName("Lender"));
  } finally {
    // Always clean up, even if an assertion fails halfway through.
    // `finally` is a great habit in integration tests because it prevents one
    // broken run from poisoning the next one.
    await Lens.deleteMany({
      key: { $in: ["cyclical", "cyclicals", "lender", "lenders"] },
    });
    await WatchlistStock.deleteMany({
      tickerSymbol: { $in: ["MIGRCYC1", "MIGRLEND1"] },
    });
    await stopServer();
  }
});
