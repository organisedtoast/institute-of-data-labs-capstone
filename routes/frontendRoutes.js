const express = require("express");
const { getStockPrices, searchStocks } = require("../controllers/frontendController");

const router = express.Router();

router.get("/stocks/search", searchStocks);
router.get("/stock-prices/:ticker", getStockPrices);

module.exports = router;
