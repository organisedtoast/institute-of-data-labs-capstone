// models/WatchlistStock.js
const mongoose = require("mongoose");
 
// sub-schema for any metric that supports overrides
const overridableField = {
  roicValue:       { type: mongoose.Schema.Types.Mixed, default: null },
  userValue:       { type: mongoose.Schema.Types.Mixed, default: null },
  effectiveValue:  { type: mongoose.Schema.Types.Mixed, default: null },
  sourceOfTruth:   { type: String, enum: ["roic", "user", "derived"], default: "roic" },
  lastOverriddenAt: { type: Date, default: null },
};
 
// sub-schema for one fiscal year of data
const annualDataSchema = new mongoose.Schema({
  fiscalYear:               { type: Number, required: true },
  fiscalYearEndDate:        { type: String },
  marketAnchorDate:         overridableField,
  stockPrice:               overridableField,
  sharesOutstanding:        overridableField,
  marketCap:                overridableField,
  returnOnInvestedCapital:  overridableField,
}, { _id: false });
 
// main schema for one stock document
const watchlistStockSchema = new mongoose.Schema({
  tickerSymbol: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  companyName: overridableField,
  investmentCategory: { type: String, default: "" },
  priceCurrency: { type: String, default: "USD" },
  sourceMeta: {
    lastImportedAt:   { type: Date },
    lastRefreshAt:    { type: Date },
    importRangeYears: { type: Number, default: 10 },
    roicEndpointsUsed: [String],
  },
  annualData: [annualDataSchema],
}, { timestamps: true });
 
// tell Mongoose to use the "watchlist" collection name
module.exports = mongoose.model("WatchlistStock", watchlistStockSchema, "watchlist");
