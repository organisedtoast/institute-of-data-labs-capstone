// Purpose of this test file:
// These tests focus on the Stocks page orchestration layer. They verify that
// the page keeps the shared search UI visible, hides sibling stock cards when
// one card enters focused metrics mode, and restores the normal watchlist view
// when that focused card exits metrics mode.

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Stocks from '../Stocks';
import useStockSearch from '../../hooks/useStockSearch';
import {
  fetchWatchlistDashboardBootstraps,
  refreshWatchlistDashboardBootstrap,
} from '../../services/watchlistDashboardApi';

vi.mock('../../hooks/useStockSearch', () => ({
  default: vi.fn(),
}));

vi.mock('../../services/watchlistDashboardApi', () => ({
  fetchWatchlistDashboardBootstraps: vi.fn(),
  refreshWatchlistDashboardBootstrap: vi.fn(),
}));

vi.mock('../../components/StockSearchResults', () => ({
  default: function MockStockSearchResults() {
    return <div data-testid="stock-search-results">Search Results</div>;
  },
}));

vi.mock('../../components/SharePriceDashboard', () => ({
  default: function MockSharePriceDashboard({
    identifier,
    isFocusedMetricsMode = false,
    name,
    onMetricsVisibilityChange,
  }) {
    return (
      <div
        data-testid="share-price-dashboard-mock"
        data-identifier={identifier}
      >
        <div>{name}</div>
        <div>{identifier}</div>
        {isFocusedMetricsMode ? <div>Focused metrics mode</div> : null}
        <button type="button" onClick={() => onMetricsVisibilityChange?.(true)}>
          SHOW METRICS
        </button>
        <button type="button" onClick={() => onMetricsVisibilityChange?.(false)}>
          HIDE METRICS
        </button>
      </div>
    );
  },
}));

function buildStock(overrides = {}) {
  return {
    identifier: 'AAPL',
    isUserAdded: true,
    name: 'Apple Inc.',
    ...overrides,
  };
}

function renderStocksPage(overrides = {}) {
  useStockSearch.mockReturnValue({
    stocks: [
      buildStock(),
      buildStock({
        identifier: 'MSFT',
        name: 'Microsoft Corporation',
      }),
    ],
    stocksStatus: 'success',
    stocksError: '',
    addStockFromResult: vi.fn(),
    openExistingStock: vi.fn(),
    removeStockByIdentifier: vi.fn(),
    pendingStockAction: null,
    clearPendingStockAction: vi.fn(),
    ...overrides,
  });

  fetchWatchlistDashboardBootstraps.mockResolvedValue([
    {
      identifier: 'AAPL',
      companyName: 'Apple Inc.',
      prices: [{ date: '2024-01-02', close: 100 }],
      annualMetrics: [],
      metricsColumns: [],
      metricsRows: [],
      hasLoadedMetricsView: false,
      needsBackgroundRefresh: false,
    },
    {
      identifier: 'MSFT',
      companyName: 'Microsoft Corporation',
      prices: [{ date: '2024-01-02', close: 200 }],
      annualMetrics: [],
      metricsColumns: [],
      metricsRows: [],
      hasLoadedMetricsView: false,
      needsBackgroundRefresh: false,
    },
  ]);

  return render(<Stocks />);
}

// This helper finds one mocked dashboard card by ticker symbol so each test can
// describe page behavior in plain language instead of repeatedly filtering the DOM.
function getDashboardCard(identifier) {
  return screen.getAllByTestId('share-price-dashboard-mock').find((cardNode) => {
    return cardNode.getAttribute('data-identifier') === identifier;
  });
}

describe('Stocks page focused metrics mode', () => {
  beforeEach(() => {
    useStockSearch.mockReset();
    fetchWatchlistDashboardBootstraps.mockReset();
    refreshWatchlistDashboardBootstrap.mockReset();
  });

  it('keeps search visible while hiding sibling stock cards for the focused stock', async () => {
    const user = userEvent.setup();

    renderStocksPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    });

    // The page starts in its normal watchlist mode, so both mocked cards should
    // be visible before any stock enters focused metrics mode.
    expect(screen.getByTestId('stock-search-results')).toBeTruthy();

    // Clicking SHOW METRICS on AAPL simulates the child dashboard asking the
    // page to focus that one stock and hide its siblings.
    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'SHOW METRICS' }));

    expect(screen.getByTestId('stock-search-results')).toBeTruthy();
    expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(1);
    expect(getDashboardCard('AAPL')).toBeTruthy();
    expect(getDashboardCard('MSFT')).toBeUndefined();
    expect(within(getDashboardCard('AAPL')).getByText('Focused metrics mode')).toBeTruthy();
  });

  it('restores the full watchlist when the focused stock hides metrics', async () => {
    const user = userEvent.setup();

    renderStocksPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    });

    // We enter focused metrics mode first so the second click can prove that
    // HIDE METRICS returns the page to its ordinary multi-card watchlist state.
    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'SHOW METRICS' }));
    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'HIDE METRICS' }));

    expect(screen.getByTestId('stock-search-results')).toBeTruthy();
    expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    expect(getDashboardCard('AAPL')).toBeTruthy();
    expect(getDashboardCard('MSFT')).toBeTruthy();
    expect(screen.queryByText('Focused metrics mode')).toBeNull();
  });

  it('refreshes legacy dashboard cards in the background without blocking the initial render', async () => {
    fetchWatchlistDashboardBootstraps.mockResolvedValueOnce([
      {
        identifier: 'AAPL',
        companyName: 'Apple Inc.',
        prices: [{ date: '2024-01-02', close: 100 }],
        annualMetrics: [],
        metricsColumns: [],
        metricsRows: [],
        hasLoadedMetricsView: false,
        needsBackgroundRefresh: true,
      },
    ]);
    refreshWatchlistDashboardBootstrap.mockResolvedValueOnce({
      identifier: 'AAPL',
      companyName: 'Apple Inc.',
      prices: [{ date: '2024-01-02', close: 101 }],
      annualMetrics: [],
      metricsColumns: [],
      metricsRows: [],
      hasLoadedMetricsView: false,
      needsBackgroundRefresh: false,
    });

    renderStocksPage({
      stocks: [buildStock()],
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(1);
    });

    expect(screen.queryByText('Loading your watchlist...')).toBeNull();

    await waitFor(() => {
      expect(refreshWatchlistDashboardBootstrap).toHaveBeenCalledWith('AAPL');
    });
  });
});
