const {
  buildStockMetricsView,
  setStockMetricsRowPreference,
} = require("../services/stockMetricsViewService");
const { getTrimmedString } = require("../middleware/validate");

// Express 5 forwards rejected async handlers to the shared error middleware,
// so these routes do not need local try/catch(next) wrappers.
async function getStockMetricsView(req, res) {
  const payload = await buildStockMetricsView(req.params.ticker);
  res.json(payload);
}

async function updateStockMetricsRowPreference(req, res) {
  const rowKey = getTrimmedString(req.body?.rowKey);
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
}

module.exports = {
  getStockMetricsView,
  updateStockMetricsRowPreference,
};
