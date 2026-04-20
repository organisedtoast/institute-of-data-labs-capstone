import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildDashboardPayload, fetchDashboardData } from '../watchlistDashboardApi';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
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
          returnOnInvestedCapital: { effectiveValue: 34.2 },
        },
      },
      {
        fiscalYear: 2023,
        fiscalYearEndDate: '2023-12-31',
        base: {
          sharePrice: { effectiveValue: 189.6 },
          sharesOnIssue: { effectiveValue: 15700000000 },
          marketCap: { effectiveValue: 2980000000000 },
          returnOnInvestedCapital: { effectiveValue: 31.8 },
        },
      },
    ],
    ...overrides,
  };
}

describe('watchlistDashboardApi', () => {
  beforeEach(() => {
    axios.get.mockReset();
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
        stockPrice: 189.6,
        sharesOutstanding: 15700000000,
        marketCap: 2980000000000,
        returnOnInvestedCapital: 31.8,
      },
      {
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
        stockPrice: 210.4,
        sharesOutstanding: 15500000000,
        marketCap: 3200000000000,
        returnOnInvestedCapital: 34.2,
      },
    ]);
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
});
