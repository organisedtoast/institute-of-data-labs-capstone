// This controller file handles user overrides at the annual metric level.

// It provides an endpoint to set an override for a specific metric in a given fiscal year.
// When an override is set, it updates the userValue and lastOverriddenAt fields,
// then recalculates the effectiveValue and sourceOfTruth using the resolveEffectiveValue utility.
// Finally, it saves the document back to MongoDB and returns the updated stock data.


const WatchlistStock = require("../models/WatchlistStock");
const { resolveEffectiveValue } = require("../utils/effectiveValue");
const { recalculateDerived } = require("../utils/derivedCalc");
 
// PATCH /api/watchlist/:ticker/annual/:fiscalYear/overrides
async function setAnnualOverride(req, res, next) {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const fiscalYear = parseInt(req.params.fiscalYear);
    const allowedMetrics = [
      "stockPrice", "sharesOutstanding",
      "returnOnInvestedCapital", "marketAnchorDate",
    ];
 
    const stock = await WatchlistStock.findOne({ tickerSymbol: ticker });
    if (!stock) return res.status(404).json({ error: "Stock not found" });
 
    const yearEntry = stock.annualData.find(
      (y) => y.fiscalYear === fiscalYear
    );
    if (!yearEntry) return res.status(404).json({ error: "Year not found" });
 
    // Apply each override from the request body
    for (const metric of allowedMetrics) {
      if (req.body[metric] !== undefined) {
        yearEntry[metric].userValue = req.body[metric];
        yearEntry[metric].lastOverriddenAt = new Date();
        
        // Recalculate effective value
        const resolved = resolveEffectiveValue(yearEntry[metric]);
        yearEntry[metric].effectiveValue = resolved.effectiveValue;
        yearEntry[metric].sourceOfTruth = resolved.sourceOfTruth;
      }
    }
 
    // Recalculate derived values (marketCap)
    recalculateDerived(yearEntry);
 
    await stock.save();
    res.json(stock);
  } catch (err) { next(err); }
}
 
module.exports = { setAnnualOverride };
