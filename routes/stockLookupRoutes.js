const express = require("express");
const { getStockPrices, searchStocks } = require("../controllers/stockLookupController");

const router = express.Router();

// These routes form the read-only stock lookup module.
// They are mounted separately from the Mongo-backed watchlist routes so a
// beginner can see the boundary between "look up live market data" and
// "persist a tracked stock in the database".
router.get("/stocks/search", searchStocks);
router.get("/stock-prices/:ticker", getStockPrices);

module.exports = router;



// persistence means "storing data in a database".
// The stock lookup routes are read-only, so they don't need to interact with the database. 
// They just fetch live market data from an external API and return it to the client.
// By keeping these routes separate from the watchlist routes, we can clearly see which routes 
// are responsible for fetching live data and which routes are responsible for persisting data in the database.