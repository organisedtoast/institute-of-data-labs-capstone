const { assignMetricValue } = require("./metricField");
const { getNestedValue } = require("./pathUtils");

function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function divideIfPossible(numerator, denominator) {
  const safeNumerator = toFiniteNumber(numerator);
  const safeDenominator = toFiniteNumber(denominator);

  if (safeNumerator === null || safeDenominator === null || safeDenominator === 0) {
    return null;
  }

  return safeNumerator / safeDenominator;
}

function getMetricEffectiveValue(target, path) {
  return getNestedValue(target, path)?.effectiveValue ?? null;
}

function writeDerivedMetric(target, path, value, sourceOfTruth = "derived") {
  const metricField = getNestedValue(target, path);
  if (!metricField) {
    return;
  }

  assignMetricValue(metricField, value, sourceOfTruth);
}

function recalculateAnnualDerived(annualEntry, olderAnnualEntry = null) {
  const sharePrice = getMetricEffectiveValue(annualEntry, "base.sharePrice");
  const sharesOnIssue = getMetricEffectiveValue(annualEntry, "base.sharesOnIssue");
  const cash = getMetricEffectiveValue(annualEntry, "balanceSheet.cash");
  const nonCashInvestments = getMetricEffectiveValue(annualEntry, "balanceSheet.nonCashInvestments");
  const debt = getMetricEffectiveValue(annualEntry, "balanceSheet.debt");
  const ebitda = getMetricEffectiveValue(annualEntry, "incomeStatement.ebitda");
  const ebit = getMetricEffectiveValue(annualEntry, "incomeStatement.ebit");
  const netInterestExpense = getMetricEffectiveValue(annualEntry, "incomeStatement.netInterestExpense");
  const assets = getMetricEffectiveValue(annualEntry, "balanceSheet.assets");
  const liabilities = getMetricEffectiveValue(annualEntry, "balanceSheet.liabilities");
  const revenue = getMetricEffectiveValue(annualEntry, "incomeStatement.revenue");
  const grossProfit = getMetricEffectiveValue(annualEntry, "incomeStatement.grossProfit");
  const npat = getMetricEffectiveValue(annualEntry, "incomeStatement.npat");
  const depreciationAndAmortization = getMetricEffectiveValue(annualEntry, "incomeStatement.depreciationAndAmortization");
  const tangibleBookValuePerShare = getMetricEffectiveValue(annualEntry, "valuationMultiples.tangibleBookValuePerShare");
  const epsTrailing = getMetricEffectiveValue(annualEntry, "epsAndDividends.epsTrailing");
  const dpsTrailing = getMetricEffectiveValue(annualEntry, "epsAndDividends.dpsTrailing");
  const olderDetailedShares = olderAnnualEntry
    ? getMetricEffectiveValue(olderAnnualEntry, "base.sharesOnIssue")
    : null;

  writeDerivedMetric(
    annualEntry,
    "balanceSheet.nonCashInvestments",
    nonCashInvestments ?? 0,
    "system"
  );

  writeDerivedMetric(
    annualEntry,
    "base.marketCap",
    toFiniteNumber(sharePrice) !== null && toFiniteNumber(sharesOnIssue) !== null
      ? sharePrice * sharesOnIssue
      : null
  );

  writeDerivedMetric(
    annualEntry,
    "balanceSheet.netDebtOrCash",
    toFiniteNumber(debt) !== null && toFiniteNumber(cash) !== null
      ? debt - (nonCashInvestments ?? 0) - cash
      : null
  );

  const netDebtOrCash = getMetricEffectiveValue(annualEntry, "balanceSheet.netDebtOrCash");

  writeDerivedMetric(
    annualEntry,
    "balanceSheet.netDebtToEbitda",
    toFiniteNumber(netDebtOrCash) !== null && netDebtOrCash > 0
      ? divideIfPossible(netDebtOrCash, ebitda)
      : null
  );

  writeDerivedMetric(
    annualEntry,
    "balanceSheet.ebitInterestCoverage",
    toFiniteNumber(ebit) !== null && ebit > 0 && toFiniteNumber(netInterestExpense) !== null && netInterestExpense > 0
      ? ebit / netInterestExpense
      : null
  );

  writeDerivedMetric(
    annualEntry,
    "balanceSheet.leverageRatio",
    divideIfPossible(assets, liabilities)
  );

  writeDerivedMetric(
    annualEntry,
    "balanceSheet.enterpriseValueTrailing",
    toFiniteNumber(getMetricEffectiveValue(annualEntry, "base.marketCap")) !== null
      && toFiniteNumber(netDebtOrCash) !== null
      ? getMetricEffectiveValue(annualEntry, "base.marketCap") + netDebtOrCash
      : null
  );

  writeDerivedMetric(
    annualEntry,
    "incomeStatement.codb",
    toFiniteNumber(ebitda) !== null && toFiniteNumber(grossProfit) !== null
      ? ebitda - grossProfit
      : null
  );

  writeDerivedMetric(
    annualEntry,
    "ownerEarningsBridge.deemedMaintenanceCapex",
    depreciationAndAmortization,
    depreciationAndAmortization === null ? "system" : "derived"
  );

  const deemedMaintenanceCapex = getMetricEffectiveValue(annualEntry, "ownerEarningsBridge.deemedMaintenanceCapex");

  writeDerivedMetric(
    annualEntry,
    "ownerEarningsBridge.ownerEarnings",
    [ebitda, deemedMaintenanceCapex, getMetricEffectiveValue(annualEntry, "incomeStatement.incomeTaxExpense"), netInterestExpense]
      .every((value) => toFiniteNumber(value) !== null)
      ? ebitda - deemedMaintenanceCapex - getMetricEffectiveValue(annualEntry, "incomeStatement.incomeTaxExpense") - netInterestExpense
      : null
  );

  writeDerivedMetric(
    annualEntry,
    "sharesAndMarketCap.changeInShares",
    toFiniteNumber(sharesOnIssue) !== null && toFiniteNumber(olderDetailedShares) !== null
      ? sharesOnIssue - olderDetailedShares
      : null
  );

  writeDerivedMetric(
    annualEntry,
    "valuationMultiples.evSalesTrailing",
    divideIfPossible(getMetricEffectiveValue(annualEntry, "balanceSheet.enterpriseValueTrailing"), revenue)
  );

  writeDerivedMetric(
    annualEntry,
    "valuationMultiples.ebitdaMarginTrailing",
    divideIfPossible(ebitda, revenue)
  );

  writeDerivedMetric(
    annualEntry,
    "valuationMultiples.ebitMarginTrailing",
    divideIfPossible(ebit, revenue)
  );

  writeDerivedMetric(
    annualEntry,
    "valuationMultiples.npatMarginTrailing",
    divideIfPossible(npat, revenue)
  );

  writeDerivedMetric(
    annualEntry,
    "valuationMultiples.evEbitTrailing",
    divideIfPossible(getMetricEffectiveValue(annualEntry, "balanceSheet.enterpriseValueTrailing"), ebit)
  );

  writeDerivedMetric(
    annualEntry,
    "valuationMultiples.priceToNta",
    divideIfPossible(sharePrice, tangibleBookValuePerShare)
  );

  writeDerivedMetric(
    annualEntry,
    "valuationMultiples.dividendPayout",
    divideIfPossible(dpsTrailing, epsTrailing)
  );

  writeDerivedMetric(
    annualEntry,
    "epsAndDividends.dyTrailing",
    divideIfPossible(dpsTrailing, sharePrice)
  );

  return annualEntry;
}

function recalculateForecastDerived(stock) {
  const latestAnnualEntry = Array.isArray(stock.annualData) && stock.annualData.length > 0
    ? stock.annualData[0]
    : null;
  const latestSharePrice = latestAnnualEntry
    ? getMetricEffectiveValue(latestAnnualEntry, "base.sharePrice")
    : null;
  const latestNetDebt = latestAnnualEntry
    ? getMetricEffectiveValue(latestAnnualEntry, "balanceSheet.netDebtOrCash")
    : null;

  for (const bucketName of ["fy1", "fy2", "fy3"]) {
    const bucket = stock.forecastData?.[bucketName];
    if (!bucket) {
      continue;
    }

    const forecastShares = bucket.sharesOnIssue?.effectiveValue ?? null;
    const forecastEbit = bucket.ebit?.effectiveValue ?? null;
    const forecastEps = bucket.eps?.effectiveValue ?? null;
    const forecastDps = bucket.dps?.effectiveValue ?? null;

    writeDerivedMetric(
      stock.forecastData[bucketName],
      "marketCap",
      toFiniteNumber(latestSharePrice) !== null && toFiniteNumber(forecastShares) !== null
        ? latestSharePrice * forecastShares
        : null
    );

    const forecastMarketCap = stock.forecastData[bucketName].marketCap.effectiveValue;
    writeDerivedMetric(
      stock.forecastData[bucketName],
      "enterpriseValue",
      toFiniteNumber(forecastMarketCap) !== null && toFiniteNumber(latestNetDebt) !== null
        ? forecastMarketCap + latestNetDebt
        : null
    );

    writeDerivedMetric(
      stock.forecastData[bucketName],
      "pe",
      divideIfPossible(latestSharePrice, forecastEps)
    );

    writeDerivedMetric(
      stock.forecastData[bucketName],
      "dy",
      divideIfPossible(forecastDps, latestSharePrice)
    );

    writeDerivedMetric(
      stock.forecastData[bucketName],
      "evEbit",
      divideIfPossible(
        stock.forecastData[bucketName].enterpriseValue.effectiveValue,
        forecastEbit
      )
    );
  }
}

function recalculateDerived(stock) {
  if (Array.isArray(stock.annualData)) {
    for (let index = 0; index < stock.annualData.length; index += 1) {
      const annualEntry = stock.annualData[index];
      const olderAnnualEntry = stock.annualData[index + 1] || null;
      recalculateAnnualDerived(annualEntry, olderAnnualEntry);
    }
  }

  recalculateForecastDerived(stock);
  return stock;
}

module.exports = {
  recalculateAnnualDerived,
  recalculateDerived,
};
