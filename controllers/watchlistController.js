// This controller file handles basic CRUD operations for the watchlist stocks.

// It uses the WatchlistStock model to interact with MongoDB and provides endpoints to:
// - Create a new stock (manual shell creation without ROIC data)
// - Read get all stocks in the watchlist
// - Read get a single stock by ticker symbol
// - Update an existing stock's investment category or company name
// - Delete a stock from the watchlist


const WatchlistStock = require("../models/WatchlistStock");

function buildCompanyNameOverride(existingField, companyName) {
  const trimmedName = companyName.trim();

  return {
    roicValue: existingField?.roicValue ?? null,
    userValue: trimmedName,
    effectiveValue: trimmedName,
    sourceOfTruth: "user",
    lastOverriddenAt: new Date(),
  };
}

// POST /api/watchlist (manual shell creation)
async function createStock(req, res, next) {
  try {
    const doc = await WatchlistStock.create({
      tickerSymbol: req.body.tickerSymbol,
      investmentCategory: req.body.investmentCategory || "",
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
}

// GET /api/watchlist
async function getAllStocks(req, res, next) {
  try {
    const stocks = await WatchlistStock.find();
    res.json(stocks);
  } catch (err) { next(err); }
}
 
// GET /api/watchlist/:ticker
async function getOneStock(req, res, next) {
  try {
    const stock = await WatchlistStock.findOne({
      tickerSymbol: req.params.ticker.toUpperCase(),
    });
    if (!stock) return res.status(404).json({ error: "Stock not found" });
    res.json(stock);
  } catch (err) { next(err); }
}
 
// PATCH /api/watchlist/:ticker
async function updateStock(req, res, next) {
  try {
    const updates = {};

    if (req.body.investmentCategory !== undefined) {
      updates.investmentCategory = req.body.investmentCategory;
    }

    if (req.body.companyName !== undefined) {
      const existingStock = await WatchlistStock.findOne({
        tickerSymbol: req.params.ticker.toUpperCase(),
      });

      if (!existingStock) {
        return res.status(404).json({ error: "Stock not found" });
      }

      updates.companyName = buildCompanyNameOverride(
        existingStock.companyName,
        req.body.companyName
      );

      const doc = await WatchlistStock.findOneAndUpdate(
        { tickerSymbol: req.params.ticker.toUpperCase() },
        updates,
        { returnDocument: "after", runValidators: true }
      );

      return res.json(doc);
    }

    const doc = await WatchlistStock.findOneAndUpdate(
      { tickerSymbol: req.params.ticker.toUpperCase() },
      updates,
      { returnDocument: "after", runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: "Stock not found" });
    res.json(doc);
  } catch (err) { next(err); }
}
 
// DELETE /api/watchlist/:ticker
async function deleteStock(req, res, next) {
  try {
    const doc = await WatchlistStock.findOneAndDelete({
      tickerSymbol: req.params.ticker.toUpperCase(),
    });
    if (!doc) return res.status(404).json({ error: "Stock not found" });
    res.json({ message: "Deleted", tickerSymbol: doc.tickerSymbol });
  } catch (err) { next(err); }
}
 
module.exports = { createStock, getAllStocks, getOneStock, updateStock, deleteStock };
