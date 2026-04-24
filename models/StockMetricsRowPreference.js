const mongoose = require("mongoose");

// Each record stores one UI row preference for one stock card.
// We keep this separate from the watchlist document because hiding a row is a
// display choice, not a change to the imported financial data itself.
const stockMetricsRowPreferenceSchema = new mongoose.Schema({
  tickerSymbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  rowKey: {
    type: String,
    required: true,
    trim: true,
  },
  isEnabled: {
    type: Boolean,
    default: true,
  },
  isBold: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

stockMetricsRowPreferenceSchema.index(
  { tickerSymbol: 1, rowKey: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "StockMetricsRowPreference",
  stockMetricsRowPreferenceSchema,
  "stock_metrics_row_preferences"
);
