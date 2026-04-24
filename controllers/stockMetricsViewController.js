const {
  buildStockMetricsView,
  setStockMetricsRowPreference,
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
    const hasIsEnabled = typeof req.body?.isEnabled === "boolean";
    const hasIsBold = typeof req.body?.isBold === "boolean";

    if (!rowKey) {
      return res.status(400).json({ error: "rowKey is required" });
    }

    // The same row-preference route now saves both visibility and bolding.
    // Accepting either field lets one preference update happen without
    // accidentally clearing the other saved choice.
    if (!hasIsEnabled && !hasIsBold) {
      return res.status(400).json({ error: "isEnabled or isBold must be a boolean" });
    }

    const payload = await setStockMetricsRowPreference({
      tickerSymbol: req.params.ticker,
      rowKey,
      isEnabled: hasIsEnabled ? req.body.isEnabled : undefined,
      isBold: hasIsBold ? req.body.isBold : undefined,
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
