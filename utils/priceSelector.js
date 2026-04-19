// This utility file finds the stock price on the first trading day after the
// chosen earnings release date.

// The earnings release date is now a hybrid field:
// - prefer the earnings-call date when ROIC provides it
// - otherwise fall back to fiscal year end plus 90 calendar days
//
// This gives the app a consistent date to anchor prices against even when the
// upstream earnings-call dataset is incomplete.

function selectPriceAfterAnchorDate(earningsReleaseDate, priceHistory) {
  // priceHistory is an array of { date, close } sorted by date.
  // We find the first entry whose date is after the chosen earnings release date.
  const normalizedEarningsReleaseDate = new Date(earningsReleaseDate);
 
  const match = priceHistory.find(
    (entry) => new Date(entry.date) > normalizedEarningsReleaseDate
  );
 
  // Return the close price, or null if no later date exists.
  return match ? match.close : null;
}
 
module.exports = { selectPriceAfterAnchorDate };
