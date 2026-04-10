// This utility file finds the stock price on the first trading day after the
// chosen market anchor date.

// The anchor date is now a hybrid field:
// - prefer the earnings-call date when ROIC provides it
// - otherwise fall back to the annual period-end date
//
// This gives the app a consistent date to anchor prices against even when the
// upstream earnings-call dataset is incomplete.

function selectPriceAfterAnchorDate(anchorDate, priceHistory) {
  // priceHistory is an array of { date, close } sorted by date.
  // We find the first entry whose date is after the chosen anchor date.
  const normalizedAnchorDate = new Date(anchorDate);
 
  const match = priceHistory.find(
    (entry) => new Date(entry.date) > normalizedAnchorDate
  );
 
  // Return the close price, or null if no later date exists.
  return match ? match.close : null;
}
 
module.exports = { selectPriceAfterAnchorDate };
