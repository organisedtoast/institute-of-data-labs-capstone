# Schema Reference

> Generated from [`catalog/fieldCatalog.js`](../catalog/fieldCatalog.js). Edit the catalog, not this markdown. Regenerate with `npm run docs:schema`.

## How To Read This Model

- Most numeric and text metrics use the same override object shape: `roicValue`, `userValue`, `effectiveValue`, `sourceOfTruth`, and `lastOverriddenAt`.
- `roic` means the default value comes directly from a mapped ROIC endpoint.
- `derived` means the backend calculates the value from other effective inputs.
- `system` means the field is structural or a backend-managed default rather than a metric imported from ROIC.
- `manualOnly` means the schema reserves the field now, but users supply the value rather than ROIC.
- Lens display rows can intentionally reuse the same stored field path with different labels or sections, so this document shows canonical storage paths instead of every UI variation.

## Top-level stock fields

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| tickerSymbol | Ticker symbol | system | N/A | All (7) |
| companyName | Company name override object | roic | /v2/company/profile/{identifier} | All (7) |
| investmentCategory | User-facing investment category | system | N/A | All (7) |
| priceCurrency | Price currency | roic | /v2/company/profile/{identifier} | All (7) |
| reportingCurrency | Reporting currency | roic | /v2/fundamental/income-statement/{identifier} | All (7) |
| sourceMeta.lastImportedAt | Last import timestamp | system | N/A | All (7) |
| sourceMeta.lastRefreshAt | Last refresh timestamp | system | N/A | All (7) |
| sourceMeta.importRangeYears | Requested yearly import range | system | N/A | All (7) |
| sourceMeta.roicEndpointsUsed | ROIC endpoints used by import | system | Multiple endpoints | All (7) |
| annualData[] | Historical annual rows | system | Multiple endpoints | All (7) |
| forecastData | Forecast buckets container | system | N/A | All (7) |
| growthForecasts | Manual growth forecast metrics | system | N/A | All (7) |
| analystRevisions | Manual analyst revision metrics | system | N/A | All (7) |

## annualData[] core row fields

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| annualData[].fiscalYear | Fiscal year | roic | Multiple annual endpoints | All (7) |
| annualData[].fiscalYearEndDate | FY end date | roic | /v2/fundamental/per-share/{identifier} | All (7) |
| annualData[].reportingCurrency | Annual reporting currency | roic | /v2/fundamental/income-statement/{identifier} | All (7) |
| annualData[].earningsReleaseDate | FY release date | roic | /v2/company/earnings-calls/list/{identifier} | All (7) |

## annualData[].base

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| annualData[].base.sharePrice | Share price | roic | /v2/stock-prices/{identifier} | All (7) |
| annualData[].base.sharesOnIssue | Shares on issue | roic | /v2/fundamental/per-share/{identifier} | All (7) |
| annualData[].base.marketCap | Market cap | derived | N/A | All (7) |
| annualData[].base.returnOnInvestedCapital | Return On Invested Capital | roic | /v2/fundamental/ratios/profitability/{identifier} | All (7) |

## annualData[].balanceSheet

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| annualData[].balanceSheet.cash | Cash | roic | /v2/fundamental/balance-sheet/{identifier} | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |
| annualData[].balanceSheet.nonCashInvestments | Non-cash investments | system | N/A | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |
| annualData[].balanceSheet.debt | Debt | roic | /v2/fundamental/balance-sheet/{identifier} | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |
| annualData[].balanceSheet.netDebtOrCash | Net debt / (cash) | derived | N/A | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |
| annualData[].balanceSheet.netDebtToEbitda | Net debt to EBITDA | derived | N/A | Profitable Hi Growth, Mature Compounder, Defensive Yield +2 more |
| annualData[].balanceSheet.ebitInterestCoverage | EBIT interest coverage | derived | N/A | Profitable Hi Growth, Mature Compounder, Defensive Yield +2 more |
| annualData[].balanceSheet.assets | Assets | roic | /v2/fundamental/balance-sheet/{identifier} | Lender (1) |
| annualData[].balanceSheet.liabilities | Liabilities | roic | /v2/fundamental/balance-sheet/{identifier} | Lender (1) |
| annualData[].balanceSheet.equity | Equity | roic | /v2/fundamental/balance-sheet/{identifier} | Lender (1) |
| annualData[].balanceSheet.leverageRatio | Leverage Ratio | derived | N/A | Lender (1) |
| annualData[].balanceSheet.enterpriseValueTrailing | Enterprise value (trailing) | derived | /v2/fundamental/enterprise-value/{identifier} | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |

## annualData[].incomeStatement

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| annualData[].incomeStatement.revenue | Revenue | roic | /v2/fundamental/income-statement/{identifier} | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |
| annualData[].incomeStatement.grossProfit | Gross profit | roic | /v2/fundamental/income-statement/{identifier} | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |
| annualData[].incomeStatement.codb | CODB | derived | N/A | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |
| annualData[].incomeStatement.ebitda | EBITDA | roic | /v2/fundamental/income-statement/{identifier} | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |
| annualData[].incomeStatement.depreciationAndAmortization | Depreciation & amortization | roic | /v2/fundamental/income-statement/{identifier} | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |
| annualData[].incomeStatement.ebit | EBIT | roic | /v2/fundamental/income-statement/{identifier} | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +3 more |
| annualData[].incomeStatement.netInterestExpense | Net interest expense | roic | /v2/fundamental/income-statement/{identifier} | Profitable Hi Growth, Mature Compounder, Defensive Yield +2 more |
| annualData[].incomeStatement.npbt | NPBT | roic | /v2/fundamental/income-statement/{identifier} | Profitable Hi Growth, Mature Compounder, Defensive Yield +2 more |
| annualData[].incomeStatement.incomeTaxExpense | Income tax expense | roic | /v2/fundamental/income-statement/{identifier} | Profitable Hi Growth, Mature Compounder, Defensive Yield +2 more |
| annualData[].incomeStatement.npat | NPAT | roic | /v2/fundamental/income-statement/{identifier} | Profitable Hi Growth, Mature Compounder, Defensive Yield +2 more |
| annualData[].incomeStatement.capitalExpenditures | Capital expenditures | roic | /v2/fundamental/cash-flow/{identifier} | Unprofitable Hi Growth (1) |
| annualData[].incomeStatement.fcf | FCF | roic | /v2/fundamental/cash-flow/{identifier} | Unprofitable Hi Growth (1) |

## annualData[].ownerEarningsBridge

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| annualData[].ownerEarningsBridge.deemedMaintenanceCapex | Deemed Maintenance Capex | derived | N/A | Profitable Hi Growth, Mature Compounder, Defensive Yield +2 more |
| annualData[].ownerEarningsBridge.ownerEarnings | Owner earnings | derived | N/A | Profitable Hi Growth, Mature Compounder, Defensive Yield +2 more |

## annualData[].sharesAndMarketCap

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| annualData[].sharesAndMarketCap.changeInShares | Change in shares | derived | N/A | Unprofitable Hi Growth (1) |

## annualData[].valuationMultiples

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| annualData[].valuationMultiples.evSalesTrailing | EV/Sales trailing | derived | /v2/fundamental/enterprise-value/{identifier} | Unprofitable Hi Growth (1) |
| annualData[].valuationMultiples.ebitdaMarginTrailing | EBITDA margin (trailing) | derived | /v2/fundamental/ratios/profitability/{identifier} | Unprofitable Hi Growth (1) |
| annualData[].valuationMultiples.ebitMarginTrailing | EBIT margin (trailing) | derived | /v2/fundamental/ratios/profitability/{identifier} | Unprofitable Hi Growth, Profitable Hi Growth, Mature Compounder +2 more |
| annualData[].valuationMultiples.npatMarginTrailing | NPAT margin (trailing) | derived | /v2/fundamental/ratios/profitability/{identifier} | Profitable Hi Growth, Mature Compounder, Defensive Yield +2 more |
| annualData[].valuationMultiples.evEbitTrailing | EV/EBIT trailing | derived | /v2/fundamental/enterprise-value/{identifier} | Profitable Hi Growth, Mature Compounder, Defensive Yield +2 more |
| annualData[].valuationMultiples.peTrailing | PE trailing | roic | /v2/fundamental/multiples/{identifier} | Profitable Hi Growth, Mature Compounder, Defensive Yield +3 more |
| annualData[].valuationMultiples.tangibleBookValuePerShare | Tangible Book Value per share | roic | /v2/fundamental/per-share/{identifier} | Cyclical, Lender, Firm Specific Turnaround (3) |
| annualData[].valuationMultiples.priceToNta | Price to NTA | derived | N/A | Cyclical, Lender, Firm Specific Turnaround (3) |
| annualData[].valuationMultiples.dividendPayout | Dividend payout | derived | /v2/fundamental/ratios/profitability/{identifier} | Mature Compounder, Lender (2) |

## annualData[].epsAndDividends

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| annualData[].epsAndDividends.epsTrailing | EPS (trailing) | roic | /v2/fundamental/per-share/{identifier} | Profitable Hi Growth, Mature Compounder, Defensive Yield +3 more |
| annualData[].epsAndDividends.dyTrailing | DY trailing | derived | N/A | Profitable Hi Growth, Mature Compounder, Defensive Yield +3 more |
| annualData[].epsAndDividends.dpsTrailing | DPS (trailing) | roic | /v2/fundamental/per-share/{identifier} | Profitable Hi Growth, Lender (2) |

## forecastData.fy1|fy2|fy3

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| forecastData.fy1.sharesOnIssue | Shares On Issue FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy1.marketCap | Market Cap FY+1 | derived | N/A | All (7) |
| forecastData.fy1.enterpriseValue | Enterprise Value FY+1 | derived | N/A | All (7) |
| forecastData.fy1.ebit | Ebit FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy1.evSales | Ev Sales FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy1.ebitdaMargin | Ebitda Margin FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy1.ebitMargin | Ebit Margin FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy1.npatMargin | Npat Margin FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy1.evEbit | Ev Ebit FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy1.pe | Pe FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy1.eps | Eps FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy1.dy | Dy FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy1.dps | Dps FY+1 | manualOnly | N/A | All (7) |
| forecastData.fy2.sharesOnIssue | Shares On Issue FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy2.marketCap | Market Cap FY+2 | derived | N/A | All (7) |
| forecastData.fy2.enterpriseValue | Enterprise Value FY+2 | derived | N/A | All (7) |
| forecastData.fy2.ebit | Ebit FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy2.evSales | Ev Sales FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy2.ebitdaMargin | Ebitda Margin FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy2.ebitMargin | Ebit Margin FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy2.npatMargin | Npat Margin FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy2.evEbit | Ev Ebit FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy2.pe | Pe FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy2.eps | Eps FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy2.dy | Dy FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy2.dps | Dps FY+2 | manualOnly | N/A | All (7) |
| forecastData.fy3.sharesOnIssue | Shares On Issue FY+3 | manualOnly | N/A | All (7) |
| forecastData.fy3.marketCap | Market Cap FY+3 | derived | N/A | All (7) |
| forecastData.fy3.enterpriseValue | Enterprise Value FY+3 | derived | N/A | All (7) |
| forecastData.fy3.ebit | Ebit FY+3 | manualOnly | N/A | All (7) |
| forecastData.fy3.evSales | Ev Sales FY+3 | manualOnly | N/A | All (7) |
| forecastData.fy3.ebitdaMargin | Ebitda Margin FY+3 | manualOnly | N/A | All (7) |
| forecastData.fy3.ebitMargin | Ebit Margin FY+3 | manualOnly | N/A | All (7) |
| forecastData.fy3.npatMargin | Npat Margin FY+3 | manualOnly | N/A | All (7) |
| forecastData.fy3.evEbit | Ev Ebit FY+3 | manualOnly | N/A | All (7) |
| forecastData.fy3.pe | Pe FY+3 | manualOnly | N/A | All (7) |
| forecastData.fy3.eps | Eps FY+3 | manualOnly | N/A | All (7) |
| forecastData.fy3.dy | Dy FY+3 | manualOnly | N/A | All (7) |
| forecastData.fy3.dps | Dps FY+3 | manualOnly | N/A | All (7) |

## growthForecasts

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| growthForecasts.revenueCagr3y | Revenue Cagr3y | manualOnly | N/A | All (7) |
| growthForecasts.revenueCagr5y | Revenue Cagr5y | manualOnly | N/A | All (7) |
| growthForecasts.epsCagr3y | Eps Cagr3y | manualOnly | N/A | All (7) |
| growthForecasts.epsCagr5y | Eps Cagr5y | manualOnly | N/A | All (7) |

## analystRevisions

| Field path | Label | Source type | ROIC endpoint | Visible in categories |
| --- | --- | --- | --- | --- |
| analystRevisions.revenueFy1Last1m | Revenue FY+1 Last1m | manualOnly | N/A | All (7) |
| analystRevisions.revenueFy1Last3m | Revenue FY+1 Last3m | manualOnly | N/A | All (7) |
| analystRevisions.revenueFy2Last1m | Revenue FY+2 Last1m | manualOnly | N/A | All (7) |
| analystRevisions.revenueFy2Last3m | Revenue FY+2 Last3m | manualOnly | N/A | All (7) |
| analystRevisions.ebitFy1Last1m | Ebit FY+1 Last1m | manualOnly | N/A | All (7) |
| analystRevisions.ebitFy1Last3m | Ebit FY+1 Last3m | manualOnly | N/A | All (7) |
| analystRevisions.ebitFy2Last1m | Ebit FY+2 Last1m | manualOnly | N/A | All (7) |
| analystRevisions.ebitFy2Last3m | Ebit FY+2 Last3m | manualOnly | N/A | All (7) |
| analystRevisions.ebitFy3Last1m | Ebit FY+3 Last1m | manualOnly | N/A | All (7) |
| analystRevisions.ebitFy3Last3m | Ebit FY+3 Last3m | manualOnly | N/A | All (7) |
| analystRevisions.epsFy1Last1m | Eps FY+1 Last1m | manualOnly | N/A | All (7) |
| analystRevisions.epsFy1Last3m | Eps FY+1 Last3m | manualOnly | N/A | All (7) |
| analystRevisions.epsFy2Last1m | Eps FY+2 Last1m | manualOnly | N/A | All (7) |
| analystRevisions.epsFy2Last3m | Eps FY+2 Last3m | manualOnly | N/A | All (7) |
| analystRevisions.epsFy3Last1m | Eps FY+3 Last1m | manualOnly | N/A | All (7) |
| analystRevisions.epsFy3Last3m | Eps FY+3 Last3m | manualOnly | N/A | All (7) |

## Lens Summary

This appendix stays compact on purpose. It tells a developer how broad each category is without dumping the full lens payload that already exists in the catalog and seed logic.

| Investment category | Card fields | Detail fields | Sample field paths |
| --- | --- | --- | --- |
| Unprofitable Hi Growth | 6 | 45 | annualData[].fiscalYearEndDate, annualData[].earningsReleaseDate, annualData[].base.sharePrice |
| Profitable Hi Growth | 6 | 79 | annualData[].fiscalYearEndDate, annualData[].earningsReleaseDate, annualData[].base.sharePrice |
| Mature Compounder | 6 | 79 | annualData[].fiscalYearEndDate, annualData[].earningsReleaseDate, annualData[].base.sharePrice |
| Defensive Yield | 6 | 75 | annualData[].fiscalYearEndDate, annualData[].earningsReleaseDate, annualData[].base.sharePrice |
| Cyclical | 6 | 80 | annualData[].fiscalYearEndDate, annualData[].earningsReleaseDate, annualData[].base.sharePrice |
| Lender | 6 | 50 | annualData[].fiscalYearEndDate, annualData[].earningsReleaseDate, annualData[].base.sharePrice |
| Firm Specific Turnaround | 6 | 80 | annualData[].fiscalYearEndDate, annualData[].earningsReleaseDate, annualData[].base.sharePrice |
