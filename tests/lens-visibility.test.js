// Purpose of this test file:
// This integration test proves that investment categories resolve to the
// correct seeded lens definitions without needing any frontend code. In other
// words, it checks that the backend alone knows which fields should be visible
// on the card surface and which should be visible on the detail surface for a
// given investment category.

require("dotenv").config();

// Use a dedicated port for this test file so it can start the real server
// without clashing with another test or a local dev server.
process.env.PORT = "3110";

const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");

const { buildIsolatedMongoUri } = require("./helpers/buildIsolatedMongoUri");

process.env.MONGO_URI = buildIsolatedMongoUri(
  process.env.MONGO_URI,
  "stockgossipmonitor_lens_visibility_test"
);

const WatchlistStock = require("../models/WatchlistStock");
const { startServer, stopServer } = require("../server");
const { resolveVisibleFieldsForCategory, resolveVisibleFieldsForStock } = require("../services/lensService");

test.after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
});

test("lens visibility resolves card/detail fields for categories and stocks", async () => {
  // Start the real server so the seeded/default lenses are available exactly as
  // they would be in the running app.
  await startServer();

  try {
    // First, ask the lens service for the visible fields of a category directly.
    // This proves the category name maps to the right backend lens definition.
    const categoryView = await resolveVisibleFieldsForCategory("Lender");

    // We expect lender cards to show FY end date on the compact card surface.
    assert.equal(categoryView.cardFields[0].label, "FY end date");

    // "Assets" should be available in the detail view for this category.
    assert.ok(categoryView.detailFields.some((field) => field.label === "Assets"));

    // "Revenue" should *not* appear for lenders, which helps prove that the
    // lens is category-specific rather than exposing every possible field.
    assert.ok(!categoryView.detailFields.some((field) => field.label === "Revenue"));

    // Remove any leftover stock from an older test run so this test stays repeatable.
    await WatchlistStock.deleteMany({ tickerSymbol: "LENSTEST1" });

    // Create a real watchlist stock with a different investment category.
    // The stock-based resolver should look at the stock's category and then
    // return the matching lens visibility rules.
    const stock = await WatchlistStock.create({
      tickerSymbol: "LENSTEST1",
      investmentCategory: "Unprofitable Hi Growth",
    });

    // Resolve visibility through the stock document instead of by category name.
    const stockView = await resolveVisibleFieldsForStock(stock);

    // Unprofitable high-growth stocks should expose share price on the card.
    assert.ok(stockView.cardFields.some((field) => field.label === "Share price"));

    // They should expose EV/Sales trailing in details...
    assert.ok(stockView.detailFields.some((field) => field.label === "EV/Sales trailing"));

    // ...but not PE trailing, which would be less appropriate for this category.
    assert.ok(!stockView.detailFields.some((field) => field.label === "PE trailing"));
  } finally {
    // Always clean up and stop the server, even if an assertion fails.
    await WatchlistStock.deleteMany({ tickerSymbol: "LENSTEST1" });
    await stopServer();
  }
});
