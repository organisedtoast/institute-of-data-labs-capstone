// Routes wire watchlist URLs to controllers; business logic lives elsewhere.
const express = require("express");
const router = express.Router();
const {
  validateTicker,
  validateCreateStock,
  validateUpdateStock,
  validateFiscalYear,
} = require("../middleware/validate");
 
const { importStock } = require("../controllers/importController");
const {
  getAllStocks, getOneStock, createStock,
  updateStock, deleteStock, getStockSummaries, getDashboardBootstraps,
} = require("../controllers/watchlistController");
const {
  setAnnualOverride,
  setForecastOverride,
  setTopLevelMetricOverride,
} = require("../controllers/overrideController");
const { refreshStock } = require("../controllers/refreshController");
const {
  getStockMetricsView,
  updateStockMetricsRowPreference,
} = require("../controllers/stockMetricsViewController");
 
router.post("/import", importStock);
 
// Summary and dashboard bootstrap reads come before `/:ticker` so those named
// paths never get mistaken for a stock symbol.
router.get("/summary", getStockSummaries);
router.get("/dashboards", getDashboardBootstraps);

router.get("/", getAllStocks);
router.get("/:ticker", validateTicker, getOneStock);
router.post("/", validateCreateStock, createStock);
router.patch("/:ticker", validateTicker, validateUpdateStock, updateStock);
router.delete("/:ticker", validateTicker, deleteStock);
 
router.patch("/:ticker/annual/:fiscalYear/overrides", validateTicker, validateFiscalYear, setAnnualOverride);
router.patch("/:ticker/forecast/:bucket/overrides", validateTicker, setForecastOverride);
router.patch("/:ticker/metrics/overrides", validateTicker, setTopLevelMetricOverride);
router.get("/:ticker/metrics-view", validateTicker, getStockMetricsView);
router.patch("/:ticker/metrics-row-preferences", validateTicker, updateStockMetricsRowPreference);
router.post("/:ticker/refresh", refreshStock);
 
module.exports = router;
