const {
  ROIC_ENDPOINTS_USED,
} = require("../catalog/fieldCatalog");
const {
  createEmptyAnalystRevisions,
  createEmptyAnnualEntry,
  createEmptyForecastBucket,
  createEmptyGrowthForecasts,
} = require("../utils/documentFactory");
const { assignMetricValue, createMetricField } = require("../utils/metricField");
const { recalculateDerived } = require("../utils/derivedCalc");
const { selectPriceAfterAnchorDate } = require("../utils/priceSelector");

const ANNUAL_HISTORY_FETCH_VERSION = 2;

// Basic type guard used throughout the file when we expect a plain object.
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Converts incoming values into numbers where possible so later calculations
// can work with a consistent data type.
function coerceNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, "");
    if (normalized === "") {
      return null;
    }

    const numericValue = Number(normalized);
    return Number.isNaN(numericValue) ? null : numericValue;
  }

  return null;
}

// Normalizes simple values by turning empty inputs into null.
function coerceScalar(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return value;
}

// Standardizes many possible date inputs into YYYY-MM-DD format.
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

// Adds a number of days to a normalized date string.
function addDaysToDateString(dateString, daysToAdd) {
  const normalizedDate = normalizeDateString(dateString);
  if (!normalizedDate) {
    return null;
  }

  const parsed = new Date(`${normalizedDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setUTCDate(parsed.getUTCDate() + daysToAdd);
  return parsed.toISOString().slice(0, 10);
}

// Checks several possible field names and returns the first usable value.
// This helps us support slightly different API response shapes.
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

// Pulls annual-report rows out of whichever wrapper shape the payload uses.
function extractAnnualRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isObject(payload)) {
    return [];
  }

  const candidateKeys = ["data", "results", "annual", "annualData", "rows", "items"];
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

// Pulls price-history rows out of the payload.
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

// Pulls earnings-call rows out of the payload.
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

// Reads the fiscal year from a row, even when the source uses different names.
function getFiscalYear(row) {
  const rawYear = pickFirstDefined(row, [
    "fiscalYear",
    "fiscal_year",
    "fiscal_year_label",
    "year",
    "calendarYear",
    "calendar_year",
    "fy",
  ]);

  const numericYear = Number(rawYear);
  return Number.isInteger(numericYear) ? numericYear : null;
}

// Finds the row's year-end date and normalizes it.
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

// Reads basic company profile fields from alternative possible keys.
function getCompanyName(profile) {
  return coerceScalar(pickFirstDefined(profile, [
    "companyName",
    "company_name",
    "name",
    "displayName",
    "display_name",
  ]));
}

function getPriceCurrency(profile) {
  return coerceScalar(pickFirstDefined(profile, [
    "priceCurrency",
    "price_currency",
    "currency",
    "reportedCurrency",
    "reported_currency",
  ]));
}

// Converts raw price data into a clean, sorted list of { date, close } entries.
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

// Converts raw earnings-call data into a clean, sorted list that we can
// use to estimate when yearly results were released to the market.
function normalizeEarningsCalls(earningsPayload) {
  const rows = extractEarningsRows(earningsPayload);

  return rows
    .map((row) => ({
      date: normalizeDateString(pickFirstDefined(row, [
        "date",
        "callDate",
        "call_date",
        "earningsCallDate",
        "earnings_call_date",
        "reportDate",
        "report_date",
      ])),
      fiscalYear: getFiscalYear(row),
    }))
    .filter((row) => row.date)
    .sort((left, right) => left.date.localeCompare(right.date));
}

// Chooses the best earnings release date for a fiscal year.
// Prefer a real earnings-call date tied to the same fiscal year and released
// after year-end, otherwise fall back to an estimate around 90 days later.
function selectEarningsReleaseDate({ fiscalYear, fiscalYearEndDate, normalizedCalls }) {
  if (fiscalYearEndDate && Number.isInteger(fiscalYear)) {
    const matchingFiscalYearCall = normalizedCalls.find((call) => (
      call.fiscalYear === fiscalYear && call.date >= fiscalYearEndDate
    ));

    if (matchingFiscalYearCall) {
      return {
        date: matchingFiscalYearCall.date,
        sourceOfTruth: "roic",
      };
    }
  }

  return {
    date: addDaysToDateString(fiscalYearEndDate, 90),
    sourceOfTruth: "system",
  };
}

// The helpers below each read one business metric from a row.
// They exist because different data sources often name the same concept differently.
function getSharesOnIssue(row) {
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

function getCash(row) {
  return coerceNumber(pickFirstDefined(row, [
    "bs_c_and_ce_and_sti_detailed",
    "bs_cash_near_cash_item",
    "cash",
    "cashAndEquivalents",
  ]));
}

// Adds together several numeric fields when a value is spread across columns.
function sumCandidateNumbers(row, keys) {
  const numericValues = keys
    .map((key) => coerceNumber(row?.[key]))
    .filter((value) => value !== null);

  if (numericValues.length === 0) {
    return null;
  }

  return numericValues.reduce((sum, value) => sum + value, 0);
}

// Debt may be provided directly or split into short-term and long-term debt,
// so we support both cases here.
function getDebt(row) {
  return coerceNumber(pickFirstDefined(row, [
    "short_and_long_term_debt",
    "total_debt",
    "debt",
    "bs_tot_debt",
  ])) ?? sumCandidateNumbers(row, [
    "bs_st_debt",
    "bs_lt_borrow",
    "short_term_debt",
    "long_term_debt",
  ]);
}

function getAssets(row) {
  return coerceNumber(pickFirstDefined(row, [
    "bs_tot_asset",
    "assets",
    "total_assets",
  ]));
}

function getLiabilities(row) {
  return coerceNumber(pickFirstDefined(row, [
    "bs_tot_liab",
    "liabilities",
    "total_liabilities",
  ]));
}

function getEquity(row) {
  return coerceNumber(pickFirstDefined(row, [
    "bs_total_equity",
    "equity",
    "total_equity",
  ]));
}

function getRevenue(row) {
  return coerceNumber(pickFirstDefined(row, [
    "is_sales_revenue_turnover",
    "revenue",
    "salesRevenue",
    "sales_revenue",
  ]));
}

function getGrossProfit(row) {
  return coerceNumber(pickFirstDefined(row, [
    "is_gross_profit",
    "gross_profit",
    "grossProfit",
  ]));
}

function getEbitda(row) {
  return coerceNumber(pickFirstDefined(row, [
    "ebitda",
    "EBITDA",
  ]));
}

function getDepreciationAndAmortization(row) {
  return coerceNumber(pickFirstDefined(row, [
    "depreciation_and_amortization",
    "depreciationAndAmortization",
    "cf_dep_amort",
    "da",
  ]));
}

function getEbit(row) {
  return coerceNumber(pickFirstDefined(row, [
    "is_oper_income",
    "operating_income",
    "oper_income",
    "ebit",
  ]));
}

function getNetInterestExpense(row) {
  return coerceNumber(pickFirstDefined(row, [
    "net_interest_expense",
    "interest_expense_net",
    "is_int_expense_net_of_int_inc",
    "interestExpenseNet",
  ]));
}

function getNpbt(row) {
  return coerceNumber(pickFirstDefined(row, [
    "pretax_income",
    "income_before_tax",
    "npbt",
    "is_income_before_tax",
  ]));
}

function getIncomeTaxExpense(row) {
  return coerceNumber(pickFirstDefined(row, [
    "income_tax_expense",
    "tax_expense",
    "is_income_tax",
    "incomeTaxExpense",
  ]));
}

function getNpat(row) {
  return coerceNumber(pickFirstDefined(row, [
    "is_net_income",
    "net_income",
    "npat",
    "netIncome",
  ]));
}

function getCapitalExpenditures(row) {
  return coerceNumber(pickFirstDefined(row, [
    "cf_cap_expenditures",
    "capital_expenditures",
    "capex",
    "ttm_cap_expend",
  ]));
}

// Free cash flow may come directly from the source, or we derive it from
// operating cash flow minus capex when needed.
function getFreeCashFlow(row) {
  const directValue = coerceNumber(pickFirstDefined(row, [
    "free_cash_flow",
    "fcf",
    "ttm_free_cash_flow",
  ]));

  if (directValue !== null) {
    return directValue;
  }

  const operatingCashFlow = coerceNumber(pickFirstDefined(row, [
    "cf_cash_from_operating_activities",
    "cash_from_operating_activities",
    "operating_cash_flow",
    "ttm_cash_from_oper",
  ]));
  const capex = getCapitalExpenditures(row);

  if (operatingCashFlow !== null && capex !== null) {
    return operatingCashFlow - capex;
  }

  return null;
}

function getPeTrailing(row) {
  return coerceNumber(pickFirstDefined(row, [
    "pe_ratio",
    "pe",
    "price_earnings_ratio",
  ]));
}

function getTangibleBookValuePerShare(perShareRow, multiplesRow) {
  return coerceNumber(pickFirstDefined(multiplesRow, [
    "tangible_book_value_per_share",
    "tbv_per_share",
  ])) ?? coerceNumber(pickFirstDefined(perShareRow, [
    "tangible_book_val_per_share",
    "book_val_per_sh",
  ]));
}

function getEpsTrailing(perShareRow, incomeRow) {
  return coerceNumber(pickFirstDefined(perShareRow, [
    "eps",
    "diluted_eps",
  ])) ?? coerceNumber(pickFirstDefined(incomeRow, [
    "eps",
    "diluted_eps",
  ]));
}

function getDpsTrailing(perShareRow) {
  return coerceNumber(pickFirstDefined(perShareRow, [
    "div_per_shr",
    "dps",
    "dividend_per_share",
  ]));
}

// Sorts fiscal years newest to oldest so the most recent history comes first.
function sortYearsDescending(years) {
  return [...years].sort((left, right) => right - left);
}

// Builds a quick lookup table of annual rows by fiscal year.
function buildYearMap(rows) {
  const map = new Map();
  for (const row of extractAnnualRows(rows)) {
    const fiscalYear = getFiscalYear(row);
    if (fiscalYear !== null && !map.has(fiscalYear)) {
      map.set(fiscalYear, row);
    }
  }

  return map;
}

// Writes a metric into the nested stock-document structure while also
// preserving metadata about where the value came from.
function setMetric(target, path, value, sourceOfTruth = "roic") {
  const parts = path.split(".");
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current[parts[index]];
  }

  assignMetricValue(current[parts[parts.length - 1]], value, sourceOfTruth);
}

// Builds one normalized annual record by combining related rows from
// several source datasets into the app's standard schema.
function buildAnnualEntry({
  fiscalYear,
  fiscalYearEndDate,
  normalizedPrices,
  normalizedCalls,
  perShareRow,
  profitabilityRow,
  balanceSheetRow,
  incomeRow,
  cashFlowRow,
  multiplesRow,
}) {
  const annualEntry = createEmptyAnnualEntry(fiscalYear, fiscalYearEndDate);
  const earningsReleaseDate = selectEarningsReleaseDate({
    fiscalYear,
    fiscalYearEndDate,
    normalizedCalls,
  });

  annualEntry.earningsReleaseDate = createMetricField(
    earningsReleaseDate.date,
    earningsReleaseDate.date ? earningsReleaseDate.sourceOfTruth : "system"
  );
  setMetric(
    annualEntry,
    "base.sharePrice",
    earningsReleaseDate.date ? selectPriceAfterAnchorDate(earningsReleaseDate.date, normalizedPrices) : null,
    "roic"
  );
  setMetric(annualEntry, "base.sharesOnIssue", getSharesOnIssue(perShareRow), "roic");
  setMetric(annualEntry, "base.returnOnInvestedCapital", getReturnOnInvestedCapital(profitabilityRow), "roic");

  setMetric(annualEntry, "balanceSheet.cash", getCash(balanceSheetRow), "roic");
  setMetric(annualEntry, "balanceSheet.debt", getDebt(balanceSheetRow), "roic");
  setMetric(annualEntry, "balanceSheet.assets", getAssets(balanceSheetRow), "roic");
  setMetric(annualEntry, "balanceSheet.liabilities", getLiabilities(balanceSheetRow), "roic");
  setMetric(annualEntry, "balanceSheet.equity", getEquity(balanceSheetRow), "roic");

  setMetric(annualEntry, "incomeStatement.revenue", getRevenue(incomeRow), "roic");
  setMetric(annualEntry, "incomeStatement.grossProfit", getGrossProfit(incomeRow), "roic");
  setMetric(annualEntry, "incomeStatement.ebitda", getEbitda(incomeRow), "roic");
  setMetric(annualEntry, "incomeStatement.depreciationAndAmortization", getDepreciationAndAmortization(incomeRow), "roic");
  setMetric(annualEntry, "incomeStatement.ebit", getEbit(incomeRow), "roic");
  setMetric(annualEntry, "incomeStatement.netInterestExpense", getNetInterestExpense(incomeRow), "roic");
  setMetric(annualEntry, "incomeStatement.npbt", getNpbt(incomeRow), "roic");
  setMetric(annualEntry, "incomeStatement.incomeTaxExpense", getIncomeTaxExpense(incomeRow), "roic");
  setMetric(annualEntry, "incomeStatement.npat", getNpat(incomeRow), "roic");
  setMetric(annualEntry, "incomeStatement.capitalExpenditures", getCapitalExpenditures(cashFlowRow), "roic");
  setMetric(annualEntry, "incomeStatement.fcf", getFreeCashFlow(cashFlowRow), "roic");

  setMetric(annualEntry, "valuationMultiples.peTrailing", getPeTrailing(multiplesRow), "roic");
  setMetric(annualEntry, "valuationMultiples.tangibleBookValuePerShare", getTangibleBookValuePerShare(perShareRow, multiplesRow), "roic");
  setMetric(annualEntry, "epsAndDividends.epsTrailing", getEpsTrailing(perShareRow, incomeRow), "roic");
  setMetric(annualEntry, "epsAndDividends.dpsTrailing", getDpsTrailing(perShareRow), "roic");

  return annualEntry;
}

// Main entry point for this file.
// It takes raw source payloads, normalizes them, builds yearly records,
// creates the final stock document, and then recalculates derived values.
function buildStockDocument({
  tickerSymbol,
  profile,
  perShare,
  profitability,
  prices,
  earnings,
  incomeStatement,
  balanceSheet,
  cashFlow,
  creditRatios,
  enterpriseValue,
  multiples,
  years = null,
  importRangeYearsExplicit = false,
  investmentCategory,
}) {
  void creditRatios;
  void enterpriseValue;

  const normalizedTicker = String(tickerSymbol || "").toUpperCase().trim();
  const normalizedYearLimit = Number.isInteger(Number(years)) && Number(years) > 0
    ? Number(years)
    : null;
  const normalizedPrices = normalizePriceHistory(prices);
  const normalizedCalls = normalizeEarningsCalls(earnings);

  const perShareByYear = buildYearMap(perShare);
  const profitabilityByYear = buildYearMap(profitability);
  const incomeByYear = buildYearMap(incomeStatement);
  const balanceSheetByYear = buildYearMap(balanceSheet);
  const cashFlowByYear = buildYearMap(cashFlow);
  const multiplesByYear = buildYearMap(multiples);

  const allFiscalYears = sortYearsDescending([
    ...new Set([
      ...perShareByYear.keys(),
      ...profitabilityByYear.keys(),
      ...incomeByYear.keys(),
      ...balanceSheetByYear.keys(),
      ...cashFlowByYear.keys(),
      ...multiplesByYear.keys(),
    ]),
  ]);
  const fiscalYears = normalizedYearLimit === null
    ? allFiscalYears
    : allFiscalYears.slice(0, normalizedYearLimit);

  const annualData = fiscalYears.map((fiscalYear) => {
    const perShareRow = perShareByYear.get(fiscalYear) || null;
    const profitabilityRow = profitabilityByYear.get(fiscalYear) || null;
    const incomeRow = incomeByYear.get(fiscalYear) || null;
    const balanceSheetRow = balanceSheetByYear.get(fiscalYear) || null;
    const cashFlowRow = cashFlowByYear.get(fiscalYear) || null;
    const multiplesRow = multiplesByYear.get(fiscalYear) || null;

    const fiscalYearEndDate = getFiscalYearEndDate(perShareRow)
      || getFiscalYearEndDate(incomeRow)
      || getFiscalYearEndDate(balanceSheetRow)
      || getFiscalYearEndDate(cashFlowRow)
      || getFiscalYearEndDate(profitabilityRow);

    return buildAnnualEntry({
      fiscalYear,
      fiscalYearEndDate,
      normalizedPrices,
      normalizedCalls,
      perShareRow,
      profitabilityRow,
      balanceSheetRow,
      incomeRow,
      cashFlowRow,
      multiplesRow,
    });
  });

  const stockDocument = {
    tickerSymbol: normalizedTicker,
    companyName: createMetricField(getCompanyName(profile), "roic"),
    investmentCategory,
    priceCurrency: getPriceCurrency(profile) || "USD",
    sourceMeta: {
      lastImportedAt: new Date(),
      importRangeYears: normalizedYearLimit,
      importRangeYearsExplicit: Boolean(importRangeYearsExplicit),
      annualHistoryFetchVersion: ANNUAL_HISTORY_FETCH_VERSION,
      roicEndpointsUsed: ROIC_ENDPOINTS_USED,
    },
    annualData,
    forecastData: {
      fy1: createEmptyForecastBucket(),
      fy2: createEmptyForecastBucket(),
      fy3: createEmptyForecastBucket(),
    },
    growthForecasts: createEmptyGrowthForecasts(),
    analystRevisions: createEmptyAnalystRevisions(),
  };

  recalculateDerived(stockDocument);
  return stockDocument;
}

module.exports = {
  ANNUAL_HISTORY_FETCH_VERSION,
  buildStockDocument,
  normalizeEarningsCalls,
  selectEarningsReleaseDate,
};
