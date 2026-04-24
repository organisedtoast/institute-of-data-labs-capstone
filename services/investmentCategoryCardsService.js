const { CATEGORY_NAMES } = require("../catalog/fieldCatalog");
const Lens = require("../models/Lens");
const WatchlistStock = require("../models/WatchlistStock");
const InvestmentCategoryConstituentPreference = require("../models/InvestmentCategoryConstituentPreference");
const StockPriceHistoryCache = require("../models/StockPriceHistoryCache");
const roicService = require("./roicService");

const MONTH_STRING_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEFAULT_PRESET_MONTH_COUNT = 60;
const CONSTITUENT_STATUS_ORDER = {
  active: 0,
  userDisabled: 1,
  unavailable: 2,
};

function isValidMonthString(monthString) {
  return typeof monthString === "string" && MONTH_STRING_PATTERN.test(monthString);
}

function normalizeTickerSymbol(tickerSymbol) {
  return String(tickerSymbol || "").trim().toUpperCase();
}

function normalizeMonthString(monthString) {
  return isValidMonthString(monthString) ? monthString : "";
}

function getMonthStringFromDate(dateValue) {
  if (typeof dateValue !== "string") {
    return "";
  }

  const trimmedValue = dateValue.trim();
  if (trimmedValue.length < 7) {
    return "";
  }

  const monthString = trimmedValue.slice(0, 7);
  return isValidMonthString(monthString) ? monthString : "";
}

function compareMonthStrings(leftMonth, rightMonth) {
  if (!isValidMonthString(leftMonth) || !isValidMonthString(rightMonth)) {
    return 0;
  }

  if (leftMonth === rightMonth) {
    return 0;
  }

  return leftMonth < rightMonth ? -1 : 1;
}

function shiftMonthString(monthString, monthsToShift = 0) {
  if (!isValidMonthString(monthString)) {
    return "";
  }

  const [yearText, monthText] = monthString.split("-");
  const shiftedDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + monthsToShift, 1));

  return `${shiftedDate.getUTCFullYear()}-${String(shiftedDate.getUTCMonth() + 1).padStart(2, "0")}`;
}

function clampMonthString(monthString, minAvailableMonth, maxAvailableMonth) {
  if (!isValidMonthString(monthString)) {
    return "";
  }

  if (isValidMonthString(minAvailableMonth) && compareMonthStrings(monthString, minAvailableMonth) < 0) {
    return minAvailableMonth;
  }

  if (isValidMonthString(maxAvailableMonth) && compareMonthStrings(monthString, maxAvailableMonth) > 0) {
    return maxAvailableMonth;
  }

  return monthString;
}

function getTrailingMonthRange({ monthCount, minAvailableMonth, maxAvailableMonth }) {
  if (!isValidMonthString(minAvailableMonth) || !isValidMonthString(maxAvailableMonth)) {
    return {
      startMonth: "",
      endMonth: "",
    };
  }

  const safeMonthCount = Math.max(1, Number(monthCount) || DEFAULT_PRESET_MONTH_COUNT);
  return {
    startMonth: clampMonthString(
      shiftMonthString(maxAvailableMonth, -safeMonthCount),
      minAvailableMonth,
      maxAvailableMonth
    ),
    endMonth: maxAvailableMonth,
  };
}

function getDisplayNameForStock(stockDocument) {
  const rawName =
    stockDocument?.companyName?.effectiveValue ||
    stockDocument?.companyName?.userValue ||
    stockDocument?.companyName?.roicValue ||
    stockDocument?.tickerSymbol;

  return typeof rawName === "string" && rawName.trim()
    ? rawName.trim()
    : normalizeTickerSymbol(stockDocument?.tickerSymbol);
}

function normalizeMonthlyPricePoints(pricePoints = []) {
  return pricePoints
    .map((pricePoint) => ({
      month: getMonthStringFromDate(pricePoint?.month || pricePoint?.date),
      date: typeof pricePoint?.date === "string" ? pricePoint.date : "",
      close: typeof pricePoint?.close === "number" && Number.isFinite(pricePoint.close)
        ? pricePoint.close
        : null,
    }))
    .filter((pricePoint) => pricePoint.month && pricePoint.date && pricePoint.close !== null)
    .sort((left, right) => left.month.localeCompare(right.month));
}

function convertDailyPricesToMonthlyPrices(dailyPrices = []) {
  const monthlyPriceMap = new Map();

  dailyPrices.forEach((priceRow) => {
    if (!priceRow?.date || typeof priceRow.close !== "number" || !Number.isFinite(priceRow.close)) {
      return;
    }

    const month = getMonthStringFromDate(priceRow.date);
    if (!month) {
      return;
    }

    // ROIC prices are requested in ascending order, so replacing the same
    // month key gives us the final trading close for that month.
    monthlyPriceMap.set(month, {
      month,
      date: priceRow.date,
      close: priceRow.close,
    });
  });

  return Array.from(monthlyPriceMap.values()).sort((left, right) => left.month.localeCompare(right.month));
}

function buildMonthList(startMonth, endMonth) {
  if (!isValidMonthString(startMonth) || !isValidMonthString(endMonth) || compareMonthStrings(startMonth, endMonth) > 0) {
    return [];
  }

  const months = [];
  let currentMonth = startMonth;

  while (currentMonth && compareMonthStrings(currentMonth, endMonth) <= 0) {
    months.push(currentMonth);
    currentMonth = shiftMonthString(currentMonth, 1);
  }

  return months;
}

function buildIndexedSeriesForStock(pricePoints, visibleMonths) {
  if (!Array.isArray(pricePoints) || !visibleMonths.length) {
    return null;
  }

  const pointByMonth = new Map(pricePoints.map((pricePoint) => [pricePoint.month, pricePoint]));
  const anchorPoint = pointByMonth.get(visibleMonths[0]);

  if (!anchorPoint || typeof anchorPoint.close !== "number" || anchorPoint.close <= 0) {
    return null;
  }

  return visibleMonths
    .map((month) => {
      const pricePoint = pointByMonth.get(month);
      if (!pricePoint || typeof pricePoint.close !== "number" || pricePoint.close <= 0) {
        return null;
      }

      return {
        month,
        date: pricePoint.date,
        indexedValue: (pricePoint.close / anchorPoint.close) * 100,
      };
    })
    .filter(Boolean);
}

function buildAggregateSeries(activeConstituents, visibleMonths) {
  if (!visibleMonths.length) {
    return [];
  }

  return visibleMonths
    .map((month) => {
      const monthValues = activeConstituents
        .map((constituent) => constituent.indexedSeriesByMonth.get(month))
        .filter((value) => typeof value === "number" && Number.isFinite(value));

      if (!monthValues.length) {
        return null;
      }

      const averageIndexedValue = monthValues.reduce((sum, value) => sum + value, 0) / monthValues.length;
      return {
        date: `${month}-01`,
        close: Number(averageIndexedValue.toFixed(4)),
      };
    })
    .filter(Boolean);
}

function getEmptyStateMessage({ totalStocks, activeCount, userDisabledCount, unavailableCount }) {
  if (!totalStocks) {
    return "No stocks are currently tagged with this investment category.";
  }

  if (userDisabledCount > 0 && activeCount === 0 && unavailableCount === 0) {
    return "Every constituent in this investment category is currently disabled.";
  }

  return "No active constituents have data for this visible range.";
}

async function findActiveInvestmentCategories() {
  const activeLenses = await Lens.find({ isActive: true }).lean();
  const activeLensByName = new Map(activeLenses.map((lens) => [lens.name, lens]));
  const orderedLenses = CATEGORY_NAMES
    .map((categoryName) => activeLensByName.get(categoryName))
    .filter(Boolean);
  const extraLenses = activeLenses
    .filter((lens) => !CATEGORY_NAMES.includes(lens.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  return [...orderedLenses, ...extraLenses];
}

async function ensureMonthlyPriceCacheForTicker(tickerSymbol) {
  const normalizedTicker = normalizeTickerSymbol(tickerSymbol);
  const existingCache = await StockPriceHistoryCache.findOne({ tickerSymbol: normalizedTicker }).lean();

  if (existingCache) {
    return {
      ...existingCache,
      pricePoints: normalizeMonthlyPricePoints(existingCache.pricePoints),
    };
  }

  const dailyPrices = await roicService.fetchStockPrices(normalizedTicker, {
    order: "ASC",
    limit: 100000,
  });
  const monthlyPricePoints = convertDailyPricesToMonthlyPrices(dailyPrices);

  const createdCache = await StockPriceHistoryCache.create({
    tickerSymbol: normalizedTicker,
    pricePoints: monthlyPricePoints,
    earliestMonth: monthlyPricePoints[0]?.month || "",
    latestMonth: monthlyPricePoints[monthlyPricePoints.length - 1]?.month || "",
    lastSyncedAt: new Date(),
  });

  return {
    ...createdCache.toObject(),
    pricePoints: monthlyPricePoints,
  };
}

async function resolvePriceCachesForStocks(stockDocuments = []) {
  const normalizedTickers = stockDocuments
    .map((stockDocument) => normalizeTickerSymbol(stockDocument?.tickerSymbol))
    .filter(Boolean);
  const cachedPriceHistories = await StockPriceHistoryCache.find({
    tickerSymbol: { $in: normalizedTickers },
  }).lean();
  const cachedPriceHistoryByTicker = new Map(
    cachedPriceHistories.map((priceHistory) => [
      normalizeTickerSymbol(priceHistory.tickerSymbol),
      {
        ...priceHistory,
        pricePoints: normalizeMonthlyPricePoints(priceHistory.pricePoints),
      },
    ])
  );

  const priceCacheEntries = await Promise.all(
    normalizedTickers.map(async (tickerSymbol) => {
      const cachedPriceHistory = cachedPriceHistoryByTicker.get(tickerSymbol);

      if (cachedPriceHistory) {
        return [tickerSymbol, cachedPriceHistory];
      }

      try {
        const createdPriceHistory = await ensureMonthlyPriceCacheForTicker(tickerSymbol);
        return [tickerSymbol, createdPriceHistory];
      } catch {
        // The category card should still load even when one stock's price
        // history cannot be fetched right now. We treat that stock as
        // unavailable instead of failing the entire card request.
        return [tickerSymbol, {
          tickerSymbol,
          pricePoints: [],
          earliestMonth: "",
          latestMonth: "",
          lastSyncedAt: null,
        }];
      }
    })
  );

  return new Map(priceCacheEntries);
}

function getCategoryBounds(priceCaches) {
  let earliestMonth = "";
  let latestMonth = "";

  priceCaches.forEach((priceCache) => {
    const cacheEarliestMonth = normalizeMonthString(priceCache?.earliestMonth) || priceCache?.pricePoints?.[0]?.month || "";
    const cacheLatestMonth = normalizeMonthString(priceCache?.latestMonth) || priceCache?.pricePoints?.at?.(-1)?.month || "";

    if (cacheEarliestMonth && (!earliestMonth || compareMonthStrings(cacheEarliestMonth, earliestMonth) < 0)) {
      earliestMonth = cacheEarliestMonth;
    }

    if (cacheLatestMonth && (!latestMonth || compareMonthStrings(cacheLatestMonth, latestMonth) > 0)) {
      latestMonth = cacheLatestMonth;
    }
  });

  return {
    earliestMonth,
    latestMonth,
  };
}

function buildNormalizedCardRequest(requestedCard, availableBounds) {
  const requestedStartMonth = normalizeMonthString(requestedCard?.startMonth);
  const requestedEndMonth = normalizeMonthString(requestedCard?.endMonth);

  if (!requestedStartMonth || !requestedEndMonth) {
    return getTrailingMonthRange({
      monthCount: DEFAULT_PRESET_MONTH_COUNT,
      minAvailableMonth: availableBounds.earliestMonth,
      maxAvailableMonth: availableBounds.latestMonth,
    });
  }

  return {
    startMonth: clampMonthString(
      requestedStartMonth,
      availableBounds.earliestMonth,
      availableBounds.latestMonth
    ),
    endMonth: clampMonthString(
      requestedEndMonth,
      availableBounds.earliestMonth,
      availableBounds.latestMonth
    ),
  };
}

function sortConstituents(constituents) {
  return [...constituents].sort((left, right) => {
    const statusOrderDifference = CONSTITUENT_STATUS_ORDER[left.status] - CONSTITUENT_STATUS_ORDER[right.status];
    if (statusOrderDifference !== 0) {
      return statusOrderDifference;
    }

    return left.tickerSymbol.localeCompare(right.tickerSymbol);
  });
}

async function buildInvestmentCategoryCard({
  investmentCategory,
  startMonth = "",
  endMonth = "",
}) {
  const watchlistStocks = await WatchlistStock.find({ investmentCategory }).lean();
  const constituentPreferences = await InvestmentCategoryConstituentPreference.find({ investmentCategory }).lean();
  const preferenceByTicker = new Map(
    constituentPreferences.map((preference) => [normalizeTickerSymbol(preference.tickerSymbol), preference])
  );

  const requestedStartMonth = normalizeMonthString(startMonth);
  const requestedEndMonth = normalizeMonthString(endMonth);
  const priceCacheByTicker = await resolvePriceCachesForStocks(watchlistStocks);
  const stocksWithPriceCache = watchlistStocks.map((stockDocument) => ({
    stockDocument,
    priceCache: priceCacheByTicker.get(normalizeTickerSymbol(stockDocument.tickerSymbol)) || {
      tickerSymbol: normalizeTickerSymbol(stockDocument.tickerSymbol),
      pricePoints: [],
      earliestMonth: "",
      latestMonth: "",
      lastSyncedAt: null,
    },
  }));

  const categoryBounds = getCategoryBounds(stocksWithPriceCache.map((entry) => entry.priceCache));
  const normalizedCardRange = buildNormalizedCardRequest(
    { startMonth, endMonth },
    categoryBounds
  );
  const visibleMonths = buildMonthList(normalizedCardRange.startMonth, normalizedCardRange.endMonth);

  const constituents = stocksWithPriceCache.map(({ stockDocument, priceCache }) => {
    const tickerSymbol = normalizeTickerSymbol(stockDocument.tickerSymbol);
    const preference = preferenceByTicker.get(tickerSymbol);
    const isEnabled = preference ? preference.isEnabled !== false : true;
    const indexedSeries = buildIndexedSeriesForStock(priceCache.pricePoints, visibleMonths);
    const isEligibleForRange = Boolean(indexedSeries);

    let status = "active";
    if (!isEnabled) {
      status = "userDisabled";
    } else if (!isEligibleForRange) {
      status = "unavailable";
    }

    return {
      tickerSymbol,
      companyName: getDisplayNameForStock(stockDocument),
      status,
      isEnabled,
      isToggleable: true,
      monthlyPricePoints: priceCache.pricePoints,
      indexedSeriesByMonth: new Map((indexedSeries || []).map((seriesPoint) => [seriesPoint.month, seriesPoint.indexedValue])),
    };
  });

  const activeConstituents = constituents.filter((constituent) => constituent.status === "active");
  const aggregateSeries = buildAggregateSeries(activeConstituents, visibleMonths);
  const counts = {
    active: constituents.filter((constituent) => constituent.status === "active").length,
    userDisabled: constituents.filter((constituent) => constituent.status === "userDisabled").length,
    unavailable: constituents.filter((constituent) => constituent.status === "unavailable").length,
  };

  return {
    investmentCategory,
    minAvailableMonth: categoryBounds.earliestMonth,
    maxAvailableMonth: categoryBounds.latestMonth,
    startMonth: normalizedCardRange.startMonth,
    endMonth: normalizedCardRange.endMonth,
    isCanonicalInitialRange: !requestedStartMonth || !requestedEndMonth,
    series: aggregateSeries,
    counts,
    emptyStateMessage: aggregateSeries.length
      ? ""
      : getEmptyStateMessage({
          totalStocks: watchlistStocks.length,
          activeCount: counts.active,
          userDisabledCount: counts.userDisabled,
          unavailableCount: counts.unavailable,
        }),
    constituents: sortConstituents(
      constituents.map((constituent) => ({
        tickerSymbol: constituent.tickerSymbol,
        companyName: constituent.companyName,
        status: constituent.status,
        isEnabled: constituent.isEnabled,
        isToggleable: constituent.isToggleable,
      }))
    ),
  };
}

async function queryInvestmentCategoryCards(requestedCards = []) {
  const activeLenses = await findActiveInvestmentCategories();
  const activeCategoryNames = activeLenses.map((lens) => lens.name);
  const requestedCategories = Array.isArray(requestedCards) && requestedCards.length
    ? requestedCards.map((card) => card?.investmentCategory).filter(Boolean)
    : activeCategoryNames;

  const invalidCategory = requestedCategories.find((categoryName) => !activeCategoryNames.includes(categoryName));
  if (invalidCategory) {
    const error = new Error(`Unknown investmentCategory: ${invalidCategory}`);
    error.statusCode = 400;
    throw error;
  }

  const requestedCardByCategory = new Map(
    (Array.isArray(requestedCards) ? requestedCards : [])
      .filter((card) => card?.investmentCategory)
      .map((card) => [card.investmentCategory, card])
  );

  const orderedCategories = Array.isArray(requestedCards) && requestedCards.length
    ? requestedCategories
    : activeCategoryNames;

  const cards = await Promise.all(
    orderedCategories.map((investmentCategory) =>
      buildInvestmentCategoryCard({
        investmentCategory,
        startMonth: requestedCardByCategory.get(investmentCategory)?.startMonth || "",
        endMonth: requestedCardByCategory.get(investmentCategory)?.endMonth || "",
      })
    )
  );

  return {
    cards,
  };
}

async function setInvestmentCategoryConstituentEnabledState({
  investmentCategory,
  tickerSymbol,
  isEnabled,
  startMonth = "",
  endMonth = "",
}) {
  const normalizedTicker = normalizeTickerSymbol(tickerSymbol);

  await InvestmentCategoryConstituentPreference.findOneAndUpdate(
    {
      investmentCategory,
      tickerSymbol: normalizedTicker,
    },
    {
      investmentCategory,
      tickerSymbol: normalizedTicker,
      isEnabled: Boolean(isEnabled),
    },
    {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
    }
  );

  return buildInvestmentCategoryCard({
    investmentCategory,
    startMonth,
    endMonth,
  });
}

module.exports = {
  buildAggregateSeries,
  buildIndexedSeriesForStock,
  buildInvestmentCategoryCard,
  compareMonthStrings,
  convertDailyPricesToMonthlyPrices,
  getTrailingMonthRange,
  isValidMonthString,
  queryInvestmentCategoryCards,
  setInvestmentCategoryConstituentEnabledState,
  shiftMonthString,
};
