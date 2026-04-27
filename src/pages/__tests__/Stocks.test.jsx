// Purpose of this test file:
// These tests focus on the Stocks page orchestration layer. They verify that
// the page keeps the shared search UI visible, hides sibling stock cards when
// one card enters focused metrics mode, and restores the normal watchlist view
// when that focused card exits metrics mode.

import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Stocks from '../Stocks';
import useStockSearch from '../../hooks/useStockSearch';
import {
  fetchWatchlistDashboardBootstraps,
  refreshWatchlistDashboardBootstrap,
} from '../../services/watchlistDashboardApi';

const REFRESH_START_DELAY_MS = 3500;

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
    onFirstVisibleDashboardPaint,
    onMetricsVisibilityChange,
    onRemove,
  }) {
    React.useEffect(() => {
      onFirstVisibleDashboardPaint?.(identifier);
    }, [identifier, onFirstVisibleDashboardPaint]);

    return (
      <div
        data-testid="share-price-dashboard-mock"
        data-identifier={identifier}
      >
        <div>{name}</div>
        <div>{identifier}</div>
        {isFocusedMetricsMode ? <div>Focused metrics mode</div> : null}
        <button type="button" onClick={() => onMetricsVisibilityChange?.(true)}>
          ENTER METRICS
        </button>
        <button type="button" onClick={() => onMetricsVisibilityChange?.(false)}>
          EXIT METRICS
        </button>
        <button type="button" onClick={() => onRemove?.()}>
          Remove stock
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

function buildDashboardBootstrap(overrides = {}) {
  return {
    identifier: 'AAPL',
    companyName: 'Apple Inc.',
    prices: [{ date: '2024-01-02', close: 100 }],
    annualMetrics: [],
    metricsColumns: [],
    metricsRows: [],
    hasLoadedMetricsView: false,
    needsBackgroundRefresh: false,
    ...overrides,
  };
}

function buildManyStocks(count) {
  return Array.from({ length: count }, (_unusedValue, index) => {
    const numericIdentifier = String(index + 1).padStart(4, '0');
    return buildStock({
      identifier: `PERF${numericIdentifier}`,
      name: `Perf Stock ${numericIdentifier}`,
    });
  });
}

function buildManyDashboardBootstraps(stockCards) {
  return stockCards.map((stockCard, index) => {
    return buildDashboardBootstrap({
      identifier: stockCard.identifier,
      companyName: stockCard.name,
      prices: [{ date: '2024-01-02', close: 100 + index }],
    });
  });
}

function createDeferredPromise() {
  let resolvePromise;
  let rejectPromise;

  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  };
}

function installMockIntersectionObserver() {
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  const observerInstances = [];

  class MockIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.observedElements = new Set();
      observerInstances.push(this);
    }

    observe(element) {
      this.observedElements.add(element);
    }

    unobserve(element) {
      this.observedElements.delete(element);
    }

    disconnect() {
      this.observedElements.clear();
    }
  }

  globalThis.IntersectionObserver = MockIntersectionObserver;

  return {
    restore() {
      globalThis.IntersectionObserver = originalIntersectionObserver;
    },
    triggerIntersect(element) {
      observerInstances.forEach((observerInstance) => {
        if (!observerInstance.observedElements.has(element)) {
          return;
        }

        observerInstance.callback([
          {
            isIntersecting: true,
            target: element,
          },
        ]);
      });
    },
  };
}

function renderStocksPage(overrides = {}, dashboardBootstraps = null, options = {}) {
  const stockSearchState = {
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
  };

  useStockSearch.mockImplementation(() => stockSearchState);

  if (!options.skipDashboardBootstrapMock) {
    fetchWatchlistDashboardBootstraps.mockResolvedValue(dashboardBootstraps || [
      buildDashboardBootstrap(),
      buildDashboardBootstrap({
        identifier: 'MSFT',
        companyName: 'Microsoft Corporation',
        prices: [{ date: '2024-01-02', close: 200 }],
      }),
    ]);
  }

  return {
    stockSearchState,
    ...render(<Stocks />),
  };
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

    // Clicking ENTER METRICS on AAPL simulates the child dashboard asking the
    // page to focus that one stock and hide its siblings.
    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'ENTER METRICS' }));

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
    // EXIT METRICS returns the page to its ordinary multi-card watchlist state.
    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'ENTER METRICS' }));
    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'EXIT METRICS' }));

    expect(screen.getByTestId('stock-search-results')).toBeTruthy();
    expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    expect(getDashboardCard('AAPL')).toBeTruthy();
    expect(getDashboardCard('MSFT')).toBeTruthy();
    expect(screen.queryByText('Focused metrics mode')).toBeNull();
  });

  it('exits focused metrics mode before opening a different existing stock from search', async () => {
    const openExistingStock = vi.fn().mockResolvedValue(true);
    const clearPendingStockAction = vi.fn();
    const { rerender, stockSearchState } = renderStocksPage({
      openExistingStock,
      clearPendingStockAction,
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    });

    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'ENTER METRICS' }));

    expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(1);
    expect(getDashboardCard('AAPL')).toBeTruthy();
    expect(getDashboardCard('MSFT')).toBeUndefined();

    stockSearchState.pendingStockAction = {
      mode: 'open',
      stock: {
        identifier: 'MSFT',
        name: 'Microsoft Corporation',
      },
    };

    rerender(<Stocks />);

    await waitFor(() => {
      expect(clearPendingStockAction).toHaveBeenCalled();
      expect(openExistingStock).toHaveBeenCalledWith({
        identifier: 'MSFT',
        name: 'Microsoft Corporation',
      });
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    });

    expect(getDashboardCard('AAPL')).toBeTruthy();
    expect(getDashboardCard('MSFT')).toBeTruthy();
    expect(screen.queryByText('Focused metrics mode')).toBeNull();
  });

  it('exits focused metrics mode before adding a stock from search', async () => {
    const addStockFromResult = vi.fn().mockResolvedValue(true);
    const clearPendingStockAction = vi.fn();
    const { rerender, stockSearchState } = renderStocksPage({
      addStockFromResult,
      clearPendingStockAction,
    });
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    });

    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'ENTER METRICS' }));

    expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(1);
    expect(getDashboardCard('AAPL')).toBeTruthy();
    expect(getDashboardCard('MSFT')).toBeUndefined();

    stockSearchState.pendingStockAction = {
      mode: 'add',
      stock: {
        identifier: 'NVDA',
        name: 'NVIDIA Corporation',
      },
    };

    rerender(<Stocks />);

    await waitFor(() => {
      expect(clearPendingStockAction).toHaveBeenCalled();
      expect(addStockFromResult).toHaveBeenCalledWith({
        identifier: 'NVDA',
        name: 'NVIDIA Corporation',
      });
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    });

    expect(getDashboardCard('AAPL')).toBeTruthy();
    expect(getDashboardCard('MSFT')).toBeTruthy();
    expect(screen.queryByText('Focused metrics mode')).toBeNull();
  });

  it('opens a confirmation dialog with the stock name and cancels without removing', async () => {
    const user = userEvent.setup();
    const removeStockByIdentifier = vi.fn().mockResolvedValue(true);

    renderStocksPage({ removeStockByIdentifier });

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    });

    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'Remove stock' }));

    expect(screen.getByText('CONFIRM REMOVAL of Apple Inc.')).toBeTruthy();
    expect(removeStockByIdentifier).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('CONFIRM REMOVAL of Apple Inc.')).toBeNull();
    expect(removeStockByIdentifier).not.toHaveBeenCalled();
  });

  it('falls back to the ticker symbol when no stock name is available for the confirmation dialog', async () => {
    const user = userEvent.setup();

    renderStocksPage(
      {
        stocks: [
          buildStock({
            identifier: 'AAPL',
            name: '',
          }),
        ],
      },
      [
        buildDashboardBootstrap({
          companyName: '',
        }),
      ],
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(1);
    });

    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'Remove stock' }));

    expect(screen.getByText('CONFIRM REMOVAL of AAPL')).toBeTruthy();
  });

  it('keeps focused metrics mode during open and cancel, then clears it only after confirmed removal', async () => {
    const user = userEvent.setup();
    const removeStockByIdentifier = vi.fn().mockResolvedValue(true);

    renderStocksPage({ removeStockByIdentifier });

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    });

    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'ENTER METRICS' }));

    expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(1);
    expect(within(getDashboardCard('AAPL')).getByText('Focused metrics mode')).toBeTruthy();

    await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'Remove stock' }));

    expect(screen.getByText('CONFIRM REMOVAL of Apple Inc.')).toBeTruthy();
    expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(1);
    expect(within(getDashboardCard('AAPL')).getByText('Focused metrics mode')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('CONFIRM REMOVAL of Apple Inc.')).toBeNull();
    expect(removeStockByIdentifier).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(1);
    expect(within(getDashboardCard('AAPL')).getByText('Focused metrics mode')).toBeTruthy();

    const focusedCardAfterCancel = getDashboardCard('AAPL');

    await user.click(within(focusedCardAfterCancel).getByRole('button', { name: 'Remove stock', hidden: true }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove stock' }));

    await waitFor(() => {
      expect(removeStockByIdentifier).toHaveBeenCalledWith('AAPL');
    });

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
    });

    expect(getDashboardCard('AAPL')).toBeTruthy();
    expect(getDashboardCard('MSFT')).toBeTruthy();
    expect(screen.queryByText('Focused metrics mode')).toBeNull();
  });

  it('refreshes legacy dashboard cards in the background without blocking the initial render', { timeout: REFRESH_START_DELAY_MS * 2 + 4000 }, async () => {
    const firstBootstrapBatch = createDeferredPromise();

    fetchWatchlistDashboardBootstraps.mockReturnValueOnce(firstBootstrapBatch.promise);
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
    }, null, {
      skipDashboardBootstrapMock: true,
    });

    expect(screen.getByTestId('share-price-dashboard-shell')).toBeTruthy();
    expect(refreshWatchlistDashboardBootstrap).not.toHaveBeenCalled();

    firstBootstrapBatch.resolve([
      buildDashboardBootstrap({
        needsBackgroundRefresh: true,
      }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(1);
    });

    expect(screen.queryByText('Loading your watchlist...')).toBeNull();
    expect(refreshWatchlistDashboardBootstrap).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, REFRESH_START_DELAY_MS - 250));
    });

    expect(refreshWatchlistDashboardBootstrap).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(refreshWatchlistDashboardBootstrap).toHaveBeenCalledWith('AAPL');
    }, { timeout: REFRESH_START_DELAY_MS + 2000 });
  });

  it('renders summary shells before the first dashboard bootstrap request completes', async () => {
    const deferredBootstrapResponse = createDeferredPromise();
    const intersectionHarness = installMockIntersectionObserver();

    fetchWatchlistDashboardBootstraps.mockReturnValueOnce(deferredBootstrapResponse.promise);

    try {
      renderStocksPage({}, null, {
        skipDashboardBootstrapMock: true,
      });

      expect(screen.getAllByTestId('share-price-dashboard-shell')).toHaveLength(2);
      expect(screen.queryAllByTestId('share-price-dashboard-mock')).toHaveLength(0);

      deferredBootstrapResponse.resolve([
        buildDashboardBootstrap(),
        buildDashboardBootstrap({
          identifier: 'MSFT',
          companyName: 'Microsoft Corporation',
          prices: [{ date: '2024-01-02', close: 200 }],
        }),
      ]);

      await waitFor(() => {
        expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(2);
      });
    } finally {
      intersectionHarness.restore();
    }
  });

  it('requests only the initial dashboard bootstrap chunk on first paint', async () => {
    const summaryStocks = buildManyStocks(15);
    const initialChunk = buildManyDashboardBootstraps(summaryStocks.slice(0, 4));
    const intersectionHarness = installMockIntersectionObserver();

    try {
      renderStocksPage(
        {
          stocks: summaryStocks,
        },
        initialChunk,
      );

      await waitFor(() => {
        expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(1);
      });

      expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledWith({
        tickers: summaryStocks.slice(0, 4).map((stock) => stock.identifier),
      });

      await waitFor(() => {
        expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(4);
      });
      expect(screen.getAllByTestId('share-price-dashboard-shell')).toHaveLength(11);
    } finally {
      intersectionHarness.restore();
    }
  });

  it('keeps the first render window bounded until the sentinel grows it', async () => {
    const summaryStocks = buildManyStocks(80);
    const initialChunk = buildManyDashboardBootstraps(summaryStocks.slice(0, 4));
    const intersectionHarness = installMockIntersectionObserver();

    try {
      renderStocksPage(
        {
          stocks: summaryStocks,
        },
        initialChunk,
      );

      await waitFor(() => {
        expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(4);
      });

      expect(screen.getAllByTestId('share-price-dashboard-shell')).toHaveLength(20);
      expect(screen.queryByText(summaryStocks[24].name)).toBeNull();

      await act(async () => {
        intersectionHarness.triggerIntersect(screen.getByTestId('stocks-render-window-sentinel'));
      });

      await waitFor(() => {
        expect(screen.getAllByTestId('share-price-dashboard-shell')).toHaveLength(68);
      });

      expect(screen.getByText(summaryStocks[24].name)).toBeTruthy();
      expect(screen.getByText(summaryStocks[71].name)).toBeTruthy();
      expect(screen.queryByText(summaryStocks[72].name)).toBeNull();
    } finally {
      intersectionHarness.restore();
    }
  });

  it('queues later viewport requests instead of firing overlapping bootstrap fetches', async () => {
    const summaryStocks = buildManyStocks(40);
    const initialChunk = buildManyDashboardBootstraps(summaryStocks.slice(0, 4));
    const secondChunk = createDeferredPromise();
    const intersectionHarness = installMockIntersectionObserver();

    fetchWatchlistDashboardBootstraps
      .mockResolvedValueOnce(initialChunk)
      .mockReturnValueOnce(secondChunk.promise);

    try {
      renderStocksPage(
        {
          stocks: summaryStocks,
        },
        null,
        {
          skipDashboardBootstrapMock: true,
        },
      );

      await waitFor(() => {
        expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(1);
      });

      const fifthShellCard = screen.getAllByTestId('share-price-dashboard-shell-observer-target').find((cardNode) => {
        return cardNode.getAttribute('data-identifier') === summaryStocks[4].identifier;
      });
      const seventeenthShellCard = screen.getAllByTestId('share-price-dashboard-shell-observer-target').find((cardNode) => {
        return cardNode.getAttribute('data-identifier') === summaryStocks[16].identifier;
      });

      expect(fifthShellCard).toBeTruthy();
      expect(seventeenthShellCard).toBeTruthy();

      // Each intersection now enqueues only the intersecting card so the
      // initial wave of viewport activations does not snowball past what is
      // actually on screen. The drain step still bundles all queued
      // identifiers into one fetch, which is what we assert below.
      await act(async () => {
        intersectionHarness.triggerIntersect(fifthShellCard);
        intersectionHarness.triggerIntersect(seventeenthShellCard);
      });

      await waitFor(() => {
        expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(2);
      });

      expect(fetchWatchlistDashboardBootstraps).toHaveBeenNthCalledWith(2, {
        tickers: [summaryStocks[4].identifier, summaryStocks[16].identifier],
      });

      secondChunk.resolve(
        buildManyDashboardBootstraps([summaryStocks[4], summaryStocks[16]]),
      );

      await waitFor(() => {
        expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(6);
      });
      expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(2);
    } finally {
      intersectionHarness.restore();
    }
  });

  it('automatically drains queued viewport requests after an in-flight batch settles', async () => {
    const summaryStocks = buildManyStocks(40);
    const initialChunk = buildManyDashboardBootstraps(summaryStocks.slice(0, 4));
    const secondChunk = createDeferredPromise();
    const thirdChunk = createDeferredPromise();
    const intersectionHarness = installMockIntersectionObserver();

    fetchWatchlistDashboardBootstraps
      .mockResolvedValueOnce(initialChunk)
      .mockReturnValueOnce(secondChunk.promise)
      .mockReturnValueOnce(thirdChunk.promise);

    try {
      renderStocksPage(
        {
          stocks: summaryStocks,
        },
        null,
        {
          skipDashboardBootstrapMock: true,
        },
      );

      await waitFor(() => {
        expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(1);
      });

      const fifthShellCard = screen.getAllByTestId('share-price-dashboard-shell-observer-target').find((cardNode) => {
        return cardNode.getAttribute('data-identifier') === summaryStocks[4].identifier;
      });
      const seventeenthShellCard = screen.getAllByTestId('share-price-dashboard-shell-observer-target').find((cardNode) => {
        return cardNode.getAttribute('data-identifier') === summaryStocks[16].identifier;
      });
      const eighteenthShellCard = screen.getAllByTestId('share-price-dashboard-shell-observer-target').find((cardNode) => {
        return cardNode.getAttribute('data-identifier') === summaryStocks[17].identifier;
      });

      expect(fifthShellCard).toBeTruthy();
      expect(seventeenthShellCard).toBeTruthy();
      expect(eighteenthShellCard).toBeTruthy();

      await act(async () => {
        intersectionHarness.triggerIntersect(fifthShellCard);
      });

      await waitFor(() => {
        expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(2);
      });

      expect(fetchWatchlistDashboardBootstraps).toHaveBeenNthCalledWith(2, {
        tickers: [summaryStocks[4].identifier],
      });

      // These later shells intersect while the earlier batch is still loading.
      // They should queue up quietly and wait for the current request to finish.
      await act(async () => {
        intersectionHarness.triggerIntersect(seventeenthShellCard);
        intersectionHarness.triggerIntersect(eighteenthShellCard);
      });

      expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(2);

      secondChunk.resolve(
        buildManyDashboardBootstraps([summaryStocks[4]]),
      );

      await waitFor(() => {
        expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(3);
      });

      expect(fetchWatchlistDashboardBootstraps).toHaveBeenNthCalledWith(3, {
        tickers: [summaryStocks[16].identifier, summaryStocks[17].identifier],
      });

      thirdChunk.resolve(
        buildManyDashboardBootstraps([summaryStocks[16], summaryStocks[17]]),
      );

      await waitFor(() => {
        expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(7);
      });
    } finally {
      intersectionHarness.restore();
    }
  });

  it('keeps turning fresh-load scrolled shells into mounted dashboards across multiple follow-up batches', async () => {
    const summaryStocks = buildManyStocks(40);
    const initialChunk = buildManyDashboardBootstraps(summaryStocks.slice(0, 4));
    const secondChunk = createDeferredPromise();
    const thirdChunk = createDeferredPromise();
    const fourthChunk = createDeferredPromise();
    const intersectionHarness = installMockIntersectionObserver();

    fetchWatchlistDashboardBootstraps
      .mockResolvedValueOnce(initialChunk)
      .mockReturnValueOnce(secondChunk.promise)
      .mockReturnValueOnce(thirdChunk.promise)
      .mockReturnValueOnce(fourthChunk.promise);

    try {
      renderStocksPage(
        {
          stocks: summaryStocks,
        },
        null,
        {
          skipDashboardBootstrapMock: true,
        },
      );

      await waitFor(() => {
        expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(4);
      });

      const fifthShellCard = screen.getAllByTestId('share-price-dashboard-shell-observer-target').find((cardNode) => {
        return cardNode.getAttribute('data-identifier') === summaryStocks[4].identifier;
      });
      const sixthShellCard = screen.getAllByTestId('share-price-dashboard-shell-observer-target').find((cardNode) => {
        return cardNode.getAttribute('data-identifier') === summaryStocks[5].identifier;
      });
      const seventeenthShellCard = screen.getAllByTestId('share-price-dashboard-shell-observer-target').find((cardNode) => {
        return cardNode.getAttribute('data-identifier') === summaryStocks[16].identifier;
      });

      expect(fifthShellCard).toBeTruthy();
      expect(sixthShellCard).toBeTruthy();
      expect(seventeenthShellCard).toBeTruthy();

      await act(async () => {
        intersectionHarness.triggerIntersect(fifthShellCard);
      });

      await waitFor(() => {
        expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(2);
      });

      secondChunk.resolve(
        buildManyDashboardBootstraps([summaryStocks[4]]),
      );

      await waitFor(() => {
        expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(5);
      });

      await act(async () => {
        intersectionHarness.triggerIntersect(sixthShellCard);
      });

      await waitFor(() => {
        expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(3);
      });

      thirdChunk.resolve(
        buildManyDashboardBootstraps([summaryStocks[5]]),
      );

      await waitFor(() => {
        expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(6);
      });

      await act(async () => {
        intersectionHarness.triggerIntersect(seventeenthShellCard);
      });

      await waitFor(() => {
        expect(fetchWatchlistDashboardBootstraps).toHaveBeenCalledTimes(4);
      });

      fourthChunk.resolve(
        buildManyDashboardBootstraps([summaryStocks[16]]),
      );

      await waitFor(() => {
        expect(screen.getAllByTestId('share-price-dashboard-mock')).toHaveLength(7);
      });
    } finally {
      intersectionHarness.restore();
    }
  });
});
