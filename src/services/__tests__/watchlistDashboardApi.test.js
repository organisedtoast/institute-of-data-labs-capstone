import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildDashboardPayload, fetchDashboardData } from '../watchlistDashboardApi';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

function buildWatchlistStock(overrides = {}) {
  return {
    tickerSymbol: 'AAPL',
    companyName: {
      effectiveValue: 'Apple Inc.',
    },
    priceCurrency: 'USD',
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
    ],
    ...overrides,
  };
}

describe('watchlistDashboardApi', () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
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
    expect(payload.priceCurrency).toBe('USD');
    expect(payload.prices).toEqual([
      { date: '2024-01-02', close: 185.64 },
      { date: '2024-01-03', close: 184.25 },
    ]);
    expect(payload.annualMetrics).toEqual([
      {
        fiscalYear: 2023,
        fiscalYearEndDate: '2023-12-31',
        sharePrice: 189.6,
        sharesOnIssue: 15700000000,
        marketCap: 2980000000000,
      },
      {
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
        sharePrice: 210.4,
        sharesOnIssue: 15500000000,
        marketCap: 3200000000000,
      },
    ]);
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
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.get).toHaveBeenNthCalledWith(1, '/api/watchlist/AAPL', { signal: abortSignal });
    expect(axios.get).toHaveBeenNthCalledWith(2, '/api/stock-prices/AAPL', { signal: abortSignal });
    expect(payload.companyName).toBe('Apple Inc.');
    expect(payload.prices).toEqual([{ date: '2024-01-02', close: 185.64 }]);
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
});
