const {
  buildStockMetricsView,
  setStockMetricsRowEnabledState,
} = require("../services/stockMetricsViewService");

async function getStockMetricsView(req, res, next) {
  try {
    const payload = await buildStockMetricsView(req.params.ticker);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function updateStockMetricsRowPreference(req, res, next) {
  try {
    const rowKey = typeof req.body?.rowKey === "string" ? req.body.rowKey.trim() : "";

    if (!rowKey) {
      return res.status(400).json({ error: "rowKey is required" });
    }

    if (typeof req.body?.isEnabled !== "boolean") {
      return res.status(400).json({ error: "isEnabled must be a boolean" });
    }

    const payload = await setStockMetricsRowEnabledState({
      tickerSymbol: req.params.ticker,
      rowKey,
      isEnabled: req.body.isEnabled,
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStockMetricsView,
  updateStockMetricsRowPreference,
};
