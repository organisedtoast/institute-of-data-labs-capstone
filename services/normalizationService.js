// This service translates raw ROIC responses into the exact document shape
// expected by the WatchlistStock Mongoose model.
//
// The most important design goal here is resilience:
// ROIC payload shapes can vary by endpoint or plan, so we isolate "guessy"
// field-name assumptions into small helper functions rather than scattering
// them across the transformation flow.
//
// That way, when you get real sample payloads later, you should only need to
// adjust a few extractors instead of rewriting the whole service.

const { selectPriceAfterAnchorDate } = require("../utils/priceSelector");

// These are the endpoint names we want to record in sourceMeta so imported
// documents show exactly which upstream datasets were used to construct them.
const ROIC_ENDPOINTS_USED = [
  "company/profile",
  "annual/per-share",
  "annual/profitability",
  "stock-prices",
  "earnings-calls",
];

// This helper safely checks whether a value is a plain object.
// We use it throughout the service when payloads may be arrays, null, or nested.
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ROIC commonly returns number-like strings such as "2.45" or "103000000".
// Converting them once at the edge keeps the rest of the code predictable.
function coerceNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    const normalized = trimmed.replace(/,/g, "");
    const numericValue = Number(normalized);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  return null;
}

// Some imported values should stay as strings or dates instead of being forced
// into numbers. This helper centralizes the "null out empty values" behavior.
function coerceScalar(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return value;
}

// Every user-overridable field in the schema shares the same internal shape.
// Normalization always starts with ROIC data as the source of truth.
function wrapImportedValue(value, sourceOfTruth = "roic") {
  return {
    roicValue: value,
    userValue: null,
    effectiveValue: value,
    sourceOfTruth,
    lastOverriddenAt: null,
  };
}

// Because we do not yet have confirmed ROIC payload samples, this
// helper looks for the "most likely" annual array using a few common key names.
// If the endpoint already returns an array, we use it directly.
function extractAnnualRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isObject(payload)) {
    return [];
  }

  const candidateKeys = [
    "data",
    "results",
    "annual",
    "annualData",
    "rows",
    "items",
  ];

  for (const key of candidateKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

// Similar to the annual-array helper above, this function extracts the most
// likely list of price rows from the stock-prices payload.
function extractPriceRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isObject(payload)) {
    return [];
  }

  const candidateKeys = ["prices", "data", "results", "rows", "items"];

  for (const key of candidateKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

// Earnings-call payloads can also be top-level arrays or wrapped in a "data"
// object. We normalize them separately because they need date-specific parsing.
function extractEarningsRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isObject(payload)) {
    return [];
  }

  const candidateKeys = ["earnings", "calls", "data", "results", "rows", "items"];

  for (const key of candidateKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

// This small utility tries a list of possible field names and returns the first
// non-empty value. It keeps field-name assumptions readable and easy to update.
function pickFirstDefined(source, keys) {
  if (!isObject(source)) {
    return undefined;
  }

  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

// Fiscal-year alignment is the heart of the normalization service.
// We always match rows by fiscal year label rather than by array position.
function getFiscalYear(row) {
  const rawYear = pickFirstDefined(row, [
    "fiscalYear",
    "fiscal_year",
    "year",
    "calendarYear",
    "calendar_year",
    "fy",
  ]);

  const numericYear = Number(rawYear);
  return Number.isInteger(numericYear) ? numericYear : null;
}

// Fiscal year end dates are stored on the annualData row itself and also serve
// as the fallback market anchor when no earnings-call date exists for a year.
function getFiscalYearEndDate(row) {
  const rawDate = pickFirstDefined(row, [
    "fiscalYearEndDate",
    "fiscal_year_end_date",
    "fiscalYearEnd",
    "fiscal_year_end",
    "periodEndDate",
    "period_end_date",
    "date",
  ]);

  return normalizeDateString(rawDate);
}

// ROIC may label shares-outstanding differently depending on the endpoint.
// We prefer the most explicit field names first.
function getSharesOutstanding(row) {
  return coerceNumber(pickFirstDefined(row, [
    "bs_sh_out",
    "sharesOutstanding",
    "shares_outstanding",
    "is_avg_num_sh_for_eps",
    "is_sh_for_diluted_eps",
    "weightedAverageShsOut",
    "weighted_average_shares_outstanding",
    "weightedAverageSharesOutstanding",
    "shareCount",
    "share_count",
  ]));
}

// Same idea for ROIC: we only keep the approved metric that belongs in the model.
function getReturnOnInvestedCapital(row) {
  return coerceNumber(pickFirstDefined(row, [
    "return_on_inv_capital",
    "returnOnInvestedCapital",
    "return_on_invested_capital",
    "roic",
    "roicPercent",
    "roic_percent",
  ]));
}

// Company profile endpoints often include different name keys.
function getCompanyName(profile) {
  return coerceScalar(pickFirstDefined(profile, [
    "companyName",
    "company_name",
    "name",
    "displayName",
    "display_name",
  ]));
}

// Currency may also arrive under several aliases.
function getPriceCurrency(profile) {
  return coerceScalar(pickFirstDefined(profile, [
    "priceCurrency",
    "price_currency",
    "currency",
    "reportedCurrency",
    "reported_currency",
  ]));
}

// We store dates as strings in this project, but still want them in a stable
// YYYY-MM-DD format whenever the input is parseable.
function normalizeDateString(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    const isoDateMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoDateMatch) {
      return isoDateMatch[0];
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

// Price selection depends on the history being in ascending order with numeric
// close values. We build that exact shape before calling the shared utility.
function normalizePriceHistory(pricesPayload) {
  const rows = extractPriceRows(pricesPayload);

  return rows
    .map((row) => ({
      date: normalizeDateString(pickFirstDefined(row, ["date", "day", "tradingDate", "trading_date"])),
      close: coerceNumber(pickFirstDefined(row, ["close", "adj_close", "adjustedClose", "adjusted_close"])),
    }))
    .filter((row) => row.date && row.close !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
}

// Earnings calls need slightly richer normalization because the matching logic
// uses both the date itself and, as a fallback, the fiscal-year label.
function normalizeEarningsCalls(earningsPayload) {
  const rows = extractEarningsRows(earningsPayload);

  return rows
    .map((row) => {
      const callDate = normalizeDateString(pickFirstDefined(row, [
        "date",
        "callDate",
        "call_date",
        "earningsCallDate",
        "earnings_call_date",
        "reportDate",
        "report_date",
      ]));

      return {
        date: callDate,
        fiscalYear: getFiscalYear(row),
      };
    })
    .filter((row) => row.date)
    .sort((left, right) => left.date.localeCompare(right.date));
}

// This helper chooses the best available post-fiscal-year anchor date.
// 1. Prefer a real earnings-call date on or after the fiscal year end.
// 2. Otherwise fall back to a call whose year matches the fiscal year label.
// 3. If the earnings-call dataset has no suitable row, fall back to the annual
//    period-end date so the app still has a consistent anchor for price lookup.
function selectMarketAnchorDate({ fiscalYear, fiscalYearEndDate, normalizedCalls }) {
  if (fiscalYearEndDate) {
    const matchAfterYearEnd = normalizedCalls.find((call) => call.date >= fiscalYearEndDate);
    if (matchAfterYearEnd) {
      return matchAfterYearEnd.date;
    }
  }

  const sameYearMatch = normalizedCalls.find((call) => {
    if (call.fiscalYear !== null && call.fiscalYear === fiscalYear) {
      return true;
    }

    const callYear = Number(call.date.slice(0, 4));
    return callYear === fiscalYear;
  });

  if (sameYearMatch) {
    return sameYearMatch.date;
  }

  return fiscalYearEndDate || null;
}

// We keep yearly rows sorted newest-first so a years=10 limit returns the most
// recent ten fiscal years rather than the oldest ten.
function sortYearsDescending(years) {
  return [...years].sort((left, right) => right - left);
}

// This function builds one annualData row using only the fields approved by the
// schema. Everything else from ROIC is intentionally dropped here.
function buildAnnualEntry({
  fiscalYear,
  fiscalYearEndDate,
  perShareRow,
  profitabilityRow,
  normalizedPrices,
  normalizedCalls,
}) {
  const sharesOutstanding = perShareRow ? getSharesOutstanding(perShareRow) : null;
  const returnOnInvestedCapital = profitabilityRow
    ? getReturnOnInvestedCapital(profitabilityRow)
    : null;

  const marketAnchorDate = selectMarketAnchorDate({
    fiscalYear,
    fiscalYearEndDate,
    normalizedCalls,
  });

  const stockPrice = marketAnchorDate
    ? selectPriceAfterAnchorDate(marketAnchorDate, normalizedPrices)
    : null;

  const marketCap = sharesOutstanding !== null && stockPrice !== null
    ? sharesOutstanding * stockPrice
    : null;

  return {
    fiscalYear,
    fiscalYearEndDate,
    marketAnchorDate: wrapImportedValue(marketAnchorDate),
    stockPrice: wrapImportedValue(stockPrice),
    sharesOutstanding: wrapImportedValue(sharesOutstanding),
    marketCap: wrapImportedValue(marketCap, marketCap !== null ? "derived" : "roic"),
    returnOnInvestedCapital: wrapImportedValue(returnOnInvestedCapital),
  };
}

// Public API: controllers call this to convert raw ROIC payloads into a plain
// object that can be passed straight into Mongoose.
function buildStockDocument({
  tickerSymbol,
  profile,
  perShare,
  profitability,
  prices,
  earnings,
  years = 10,
  investmentCategory = "",
}) {
  const normalizedTicker = String(tickerSymbol || "").toUpperCase().trim();
  const normalizedYearLimit = Math.max(Number(years) || 10, 0);
  const perShareRows = extractAnnualRows(perShare);
  const profitabilityRows = extractAnnualRows(profitability);
  const normalizedPrices = normalizePriceHistory(prices);
  const normalizedCalls = normalizeEarningsCalls(earnings);

  // Build lookup maps keyed by fiscal year so annual rows can be matched even
  // when the two ROIC endpoints return different lengths or orders.
  const perShareByYear = new Map();
  for (const row of perShareRows) {
    const fiscalYear = getFiscalYear(row);
    if (fiscalYear !== null && !perShareByYear.has(fiscalYear)) {
      perShareByYear.set(fiscalYear, row);
    }
  }

  const profitabilityByYear = new Map();
  for (const row of profitabilityRows) {
    const fiscalYear = getFiscalYear(row);
    if (fiscalYear !== null && !profitabilityByYear.has(fiscalYear)) {
      profitabilityByYear.set(fiscalYear, row);
    }
  }

  // Use the union of years from both annual endpoints.
  // This ensures a year is still imported even if one endpoint is missing it.
  const fiscalYears = sortYearsDescending([
    ...new Set([
      ...perShareByYear.keys(),
      ...profitabilityByYear.keys(),
    ]),
  ]).slice(0, normalizedYearLimit);

  const annualData = fiscalYears.map((fiscalYear) => {
    const perShareRow = perShareByYear.get(fiscalYear) || null;
    const profitabilityRow = profitabilityByYear.get(fiscalYear) || null;

    const fiscalYearEndDate = getFiscalYearEndDate(perShareRow)
      || getFiscalYearEndDate(profitabilityRow);

    return buildAnnualEntry({
      fiscalYear,
      fiscalYearEndDate,
      perShareRow,
      profitabilityRow,
      normalizedPrices,
      normalizedCalls,
    });
  });

  return {
    tickerSymbol: normalizedTicker,
    companyName: wrapImportedValue(getCompanyName(profile)),
    investmentCategory: investmentCategory || "",
    priceCurrency: getPriceCurrency(profile) || "USD",
    sourceMeta: {
      lastImportedAt: new Date(),
      importRangeYears: normalizedYearLimit,
      roicEndpointsUsed: ROIC_ENDPOINTS_USED,
    },
    annualData,
  };
}

module.exports = {
  buildStockDocument,
};

