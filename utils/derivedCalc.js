// This utility file recalculates any values that depend on other values. 


// Right now, the only derived metric is marketCap however we will add more as we build out the app.
// marketCap = stockPrice * sharesOutstanding

// Rule: if any of the underlying values are overridden by the user, 
// we have to recalculate the derived metric using the userValue instead of the roicValue.

function recalculateDerived(annualEntry) {
  const price = annualEntry.stockPrice.effectiveValue;
  const shares = annualEntry.sharesOutstanding.effectiveValue;
 
  if (price != null && shares != null) {
    annualEntry.marketCap.roicValue = price * shares;
    annualEntry.marketCap.effectiveValue = price * shares;
    annualEntry.marketCap.sourceOfTruth = "derived";
  }
 
  return annualEntry;
}
 
module.exports = { recalculateDerived };


