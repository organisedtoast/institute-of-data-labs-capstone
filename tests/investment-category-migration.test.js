require("dotenv").config();

process.env.PORT = "3111";

const assert = require("node:assert/strict");
const test = require("node:test");

const Lens = require("../models/Lens");
const WatchlistStock = require("../models/WatchlistStock");
const { startServer, stopServer } = require("../server");
const { assertActiveLensName } = require("../services/lensService");

test("startup migration renames legacy plural investment categories in MongoDB and lens lookups", async () => {
  await startServer();

  try {
    await Lens.deleteMany({
      key: { $in: ["cyclical", "cyclicals", "lender", "lenders"] },
    });
    await WatchlistStock.deleteMany({
      tickerSymbol: { $in: ["MIGRCYC1", "MIGRLEND1"] },
    });

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

    await stopServer();
    await startServer();

    const cyclicalStock = await WatchlistStock.findOne({ tickerSymbol: "MIGRCYC1" }).lean();
    const lenderStock = await WatchlistStock.findOne({ tickerSymbol: "MIGRLEND1" }).lean();
    assert.equal(cyclicalStock.investmentCategory, "Cyclical");
    assert.equal(lenderStock.investmentCategory, "Lender");

    const cyclicalLens = await Lens.findOne({ key: "cyclical" }).lean();
    const lenderLens = await Lens.findOne({ key: "lender" }).lean();
    assert.equal(cyclicalLens.name, "Cyclical");
    assert.equal(lenderLens.name, "Lender");
    assert.equal(await Lens.countDocuments({ key: "cyclicals" }), 0);
    assert.equal(await Lens.countDocuments({ key: "lenders" }), 0);

    await assert.rejects(() => assertActiveLensName("Cyclicals"), /Unknown investmentCategory: Cyclicals/);
    await assert.rejects(() => assertActiveLensName("Lenders"), /Unknown investmentCategory: Lenders/);
    await assert.doesNotReject(() => assertActiveLensName("Cyclical"));
    await assert.doesNotReject(() => assertActiveLensName("Lender"));
  } finally {
    await Lens.deleteMany({
      key: { $in: ["cyclical", "cyclicals", "lender", "lenders"] },
    });
    await WatchlistStock.deleteMany({
      tickerSymbol: { $in: ["MIGRCYC1", "MIGRLEND1"] },
    });
    await stopServer();
  }
});
