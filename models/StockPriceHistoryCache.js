const mongoose = require("mongoose");

const monthlyPricePointSchema = new mongoose.Schema({
  month: {
    type: String,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  close: {
    type: Number,
    required: true,
  },
}, { _id: false });

// The homepage category cards aggregate many stocks at once. Caching a compact
// monthly series per ticker avoids re-fetching and re-condensing the full daily
// ROIC history every time the homepage re-renders or a preset changes.
const stockPriceHistoryCacheSchema = new mongoose.Schema({
  tickerSymbol: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  pricePoints: {
    type: [monthlyPricePointSchema],
    default: [],
  },
  earliestMonth: {
    type: String,
    default: "",
  },
  latestMonth: {
    type: String,
    default: "",
  },
  lastSyncedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model(
  "StockPriceHistoryCache",
  stockPriceHistoryCacheSchema,
  "stock_price_history_cache"
);
