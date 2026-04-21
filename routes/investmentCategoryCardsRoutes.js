const express = require("express");

const {
  queryInvestmentCategoryCardsController,
  updateInvestmentCategoryConstituentController,
} = require("../controllers/investmentCategoryCardsController");

const router = express.Router();

// These homepage-specific routes keep the heavier category-card aggregation
// work separate from the simpler watchlist CRUD routes.
router.post("/query", queryInvestmentCategoryCardsController);
router.patch("/:category/constituents/:ticker", updateInvestmentCategoryConstituentController);

module.exports = router;
