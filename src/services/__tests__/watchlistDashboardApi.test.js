import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDashboardPayload,
  fetchDashboardMetricsView,
  fetchWatchlistDashboardBootstraps,
  fetchDashboardData,
  refreshWatchlistDashboardBootstrap,
  updateDashboardInvestmentCategory,
} from '../watchlistDashboardApi';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

function buildWatchlistStock(overrides = {}) {
  return {
    tickerSymbol: 'AAPL',
    investmentCategory: 'Profitable Hi Growth',
    companyName: {
      effectiveValue: 'Apple Inc.',
    },
    priceCurrency: 'USD',
    sourceMeta: {
      importRangeYears: null,
      importRangeYearsExplicit: false,
      annualHistoryFetchVersion: 3,
    },
    annualData: [
      {
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
        base: {
          sharePrice: { effectiveValue: 210.4, sourceOfTruth: 'roic' },
          sharesOnIssue: { effectiveValue: 15500000000, sourceOfTruth: 'roic' },
          marketCap: { effectiveValue: 3200000000000, sourceOfTruth: 'derived' },
        },
      },
      {
        fiscalYear: 2023,
        fiscalYearEndDate: '2023-12-31',
        base: {
          sharePrice: { effectiveValue: 189.6, sourceOfTruth: 'user' },
          sharesOnIssue: { effectiveValue: 15700000000, sourceOfTruth: 'roic' },
          marketCap: { effectiveValue: 2980000000000, sourceOfTruth: 'derived' },
        },
      },
    ],
    ...overrides,
  };
}

function buildMetricsViewPayload() {
  return {
    columns: [
      {
        key: 'annual-2023',
        kind: 'annual',
        label: 'FY 2023',
        shortLabel: '2023',
        fiscalYear: 2023,
        fiscalYearEndDate: '2023-12-31',
      },
      {
        key: 'annual-2024',
        kind: 'annual',
        label: 'FY 2024',
        shortLabel: '2024',
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
      },
    ],
    rows: [
      {
        rowKey: '710::annualData[].forecastData.fy1.ebit',
        fieldPath: 'annualData[].forecastData.fy1.ebit',
        label: 'EBIT FY+1',
        shortLabel: 'EBIT FY+1',
        section: 'EBIT Forecast',
        shortSection: 'EBIT Forecast',
        order: 710,
        surface: 'detail',
        isEnabled: true,
        cells: [
          {
            columnKey: 'annual-2023',
            value: null,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: {
              kind: 'annual',
              fiscalYear: 2023,
              payloadPath: 'forecastData.fy1.ebit',
            },
          },
          {
            columnKey: 'annual-2024',
            value: 42,
            sourceOfTruth: 'user',
            isOverridden: true,
            isOverrideable: true,
            overrideTarget: {
              kind: 'annual',
              fiscalYear: 2024,
              payloadPath: 'forecastData.fy1.ebit',
            },
          },
        ],
      },
    ],
  };
}

describe('watchlistDashboardApi', () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.patch.mockReset();
    axios.post.mockReset();
    // The dashboard can perform one extra read for the richer metrics payload.
    // Most tests here only care about the summary/bootstrap reads, so the third
    // GET gets a safe default unless a test needs to inspect it directly.
    axios.get.mockResolvedValue({ data: { columns: [], rows: [] } });
  });

  it('builds the dashboard payload from watchlist metrics and price rows', () => {
    const payload = buildDashboardPayload(
      buildWatchlistStock(),
      {
        prices: [
          { date: '2024-01-02', close: '185.64' },
          { date: '2024-01-03', close: 184.25 },
        ],
      },
      'aapl',
    );

    expect(payload.identifier).toBe('AAPL');
    expect(payload.companyName).toBe('Apple Inc.');
    expect(payload.investmentCategory).toBe('Profitable Hi Growth');
    expect(payload.priceCurrency).toBe('USD');
    expect(payload.prices).toEqual([
      { date: '2024-01-02', close: 185.64 },
      { date: '2024-01-03', close: 184.25 },
    ]);
    expect(payload.annualMetrics).toEqual([
      {
        fiscalYear: 2023,
        fiscalYearEndDate: '2023-12-31',
        earningsReleaseDate: null,
        sharePrice: 189.6,
        sharesOnIssue: 15700000000,
        marketCap: 2980000000000,
      },
      {
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
        earningsReleaseDate: null,
        sharePrice: 210.4,
        sharesOnIssue: 15500000000,
        marketCap: 3200000000000,
      },
    ]);
    expect(payload.annualMainTableRows[0].cells.sharePrice).toEqual({
      columnKey: 'annual-2023',
      value: 189.6,
      sourceOfTruth: 'user',
      isOverridden: true,
      isOverrideable: true,
      overrideTarget: {
        kind: 'annual',
        fiscalYear: 2023,
        payloadPath: 'base.sharePrice',
      },
      fieldKey: 'sharePrice',
    });
    expect(payload.annualMainTableRows[1].cells.sharesOnIssue).toEqual({
      columnKey: 'annual-2024',
      value: 15500000000,
      sourceOfTruth: 'roic',
      isOverridden: false,
      isOverrideable: true,
      overrideTarget: {
        kind: 'annual',
        fiscalYear: 2024,
        payloadPath: 'base.sharesOnIssue',
      },
      fieldKey: 'sharesOnIssue',
    });
    expect(payload.metricsColumns).toEqual([]);
    expect(payload.metricsRows).toEqual([]);
  });

  it('normalizes annual metrics-mode rows from the backend metrics-view payload', () => {
    const payload = buildDashboardPayload(
      buildWatchlistStock(),
      { prices: [] },
      'aapl',
      buildMetricsViewPayload(),
    );

    expect(payload.metricsColumns).toEqual([
      {
        key: 'annual-2023',
        kind: 'annual',
        label: 'FY 2023',
        shortLabel: '2023',
        fiscalYear: 2023,
        fiscalYearEndDate: '2023-12-31',
        earningsReleaseDate: null,
        bucket: null,
      },
      {
        key: 'annual-2024',
        kind: 'annual',
        label: 'FY 2024',
        shortLabel: '2024',
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
        earningsReleaseDate: null,
        bucket: null,
      },
    ]);
    expect(payload.metricsRows[0].fieldPath).toBe('annualData[].forecastData.fy1.ebit');
    expect(payload.metricsRows[0].cells[1]).toEqual({
      columnKey: 'annual-2024',
      value: 42,
      sourceOfTruth: 'user',
      isOverridden: true,
      isOverrideable: true,
      overrideTarget: {
        kind: 'annual',
        fiscalYear: 2024,
        payloadPath: 'forecastData.fy1.ebit',
      },
    });
  });

  it('preserves the Mongo-backed fiscal year on each normalized annual metric row', () => {
    const payload = buildDashboardPayload(
      buildWatchlistStock(),
      { prices: [] },
      'aapl',
    );

    expect(payload.annualMetrics[0].fiscalYear).toBe(2023);
    expect(payload.annualMetrics[1].fiscalYear).toBe(2024);
  });

  it('preserves every annual metric row returned by the watchlist document', () => {
    const annualData = Array.from({ length: 16 }, (_, index) => {
      const fiscalYear = 2025 - index;

      return {
        fiscalYear,
        fiscalYearEndDate: `${fiscalYear}-12-31`,
        base: {
          sharePrice: { effectiveValue: 100 + index },
          sharesOnIssue: { effectiveValue: 1000000000 + index },
          marketCap: { effectiveValue: 100000000000 + index },
        },
      };
    });

    const payload = buildDashboardPayload(
      buildWatchlistStock({ annualData }),
      { prices: [] },
      'aapl',
    );

    expect(payload.annualMetrics).toHaveLength(16);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2010);
    expect(payload.annualMetrics[15].fiscalYear).toBe(2025);
  });

  it('fetches watchlist and price data through the canonical backend routes', async () => {
    const abortSignal = new AbortController().signal;

    axios.get
      .mockResolvedValueOnce({
        data: buildWatchlistStock(),
      })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      })
      .mockResolvedValueOnce({
        data: buildMetricsViewPayload(),
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.get).toHaveBeenNthCalledWith(1, '/api/watchlist/AAPL', { signal: abortSignal });
    expect(axios.get).toHaveBeenNthCalledWith(2, '/api/stock-prices/AAPL', { signal: abortSignal });
    expect(axios.get).toHaveBeenNthCalledWith(3, '/api/watchlist/AAPL/metrics-view', { signal: abortSignal });
    expect(payload.companyName).toBe('Apple Inc.');
    expect(payload.prices).toEqual([{ date: '2024-01-02', close: 185.64 }]);
    expect(payload.metricsRows[0].fieldPath).toBe('annualData[].forecastData.fy1.ebit');
  });

  it('loads batched dashboard bootstraps through the new watchlist dashboards route', async () => {
    const abortSignal = new AbortController().signal;

    axios.get.mockResolvedValueOnce({
      data: {
        dashboards: [
          {
            identifier: 'AAPL',
            companyName: 'Apple Inc.',
            investmentCategory: 'Profitable Hi Growth',
            priceCurrency: 'USD',
            prices: [{ date: '2024-01-02', close: 185.64 }],
            annualMetrics: [
              {
                fiscalYear: 2024,
                fiscalYearEndDate: '2024-12-31',
                earningsReleaseDate: '2025-02-15',
                sharePrice: 210.4,
                sharesOnIssue: 15500000000,
                marketCap: 3200000000000,
              },
            ],
            annualMainTableRows: [
              {
                fiscalYear: 2024,
                fiscalYearEndDate: '2024-12-31',
                cells: {
                  sharePrice: {
                    columnKey: 'annual-2024',
                    value: 210.4,
                    sourceOfTruth: 'roic',
                    isOverridden: false,
                    isOverrideable: true,
                    overrideTarget: {
                      kind: 'annual',
                      fiscalYear: 2024,
                      payloadPath: 'base.sharePrice',
                    },
                  },
                  sharesOnIssue: {
                    columnKey: 'annual-2024',
                    value: 15500000000,
                    sourceOfTruth: 'user',
                    isOverridden: true,
                    isOverrideable: true,
                    overrideTarget: {
                      kind: 'annual',
                      fiscalYear: 2024,
                      payloadPath: 'base.sharesOnIssue',
                    },
                  },
                },
              },
            ],
            metricsColumns: [],
            metricsRows: [],
            hasLoadedMetricsView: false,
            needsBackgroundRefresh: true,
          },
        ],
      },
    });

    const payload = await fetchWatchlistDashboardBootstraps({
      signal: abortSignal,
      tickers: ['aapl'],
    });

    expect(axios.get).toHaveBeenCalledWith('/api/watchlist/dashboards', {
      signal: abortSignal,
      params: {
        tickers: 'AAPL',
      },
    });
    expect(payload).toEqual([
      {
        identifier: 'AAPL',
        companyName: 'Apple Inc.',
        investmentCategory: 'Profitable Hi Growth',
        priceCurrency: 'USD',
        prices: [{ date: '2024-01-02', close: 185.64 }],
        annualMetrics: [
          {
            fiscalYear: 2024,
            fiscalYearEndDate: '2024-12-31',
            earningsReleaseDate: '2025-02-15',
            sharePrice: 210.4,
            sharesOnIssue: 15500000000,
            marketCap: 3200000000000,
          },
        ],
        annualMainTableRows: [
          {
            fiscalYear: 2024,
            fiscalYearEndDate: '2024-12-31',
            cells: {
              fiscalYearEndDate: {
                columnKey: 'annual-2024',
                value: null,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: false,
                overrideTarget: null,
                fieldKey: 'fiscalYearEndDate',
              },
              fiscalYear: {
                columnKey: 'annual-2024',
                value: null,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: false,
                overrideTarget: null,
                fieldKey: 'fiscalYear',
              },
              earningsReleaseDate: {
                columnKey: 'annual-2024',
                value: null,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: false,
                overrideTarget: null,
                fieldKey: 'earningsReleaseDate',
              },
              sharePrice: {
                columnKey: 'annual-2024',
                value: 210.4,
                sourceOfTruth: 'roic',
                isOverridden: false,
                isOverrideable: true,
                overrideTarget: {
                  kind: 'annual',
                  fiscalYear: 2024,
                  payloadPath: 'base.sharePrice',
                },
                fieldKey: 'sharePrice',
              },
              sharesOnIssue: {
                columnKey: 'annual-2024',
                value: 15500000000,
                sourceOfTruth: 'user',
                isOverridden: true,
                isOverrideable: true,
                overrideTarget: {
                  kind: 'annual',
                  fiscalYear: 2024,
                  payloadPath: 'base.sharesOnIssue',
                },
                fieldKey: 'sharesOnIssue',
              },
              marketCap: {
                columnKey: 'annual-2024',
                value: null,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: false,
                overrideTarget: null,
                fieldKey: 'marketCap',
              },
            },
          },
        ],
        metricsColumns: [],
        metricsRows: [],
        hasLoadedMetricsView: false,
        needsBackgroundRefresh: true,
        loadError: '',
      },
    ]);
  });

  it('loads metrics-view lazily through the dedicated endpoint', async () => {
    const abortSignal = new AbortController().signal;

    axios.get.mockResolvedValueOnce({
      data: buildMetricsViewPayload(),
    });

    const payload = await fetchDashboardMetricsView('aapl', { signal: abortSignal });

    expect(axios.get).toHaveBeenCalledWith('/api/watchlist/AAPL/metrics-view', { signal: abortSignal });
    expect(payload.hasLoadedMetricsView).toBe(true);
    expect(payload.metricsRows[0].fieldPath).toBe('annualData[].forecastData.fy1.ebit');
  });

  it('refreshes one dashboard in the background and then reloads its bootstrap payload', async () => {
    const abortSignal = new AbortController().signal;

    axios.post.mockResolvedValueOnce({
      data: buildWatchlistStock(),
    });
    axios.get.mockResolvedValueOnce({
      data: {
        dashboards: [
          {
            identifier: 'AAPL',
            companyName: 'Apple Inc.',
            investmentCategory: 'Profitable Hi Growth',
            priceCurrency: 'USD',
            prices: [{ date: '2024-01-02', close: 185.64 }],
            annualMetrics: [],
            metricsColumns: [],
            metricsRows: [],
            hasLoadedMetricsView: false,
            needsBackgroundRefresh: false,
          },
        ],
      },
    });

    const payload = await refreshWatchlistDashboardBootstrap('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
    expect(axios.get).toHaveBeenCalledWith('/api/watchlist/dashboards', {
      signal: abortSignal,
      params: {
        tickers: 'AAPL',
      },
    });
    expect(payload.identifier).toBe('AAPL');
    expect(payload.needsBackgroundRefresh).toBe(false);
  });

  it('updates the investment category through the canonical watchlist route', async () => {
    const abortSignal = new AbortController().signal;

    axios.patch = vi.fn().mockResolvedValueOnce({
      data: buildWatchlistStock({
        investmentCategory: 'Mature Compounder',
      }),
    });

    const result = await updateDashboardInvestmentCategory('aapl', 'Mature Compounder', {
      signal: abortSignal,
    });

    expect(axios.patch).toHaveBeenCalledWith(
      '/api/watchlist/AAPL',
      { investmentCategory: 'Mature Compounder' },
      { signal: abortSignal },
    );
    expect(result).toEqual({
      identifier: 'AAPL',
      investmentCategory: 'Mature Compounder',
    });
  });

  it('refreshes legacy default-10 watchlist stocks before building the dashboard payload', async () => {
    const abortSignal = new AbortController().signal;
    const legacyStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: 10,
      },
    });
    const refreshedStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
      },
      annualData: [
        {
          fiscalYear: 2024,
          fiscalYearEndDate: '2024-12-31',
          base: {
            sharePrice: { effectiveValue: 210.4 },
            sharesOnIssue: { effectiveValue: 15500000000 },
            marketCap: { effectiveValue: 3200000000000 },
          },
        },
        {
          fiscalYear: 2023,
          fiscalYearEndDate: '2023-12-31',
          base: {
            sharePrice: { effectiveValue: 189.6 },
            sharesOnIssue: { effectiveValue: 15700000000 },
            marketCap: { effectiveValue: 2980000000000 },
          },
        },
        {
          fiscalYear: 2022,
          fiscalYearEndDate: '2022-12-31',
          base: {
            sharePrice: { effectiveValue: 176.4 },
            sharesOnIssue: { effectiveValue: 15900000000 },
            marketCap: { effectiveValue: 2820000000000 },
          },
        },
      ],
    });

    axios.get
      .mockResolvedValueOnce({ data: legacyStockDocument })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });
    axios.post.mockResolvedValueOnce({ data: refreshedStockDocument });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
    expect(payload.annualMetrics).toHaveLength(3);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2022);
  });

  it('refreshes uncapped stocks that are missing the annual-history fetch version', async () => {
    const abortSignal = new AbortController().signal;
    const legacyStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
      },
    });
    const refreshedStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
      },
    });

    axios.get
      .mockResolvedValueOnce({ data: legacyStockDocument })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });
    axios.post.mockResolvedValueOnce({ data: refreshedStockDocument });

    await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
  });

  it('refreshes uncapped 10-row watchlist stocks before building the dashboard payload', async () => {
    const abortSignal = new AbortController().signal;
    const uncappedTenYearStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 1,
      },
      annualData: Array.from({ length: 10 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });
    const refreshedStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
      },
      annualData: Array.from({ length: 22 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: uncappedTenYearStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });
    axios.post.mockResolvedValueOnce({ data: refreshedStockDocument });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
    expect(payload.annualMetrics).toHaveLength(22);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2004);
    expect(payload.annualMetrics[21].fiscalYear).toBe(2025);
  });

  it('refreshes uncapped 20-row watchlist stocks before building the dashboard payload', async () => {
    const abortSignal = new AbortController().signal;
    const uncappedTwentyYearStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 1,
      },
      annualData: Array.from({ length: 20 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });
    const refreshedStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
      },
      annualData: Array.from({ length: 22 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: uncappedTwentyYearStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });
    axios.post.mockResolvedValueOnce({ data: refreshedStockDocument });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
    expect(payload.annualMetrics).toHaveLength(22);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2004);
    expect(payload.annualMetrics[21].fiscalYear).toBe(2025);
  });

  it('does not refresh versioned uncapped watchlist stocks that already use the new fetch contract', async () => {
    const abortSignal = new AbortController().signal;
    const upgradedStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
      },
      annualData: Array.from({ length: 22 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: upgradedStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).not.toHaveBeenCalled();
    expect(payload.annualMetrics).toHaveLength(22);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2004);
    expect(payload.annualMetrics[21].fiscalYear).toBe(2025);
  });

  it('does not refresh versioned uncapped short-history watchlist stocks', async () => {
    const abortSignal = new AbortController().signal;
    const upgradedShortHistoryStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
      },
      annualData: Array.from({ length: 10 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: upgradedShortHistoryStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).not.toHaveBeenCalled();
    expect(payload.annualMetrics).toHaveLength(10);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2016);
    expect(payload.annualMetrics[9].fiscalYear).toBe(2025);
  });

  it('does not refresh explicitly capped 20-row watchlist stocks', async () => {
    const abortSignal = new AbortController().signal;
    const explicitTwentyYearStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: 20,
        importRangeYearsExplicit: true,
        annualHistoryFetchVersion: 3,
      },
      annualData: Array.from({ length: 20 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: explicitTwentyYearStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).not.toHaveBeenCalled();
    expect(payload.annualMetrics).toHaveLength(20);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2006);
    expect(payload.annualMetrics[19].fiscalYear).toBe(2025);
  });

  it('does not refresh explicitly capped 10-row watchlist stocks', async () => {
    const abortSignal = new AbortController().signal;
    const explicitTenYearStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: 10,
        importRangeYearsExplicit: true,
        annualHistoryFetchVersion: 3,
      },
      annualData: Array.from({ length: 10 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: explicitTenYearStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).not.toHaveBeenCalled();
    expect(payload.annualMetrics).toHaveLength(10);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2016);
    expect(payload.annualMetrics[9].fiscalYear).toBe(2025);
  });
});
