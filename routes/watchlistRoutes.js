// This routes file defines all the endpoints related to the watchlist, including
// CRUD operations,
// importing stocks,
// setting overrides, and
// refreshing stock data.

// Each route is linked to a specific controller function that handles the corresponding logic.

// Routes contain no logic; they just connect URLs to the functions that handle them. 
// All the real work happens in controllers and services.

// Import necessary modules
const express = require("express");
const router = express.Router();
const {
  validateTicker,
  validateCreateStock,
  validateUpdateStock,
} = require("../middleware/validate");
 
// Import all controllers
const { importStock } = require("../controllers/importController");
const {
  getAllStocks, getOneStock, createStock,
  updateStock, deleteStock,
} = require("../controllers/watchlistController");
const { setAnnualOverride } = require("../controllers/overrideController");
const { refreshStock } = require("../controllers/refreshController");
 
// Import routes
router.post("/import", importStock);
 
// CRUD routes
router.get("/", getAllStocks);
router.get("/:ticker", validateTicker, getOneStock);
router.post("/", validateCreateStock, createStock);
router.patch("/:ticker", validateTicker, validateUpdateStock, updateStock);
router.delete("/:ticker", validateTicker, deleteStock);
 
// Override and refresh routes
router.patch("/:ticker/annual/:fiscalYear/overrides", setAnnualOverride);
router.post("/:ticker/refresh", refreshStock);
 
module.exports = router;
