// This catalog is the backend's checked-in copy of the workbook reference.
// It gives the app one place to look for:
// - which metrics exist
// - where they live in the document shape
// - where their defaults come from
// - which investment categories should see them
//
// Keeping this data centralized makes the rest of the code much easier for a
// beginner to follow because controllers, models, lens seeding, and tests can
// all reuse the same source of truth instead of hard-coding scattered lists.

const CATEGORY_NAMES = [
  "Unprofitable Hi Growth",
  "Profitable Hi Growth",
  "Mature Compounder",
  "Defensive Yield",
  "Cyclicals",
  "Lenders",
  "Firm Specific Turnaround",
];

const CATEGORY_SET = {
  all: [...CATEGORY_NAMES],
  allButLenders: CATEGORY_NAMES.filter((name) => name !== "Lenders"),
  allButUnprofitable: CATEGORY_NAMES.filter((name) => name !== "Unprofitable Hi Growth"),
  allButUnprofitableAndLenders: CATEGORY_NAMES.filter(
    (name) => !["Unprofitable Hi Growth", "Lenders"].includes(name)
  ),
  qualityNonLenders: CATEGORY_NAMES.filter(
    (name) => ["Profitable Hi Growth", "Mature Compounder", "Defensive Yield", "Cyclicals", "Firm Specific Turnaround"].includes(name)
  ),
  unprofitableOnly: ["Unprofitable Hi Growth"],
  lendersOnly: ["Lenders"],
  cyclicalsLendersTurnaround: ["Cyclicals", "Lenders", "Firm Specific Turnaround"],
  matureAndLenders: ["Mature Compounder", "Lenders"],
};

const ROIC_ENDPOINTS = {
  COMPANY_PROFILE: "/v2/company/profile/{identifier}",
  EARNINGS_CALLS: "/v2/company/earnings-calls/list/{identifier}",
  STOCK_PRICES: "/v2/stock-prices/{identifier}",
  PER_SHARE: "/v2/fundamental/per-share/{identifier}",
  INCOME_STATEMENT: "/v2/fundamental/income-statement/{identifier}",
  BALANCE_SHEET: "/v2/fundamental/balance-sheet/{identifier}",
  CASH_FLOW: "/v2/fundamental/cash-flow/{identifier}",
  PROFITABILITY: "/v2/fundamental/ratios/profitability/{identifier}",
  CREDIT: "/v2/fundamental/ratios/credit/{identifier}",
  ENTERPRISE_VALUE: "/v2/fundamental/enterprise-value/{identifier}",
  MULTIPLES: "/v2/fundamental/multiples/{identifier}",
};

// Historical annual metrics are stored in grouped buckets so a fiscal year can
// carry many related statements without turning the annual row into one huge
// flat object.
const ANNUAL_GROUP_FIELDS = {
  base: [
    "sharePrice",
    "sharesOnIssue",
    "marketCap",
    "returnOnInvestedCapital",
  ],
  balanceSheet: [
    "cash",
    "nonCashInvestments",
    "debt",
    "netDebtOrCash",
    "netDebtToEbitda",
    "ebitInterestCoverage",
    "assets",
    "liabilities",
    "equity",
    "leverageRatio",
    "enterpriseValueTrailing",
  ],
  incomeStatement: [
    "revenue",
    "grossProfit",
    "codb",
    "ebitda",
    "depreciationAndAmortization",
    "ebit",
    "netInterestExpense",
    "npbt",
    "incomeTaxExpense",
    "npat",
    "capitalExpenditures",
    "fcf",
  ],
  ownerEarningsBridge: [
    "deemedMaintenanceCapex",
    "ownerEarnings",
  ],
  sharesAndMarketCap: [
    "changeInShares",
    "sharesOnIssueDetailed",
    "marketCapDetailed",
  ],
  valuationMultiples: [
    "evSalesTrailing",
    "ebitdaMarginTrailing",
    "ebitMarginTrailing",
    "npatMarginTrailing",
    "evEbitTrailing",
    "peTrailing",
    "tangibleBookValuePerShare",
    "priceToNta",
    "dividendPayout",
  ],
  epsAndDividends: [
    "epsTrailing",
    "dyTrailing",
    "dpsTrailing",
  ],
};

const FORECAST_BUCKET_FIELDS = [
  "sharesOnIssue",
  "marketCap",
  "enterpriseValue",
  "ebit",
  "evSales",
  "ebitdaMargin",
  "ebitMargin",
  "npatMargin",
  "evEbit",
  "pe",
  "eps",
  "dy",
  "dps",
];

const TOP_LEVEL_OVERRIDE_GROUP_FIELDS = {
  growthForecasts: [
    "revenueCagr3y",
    "revenueCagr5y",
    "epsCagr3y",
    "epsCagr5y",
  ],
  analystRevisions: [
    "revenueFy1Last1m",
    "revenueFy1Last3m",
    "revenueFy2Last1m",
    "revenueFy2Last3m",
    "ebitFy1Last1m",
    "ebitFy1Last3m",
    "ebitFy2Last1m",
    "ebitFy2Last3m",
    "ebitFy3Last1m",
    "ebitFy3Last3m",
    "epsFy1Last1m",
    "epsFy1Last3m",
    "epsFy2Last1m",
    "epsFy2Last3m",
    "epsFy3Last1m",
    "epsFy3Last3m",
  ],
};

const ANNUAL_RELATIVE_METRIC_PATHS = [
  "earningsReleaseDate",
  ...Object.entries(ANNUAL_GROUP_FIELDS).flatMap(([groupName, fieldNames]) =>
    fieldNames.map((fieldName) => `${groupName}.${fieldName}`)
  ),
];

const FORECAST_RELATIVE_METRIC_PATHS = [...FORECAST_BUCKET_FIELDS];

const TOP_LEVEL_METRIC_PATHS = Object.entries(TOP_LEVEL_OVERRIDE_GROUP_FIELDS).flatMap(
  ([groupName, fieldNames]) => fieldNames.map((fieldName) => `${groupName}.${fieldName}`)
);

// Each stored metric has a source classification. That tells import and refresh
// code whether the field comes from ROIC, is derived by backend formulas, or
// is a manual/system placeholder waiting for user input.
const ANNUAL_FIELD_SOURCE_META = {
  earningsReleaseDate: { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.EARNINGS_CALLS },
  "base.sharePrice": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.STOCK_PRICES },
  "base.sharesOnIssue": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.PER_SHARE },
  "base.marketCap": { sourceType: "derived", roicEndpoint: null },
  "base.returnOnInvestedCapital": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.PROFITABILITY },
  "balanceSheet.cash": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.BALANCE_SHEET },
  "balanceSheet.nonCashInvestments": { sourceType: "system", roicEndpoint: null },
  "balanceSheet.debt": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.BALANCE_SHEET },
  "balanceSheet.netDebtOrCash": { sourceType: "derived", roicEndpoint: null },
  "balanceSheet.netDebtToEbitda": { sourceType: "derived", roicEndpoint: null },
  "balanceSheet.ebitInterestCoverage": { sourceType: "derived", roicEndpoint: null },
  "balanceSheet.assets": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.BALANCE_SHEET },
  "balanceSheet.liabilities": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.BALANCE_SHEET },
  "balanceSheet.equity": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.BALANCE_SHEET },
  "balanceSheet.leverageRatio": { sourceType: "derived", roicEndpoint: null },
  "balanceSheet.enterpriseValueTrailing": { sourceType: "derived", roicEndpoint: ROIC_ENDPOINTS.ENTERPRISE_VALUE },
  "incomeStatement.revenue": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  "incomeStatement.grossProfit": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  "incomeStatement.codb": { sourceType: "derived", roicEndpoint: null },
  "incomeStatement.ebitda": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  "incomeStatement.depreciationAndAmortization": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  "incomeStatement.ebit": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  "incomeStatement.netInterestExpense": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  "incomeStatement.npbt": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  "incomeStatement.incomeTaxExpense": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  "incomeStatement.npat": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.INCOME_STATEMENT },
  "incomeStatement.capitalExpenditures": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.CASH_FLOW },
  "incomeStatement.fcf": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.CASH_FLOW },
  "ownerEarningsBridge.deemedMaintenanceCapex": { sourceType: "derived", roicEndpoint: null },
  "ownerEarningsBridge.ownerEarnings": { sourceType: "derived", roicEndpoint: null },
  "sharesAndMarketCap.changeInShares": { sourceType: "derived", roicEndpoint: null },
  "sharesAndMarketCap.sharesOnIssueDetailed": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.PER_SHARE },
  "sharesAndMarketCap.marketCapDetailed": { sourceType: "derived", roicEndpoint: null },
  "valuationMultiples.evSalesTrailing": { sourceType: "derived", roicEndpoint: ROIC_ENDPOINTS.ENTERPRISE_VALUE },
  "valuationMultiples.ebitdaMarginTrailing": { sourceType: "derived", roicEndpoint: ROIC_ENDPOINTS.PROFITABILITY },
  "valuationMultiples.ebitMarginTrailing": { sourceType: "derived", roicEndpoint: ROIC_ENDPOINTS.PROFITABILITY },
  "valuationMultiples.npatMarginTrailing": { sourceType: "derived", roicEndpoint: ROIC_ENDPOINTS.PROFITABILITY },
  "valuationMultiples.evEbitTrailing": { sourceType: "derived", roicEndpoint: ROIC_ENDPOINTS.ENTERPRISE_VALUE },
  "valuationMultiples.peTrailing": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.MULTIPLES },
  "valuationMultiples.tangibleBookValuePerShare": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.PER_SHARE },
  "valuationMultiples.priceToNta": { sourceType: "derived", roicEndpoint: null },
  "valuationMultiples.dividendPayout": { sourceType: "derived", roicEndpoint: ROIC_ENDPOINTS.PROFITABILITY },
  "epsAndDividends.epsTrailing": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.PER_SHARE },
  "epsAndDividends.dyTrailing": { sourceType: "derived", roicEndpoint: null },
  "epsAndDividends.dpsTrailing": { sourceType: "roic", roicEndpoint: ROIC_ENDPOINTS.PER_SHARE },
};

const FORECAST_FIELD_SOURCE_META = {
  sharesOnIssue: { sourceType: "manualOnly", roicEndpoint: null },
  marketCap: { sourceType: "derived", roicEndpoint: null },
  enterpriseValue: { sourceType: "derived", roicEndpoint: null },
  ebit: { sourceType: "manualOnly", roicEndpoint: null },
  evSales: { sourceType: "manualOnly", roicEndpoint: null },
  ebitdaMargin: { sourceType: "manualOnly", roicEndpoint: null },
  ebitMargin: { sourceType: "manualOnly", roicEndpoint: null },
  npatMargin: { sourceType: "manualOnly", roicEndpoint: null },
  evEbit: { sourceType: "manualOnly", roicEndpoint: null },
  pe: { sourceType: "manualOnly", roicEndpoint: null },
  eps: { sourceType: "manualOnly", roicEndpoint: null },
  dy: { sourceType: "manualOnly", roicEndpoint: null },
  dps: { sourceType: "manualOnly", roicEndpoint: null },
};

const TOP_LEVEL_FIELD_SOURCE_META = {
  "growthForecasts.revenueCagr3y": { sourceType: "manualOnly", roicEndpoint: null },
  "growthForecasts.revenueCagr5y": { sourceType: "manualOnly", roicEndpoint: null },
  "growthForecasts.epsCagr3y": { sourceType: "manualOnly", roicEndpoint: null },
  "growthForecasts.epsCagr5y": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.revenueFy1Last1m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.revenueFy1Last3m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.revenueFy2Last1m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.revenueFy2Last3m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.ebitFy1Last1m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.ebitFy1Last3m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.ebitFy2Last1m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.ebitFy2Last3m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.ebitFy3Last1m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.ebitFy3Last3m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.epsFy1Last1m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.epsFy1Last3m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.epsFy2Last1m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.epsFy2Last3m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.epsFy3Last1m": { sourceType: "manualOnly", roicEndpoint: null },
  "analystRevisions.epsFy3Last3m": { sourceType: "manualOnly", roicEndpoint: null },
};

function normalizeCategoryName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function annualFieldPath(relativePath) {
  return relativePath === "fiscalYearEndDate"
    ? "annualData[].fiscalYearEndDate"
    : `annualData[].${relativePath}`;
}

function forecastFieldPath(bucket, metric) {
  return `forecastData.${bucket}.${metric}`;
}

function displayField(fieldPath, label, section, surface, categories, order) {
  return { fieldPath, label, section, surface, categories, order };
}

// Display rows mirror the workbook. Duplicates are allowed here because the
// same stored metric may appear in multiple sections for learning purposes.
const DISPLAY_FIELD_DEFINITIONS = [
  displayField("annualData[].fiscalYearEndDate", "FY end date", "BASE", "card", CATEGORY_SET.all, 10),
  displayField("annualData[].earningsReleaseDate", "FY earnings release date", "BASE", "card", CATEGORY_SET.all, 20),
  displayField("annualData[].base.sharePrice", "Share price (at FY release date)", "BASE", "card", CATEGORY_SET.all, 30),
  displayField("annualData[].base.sharesOnIssue", "Shares on issue", "BASE", "card", CATEGORY_SET.all, 40),
  displayField("annualData[].base.marketCap", "Market cap", "BASE", "card", CATEGORY_SET.all, 50),

  displayField("annualData[].balanceSheet.cash", "Cash", "Balance Sheet", "detail", CATEGORY_SET.allButLenders, 110),
  displayField("annualData[].balanceSheet.nonCashInvestments", "Non-cash investments", "Balance Sheet", "detail", CATEGORY_SET.allButLenders, 120),
  displayField("annualData[].balanceSheet.debt", "Debt", "Balance Sheet", "detail", CATEGORY_SET.allButLenders, 130),
  displayField("annualData[].balanceSheet.netDebtOrCash", "Net debt / (cash)", "Balance Sheet", "detail", CATEGORY_SET.allButLenders, 140),
  displayField("annualData[].balanceSheet.netDebtToEbitda", "Net debt to EBITDA", "Balance Sheet", "detail", CATEGORY_SET.qualityNonLenders, 150),
  displayField("annualData[].balanceSheet.ebitInterestCoverage", "EBIT interest coverage", "Balance Sheet", "detail", CATEGORY_SET.qualityNonLenders, 160),
  displayField("annualData[].balanceSheet.assets", "Assets", "Balance Sheet", "detail", CATEGORY_SET.lendersOnly, 170),
  displayField("annualData[].balanceSheet.liabilities", "Liabilities", "Balance Sheet", "detail", CATEGORY_SET.lendersOnly, 180),
  displayField("annualData[].balanceSheet.equity", "Equity", "Balance Sheet", "detail", CATEGORY_SET.lendersOnly, 190),
  displayField("annualData[].balanceSheet.leverageRatio", "Leverage Ratio", "Balance Sheet", "detail", CATEGORY_SET.lendersOnly, 200),
  displayField("annualData[].balanceSheet.enterpriseValueTrailing", "Enterprise value (trailing)", "Balance Sheet", "detail", CATEGORY_SET.allButLenders, 210),
  displayField("forecastData.fy1.enterpriseValue", "Enterprise value FY+1", "Balance Sheet", "detail", CATEGORY_SET.allButLenders, 220),
  displayField("forecastData.fy2.enterpriseValue", "Enterprise value FY+2", "Balance Sheet", "detail", CATEGORY_SET.allButLenders, 230),
  displayField("forecastData.fy3.enterpriseValue", "Enterprise value FY+3", "Balance Sheet", "detail", CATEGORY_SET.allButLenders, 240),

  displayField("annualData[].incomeStatement.revenue", "Revenue", "Income Statement", "detail", CATEGORY_SET.allButLenders, 310),
  displayField("annualData[].incomeStatement.grossProfit", "Gross profit", "Income Statement", "detail", CATEGORY_SET.allButLenders, 320),
  displayField("annualData[].incomeStatement.codb", "CODB", "Income Statement", "detail", CATEGORY_SET.allButLenders, 330),
  displayField("annualData[].incomeStatement.ebitda", "EBITDA", "Income Statement", "detail", CATEGORY_SET.allButLenders, 340),
  displayField("annualData[].incomeStatement.depreciationAndAmortization", "Depreciation & amortization", "Income Statement", "detail", CATEGORY_SET.allButLenders, 350),
  displayField("annualData[].incomeStatement.ebit", "EBIT", "Income Statement", "detail", CATEGORY_SET.allButLenders, 360),
  displayField("annualData[].incomeStatement.netInterestExpense", "Net interest expense", "Income Statement", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 370),
  displayField("annualData[].incomeStatement.npbt", "NPBT", "Income Statement", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 380),
  displayField("annualData[].incomeStatement.incomeTaxExpense", "Income tax expense", "Income Statement", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 390),
  displayField("annualData[].incomeStatement.npat", "NPAT", "Income Statement", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 400),
  displayField("annualData[].incomeStatement.capitalExpenditures", "Capital expenditures", "Income Statement", "detail", CATEGORY_SET.unprofitableOnly, 410),
  displayField("annualData[].incomeStatement.fcf", "FCF", "Income Statement", "detail", CATEGORY_SET.unprofitableOnly, 420),

  displayField("annualData[].incomeStatement.ebitda", "EBITDA (bridge)", "Owner Earnings Bridge", "detail", CATEGORY_SET.allButLenders, 510),
  displayField("annualData[].incomeStatement.netInterestExpense", "Net interest expense (bridge)", "Owner Earnings Bridge", "detail", CATEGORY_SET.allButLenders, 520),
  displayField("annualData[].incomeStatement.incomeTaxExpense", "Income tax expense (bridge)", "Owner Earnings Bridge", "detail", CATEGORY_SET.allButLenders, 530),
  displayField("annualData[].ownerEarningsBridge.deemedMaintenanceCapex", "Deemed Maintenance Capex", "Owner Earnings Bridge", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 540),
  displayField("annualData[].ownerEarningsBridge.ownerEarnings", "Owner earnings", "Owner Earnings Bridge", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 550),

  displayField("annualData[].sharesAndMarketCap.changeInShares", "Change in shares", "Shares & Market Cap", "detail", CATEGORY_SET.unprofitableOnly, 610),
  displayField("annualData[].sharesAndMarketCap.sharesOnIssueDetailed", "Shares on issue (detailed)", "Shares & Market Cap", "detail", CATEGORY_SET.all, 620),
  displayField("forecastData.fy1.sharesOnIssue", "Shares on issue forecast FY+1", "Shares & Market Cap", "detail", CATEGORY_SET.all, 630),
  displayField("forecastData.fy2.sharesOnIssue", "Shares on issue forecast FY+2", "Shares & Market Cap", "detail", CATEGORY_SET.all, 640),
  displayField("forecastData.fy3.sharesOnIssue", "Shares on issue forecast FY+3", "Shares & Market Cap", "detail", CATEGORY_SET.all, 650),
  displayField("annualData[].sharesAndMarketCap.marketCapDetailed", "Market cap (detailed)", "Shares & Market Cap", "detail", CATEGORY_SET.all, 660),
  displayField("forecastData.fy1.marketCap", "Market cap FY+1", "Shares & Market Cap", "detail", CATEGORY_SET.all, 670),
  displayField("forecastData.fy2.marketCap", "Market cap FY+2", "Shares & Market Cap", "detail", CATEGORY_SET.all, 680),
  displayField("forecastData.fy3.marketCap", "Market cap FY+3", "Shares & Market Cap", "detail", CATEGORY_SET.all, 690),

  displayField("forecastData.fy1.ebit", "EBIT FY+1", "EBIT Forecast", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 710),
  displayField("forecastData.fy2.ebit", "EBIT FY+2", "EBIT Forecast", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 720),
  displayField("forecastData.fy3.ebit", "EBIT FY+3", "EBIT Forecast", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 730),

  displayField("annualData[].valuationMultiples.evSalesTrailing", "EV/Sales trailing", "Valuation Multiples", "detail", CATEGORY_SET.unprofitableOnly, 810),
  displayField("forecastData.fy1.evSales", "EV/Sales FY+1", "Valuation Multiples", "detail", CATEGORY_SET.unprofitableOnly, 820),
  displayField("forecastData.fy2.evSales", "EV/Sales FY+2", "Valuation Multiples", "detail", CATEGORY_SET.unprofitableOnly, 830),
  displayField("annualData[].valuationMultiples.ebitdaMarginTrailing", "EBITDA margin (trailing)", "Valuation Multiples", "detail", CATEGORY_SET.unprofitableOnly, 840),
  displayField("forecastData.fy1.ebitdaMargin", "EBITDA margin FY+1", "Valuation Multiples", "detail", CATEGORY_SET.unprofitableOnly, 850),
  displayField("forecastData.fy2.ebitdaMargin", "EBITDA margin FY+2", "Valuation Multiples", "detail", CATEGORY_SET.unprofitableOnly, 860),
  displayField("annualData[].valuationMultiples.ebitMarginTrailing", "EBIT margin (trailing)", "Valuation Multiples", "detail", CATEGORY_SET.allButLenders.filter((name) => name !== "Defensive Yield"), 870),
  displayField("forecastData.fy1.ebitMargin", "EBIT margin FY+1", "Valuation Multiples", "detail", CATEGORY_SET.allButLenders.filter((name) => name !== "Defensive Yield"), 880),
  displayField("forecastData.fy2.ebitMargin", "EBIT margin FY+2", "Valuation Multiples", "detail", CATEGORY_SET.allButLenders.filter((name) => name !== "Defensive Yield"), 890),
  displayField("annualData[].valuationMultiples.npatMarginTrailing", "NPAT margin (trailing)", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 900),
  displayField("forecastData.fy1.npatMargin", "NPAT margin FY+1", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 910),
  displayField("forecastData.fy2.npatMargin", "NPAT margin FY+2", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 920),
  displayField("forecastData.fy3.npatMargin", "NPAT margin FY+3", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 930),
  displayField("annualData[].valuationMultiples.evEbitTrailing", "EV/EBIT trailing", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 940),
  displayField("forecastData.fy1.evEbit", "EV/EBIT FY+1", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 950),
  displayField("forecastData.fy2.evEbit", "EV/EBIT FY+2", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 960),
  displayField("forecastData.fy3.evEbit", "EV/EBIT FY+3", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitableAndLenders, 970),
  displayField("annualData[].valuationMultiples.peTrailing", "PE trailing", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitable, 980),
  displayField("forecastData.fy1.pe", "PE FY+1", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitable, 990),
  displayField("forecastData.fy2.pe", "PE FY+2", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitable, 1000),
  displayField("forecastData.fy3.pe", "PE FY+3", "Valuation Multiples", "detail", CATEGORY_SET.allButUnprofitable, 1010),
  displayField("annualData[].valuationMultiples.tangibleBookValuePerShare", "Tangible Book Value per share", "Valuation Multiples", "detail", CATEGORY_SET.cyclicalsLendersTurnaround, 1020),
  displayField("annualData[].valuationMultiples.priceToNta", "Price to NTA", "Valuation Multiples", "detail", CATEGORY_SET.cyclicalsLendersTurnaround, 1030),
  displayField("annualData[].valuationMultiples.dividendPayout", "Dividend payout", "Valuation Multiples", "detail", CATEGORY_SET.matureAndLenders, 1040),

  displayField("growthForecasts.revenueCagr3y", "Revenue forecast CAGR 3Y", "Growth & Forecasts", "detail", CATEGORY_SET.all, 1110),
  displayField("growthForecasts.revenueCagr5y", "Revenue forecast CAGR 5Y", "Growth & Forecasts", "detail", CATEGORY_SET.all, 1120),
  displayField("growthForecasts.epsCagr3y", "EPS forecast CAGR 3Y", "Growth & Forecasts", "detail", CATEGORY_SET.allButUnprofitable, 1130),
  displayField("growthForecasts.epsCagr5y", "EPS forecast CAGR 5Y", "Growth & Forecasts", "detail", CATEGORY_SET.allButUnprofitable, 1140),

  displayField("analystRevisions.revenueFy1Last1m", "Revenue FY+1 revisions last 1M", "Analyst Revisions", "detail", CATEGORY_SET.all, 1210),
  displayField("analystRevisions.revenueFy1Last3m", "Revenue FY+1 revisions last 3M", "Analyst Revisions", "detail", CATEGORY_SET.all, 1220),
  displayField("analystRevisions.revenueFy2Last1m", "Revenue FY+2 revisions last 1M", "Analyst Revisions", "detail", CATEGORY_SET.all, 1230),
  displayField("analystRevisions.revenueFy2Last3m", "Revenue FY+2 revisions last 3M", "Analyst Revisions", "detail", CATEGORY_SET.all, 1240),
  displayField("analystRevisions.ebitFy1Last1m", "EBIT FY+1 revisions last 1M", "Analyst Revisions", "detail", CATEGORY_SET.all, 1250),
  displayField("analystRevisions.ebitFy1Last3m", "EBIT FY+1 revisions last 3M", "Analyst Revisions", "detail", CATEGORY_SET.all, 1260),
  displayField("analystRevisions.ebitFy2Last1m", "EBIT FY+2 revisions last 1M", "Analyst Revisions", "detail", CATEGORY_SET.all, 1270),
  displayField("analystRevisions.ebitFy2Last3m", "EBIT FY+2 revisions last 3M", "Analyst Revisions", "detail", CATEGORY_SET.all, 1280),
  displayField("analystRevisions.ebitFy3Last1m", "EBIT FY+3 revisions last 1M", "Analyst Revisions", "detail", CATEGORY_SET.all, 1290),
  displayField("analystRevisions.ebitFy3Last3m", "EBIT FY+3 revisions last 3M", "Analyst Revisions", "detail", CATEGORY_SET.all, 1300),
  displayField("analystRevisions.epsFy1Last1m", "EPS FY+1 revisions last 1M", "Analyst Revisions", "detail", CATEGORY_SET.allButUnprofitable, 1310),
  displayField("analystRevisions.epsFy1Last3m", "EPS FY+1 revisions last 3M", "Analyst Revisions", "detail", CATEGORY_SET.allButUnprofitable, 1320),
  displayField("analystRevisions.epsFy2Last1m", "EPS FY+2 revisions last 1M", "Analyst Revisions", "detail", CATEGORY_SET.allButUnprofitable, 1330),
  displayField("analystRevisions.epsFy2Last3m", "EPS FY+2 revisions last 3M", "Analyst Revisions", "detail", CATEGORY_SET.allButUnprofitable, 1340),
  displayField("analystRevisions.epsFy3Last1m", "EPS FY+3 revisions last 1M", "Analyst Revisions", "detail", CATEGORY_SET.allButUnprofitable, 1350),
  displayField("analystRevisions.epsFy3Last3m", "EPS FY+3 revisions last 3M", "Analyst Revisions", "detail", CATEGORY_SET.allButUnprofitable, 1360),

  displayField("annualData[].epsAndDividends.epsTrailing", "EPS (trailing)", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1410),
  displayField("forecastData.fy1.eps", "EPS FY+1", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1420),
  displayField("forecastData.fy2.eps", "EPS FY+2", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1430),
  displayField("forecastData.fy3.eps", "EPS FY+3", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1440),
  displayField("annualData[].epsAndDividends.dyTrailing", "DY trailing", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1450),
  displayField("forecastData.fy1.dy", "DY FY+1", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1460),
  displayField("forecastData.fy2.dy", "DY FY+2", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1470),
  displayField("forecastData.fy3.dy", "DY FY+3", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1480),
  displayField("annualData[].epsAndDividends.dpsTrailing", "DPS (trailing)", "EPS & Dividends", "detail", ["Profitable Hi Growth", "Lenders"], 1490),
  displayField("forecastData.fy1.dps", "DPS FY+1", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1500),
  displayField("forecastData.fy2.dps", "DPS FY+2", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1510),
  displayField("forecastData.fy3.dps", "DPS FY+3", "EPS & Dividends", "detail", CATEGORY_SET.allButUnprofitable, 1520),
];

// Lens docs are created by filtering the display rows above for a category.
const DEFAULT_LENSES = CATEGORY_NAMES.map((name) => {
  const normalizedName = normalizeCategoryName(name);
  const key = normalizedName;
  const fieldConfigs = DISPLAY_FIELD_DEFINITIONS
    .filter((field) => field.categories.includes(name))
    .sort((left, right) => left.order - right.order)
    .map(({ categories, ...field }) => field);

  return {
    key,
    name,
    normalizedName,
    isActive: true,
    fieldConfigs,
  };
});

const ALLOWED_TOP_LEVEL_PATCH_FIELDS = [
  "investmentCategory",
  "companyName",
];

const ROIC_ENDPOINTS_USED = [
  ROIC_ENDPOINTS.COMPANY_PROFILE,
  ROIC_ENDPOINTS.PER_SHARE,
  ROIC_ENDPOINTS.EARNINGS_CALLS,
  ROIC_ENDPOINTS.STOCK_PRICES,
  ROIC_ENDPOINTS.INCOME_STATEMENT,
  ROIC_ENDPOINTS.BALANCE_SHEET,
  ROIC_ENDPOINTS.CASH_FLOW,
  ROIC_ENDPOINTS.PROFITABILITY,
  ROIC_ENDPOINTS.CREDIT,
  ROIC_ENDPOINTS.ENTERPRISE_VALUE,
  ROIC_ENDPOINTS.MULTIPLES,
];

module.exports = {
  ALLOWED_TOP_LEVEL_PATCH_FIELDS,
  ANALYST_REVISION_FIELDS: TOP_LEVEL_OVERRIDE_GROUP_FIELDS.analystRevisions,
  ANNUAL_FIELD_SOURCE_META,
  ANNUAL_GROUP_FIELDS,
  ANNUAL_RELATIVE_METRIC_PATHS,
  CATEGORY_NAMES,
  DEFAULT_LENSES,
  DISPLAY_FIELD_DEFINITIONS,
  FORECAST_BUCKET_FIELDS,
  FORECAST_FIELD_SOURCE_META,
  FORECAST_RELATIVE_METRIC_PATHS,
  GROWTH_FORECAST_FIELDS: TOP_LEVEL_OVERRIDE_GROUP_FIELDS.growthForecasts,
  ROIC_ENDPOINTS,
  ROIC_ENDPOINTS_USED,
  TOP_LEVEL_FIELD_SOURCE_META,
  TOP_LEVEL_METRIC_PATHS,
  TOP_LEVEL_OVERRIDE_GROUP_FIELDS,
  normalizeCategoryName,
};
