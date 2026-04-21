const mongoose = require("mongoose");

// This collection stores the user's include/exclude choice for one stock
// inside one investment category card. We keep it separate from the watchlist
// document because disabling a constituent must not change the stock's actual
// investment category.
const investmentCategoryConstituentPreferenceSchema = new mongoose.Schema({
  investmentCategory: {
    type: String,
    required: true,
    trim: true,
  },
  tickerSymbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  isEnabled: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

investmentCategoryConstituentPreferenceSchema.index(
  { investmentCategory: 1, tickerSymbol: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "InvestmentCategoryConstituentPreference",
  investmentCategoryConstituentPreferenceSchema,
  "investment_category_constituent_preferences"
);
