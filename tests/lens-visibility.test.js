// This integration test proves that investment categories resolve to seeded
// lens definitions without needing any frontend code.

require("dotenv").config();

process.env.PORT = "3110";

const assert = require("node:assert/strict");
const test = require("node:test");

const WatchlistStock = require("../models/WatchlistStock");
const { startServer, stopServer } = require("../server");
const { resolveVisibleFieldsForCategory, resolveVisibleFieldsForStock } = require("../services/lensService");

test("lens visibility resolves card/detail fields for categories and stocks", async () => {
  await startServer();

  try {
    const categoryView = await resolveVisibleFieldsForCategory("Lenders");
    assert.equal(categoryView.cardFields[0].label, "FY end date");
    assert.ok(categoryView.detailFields.some((field) => field.label === "Assets"));
    assert.ok(!categoryView.detailFields.some((field) => field.label === "Revenue"));

    await WatchlistStock.deleteMany({ tickerSymbol: "LENSTEST1" });
    const stock = await WatchlistStock.create({
      tickerSymbol: "LENSTEST1",
      investmentCategory: "Unprofitable Hi Growth",
    });

    const stockView = await resolveVisibleFieldsForStock(stock);
    assert.ok(stockView.cardFields.some((field) => field.label === "Share price (at FY release date)"));
    assert.ok(stockView.detailFields.some((field) => field.label === "EV/Sales trailing"));
    assert.ok(!stockView.detailFields.some((field) => field.label === "PE trailing"));
  } finally {
    await WatchlistStock.deleteMany({ tickerSymbol: "LENSTEST1" });
    await stopServer();
  }
});
