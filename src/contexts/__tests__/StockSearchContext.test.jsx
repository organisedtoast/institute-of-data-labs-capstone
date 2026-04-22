// Purpose of this test file:
// These tests protect the shared stock-search state used by the Home and Stocks
// pages. They focus on how the context loads the watchlist, decides whether a
// searched ticker already exists, reuses an existing watchlist entry instead of
// importing again, imports missing stocks, and now opens/prioritizes existing
// stocks through the dedicated `SEE STOCK` path.

import React from 'react';
import axios from 'axios';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import StockSearchProvider from '../StockSearchContext.jsx';
import useStockSearch from '../../hooks/useStockSearch';

vi.mock('axios', () => ({
  default: {
    delete: vi.fn(),
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
    ...overrides,
  };
}

function ContextHarness() {
  const {
    stocks,
    stocksStatus,
    stocksError,
    searchText,
    searchStatus,
    searchError,
    runStockSearch,
    setSearchText,
    isStockInWatchlist,
    addStockFromResult,
    openExistingStock,
    removeStockByIdentifier,
  } = useStockSearch();

  return (
    <div>
      <div data-testid="stocks-status">{stocksStatus}</div>
      <div data-testid="stocks-error">{stocksError}</div>
      <div data-testid="search-status">{searchStatus}</div>
      <div data-testid="search-error">{searchError}</div>
      <div data-testid="in-watchlist">{String(isStockInWatchlist('AAPL'))}</div>

      <ul data-testid="stocks-list">
        {stocks.map((stock) => (
          <li key={stock.identifier}>
            {stock.identifier}:{stock.name}
          </li>
        ))}
      </ul>

      <input
        aria-label="search-input"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />

      <button type="button" onClick={() => runStockSearch()}>
        Run Search
      </button>

      <button type="button" onClick={() => addStockFromResult({ identifier: 'AAPL', name: 'Apple Inc.' })}>
        Add AAPL
      </button>

      <button type="button" onClick={() => openExistingStock({ identifier: 'AAPL', name: 'Apple Inc.' })}>
        Open AAPL
      </button>

      <button type="button" onClick={() => removeStockByIdentifier('AAPL')}>
        Remove AAPL
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <StockSearchProvider>
      <ContextHarness />
    </StockSearchProvider>,
  );
}

describe('StockSearchContext', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
    axios.delete.mockReset();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('loads stock cards from the backend watchlist on mount', async () => {
    // The first `axios.get` call always loads `/api/watchlist` when the provider mounts.
    // Returning one stock here simulates the page booting with AAPL already in MongoDB.
    axios.get.mockResolvedValueOnce({
      data: [buildWatchlistStock()],
    });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('stocks-status').textContent).toBe('success');
    });

    // The rendered list proves the backend watchlist document was normalized
    // into the simpler card shape used by the UI.
    expect(screen.getByText('AAPL:Apple Inc.')).toBeTruthy();
    expect(screen.getByTestId('in-watchlist').textContent).toBe('true');
  });

  it('reuses an existing watchlist stock without importing it again', async () => {
    const user = userEvent.setup();

    // Call order matters in this test:
    // 1. initial provider mount loads an empty watchlist
    // 2. addStockFromResult checks whether /api/watchlist/AAPL already exists
    // 3. loadStocks runs again and returns the watchlist with AAPL in it
    axios.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: buildWatchlistStock() })
      .mockResolvedValueOnce({ data: [buildWatchlistStock()] });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('stocks-status').textContent).toBe('success');
    });

    await user.click(screen.getByRole('button', { name: 'Add AAPL' }));

    await waitFor(() => {
      expect(screen.getByTestId('search-status').textContent).toBe('success');
    });

    // This is the key business rule: if the stock already exists, we must not
    // call the import route and create a duplicate record.
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.get).toHaveBeenNthCalledWith(2, '/api/watchlist/AAPL');
    expect(screen.getByText('AAPL:Apple Inc.')).toBeTruthy();
  });

  it('opens an existing watchlist stock without checking the import route again', async () => {
    const user = userEvent.setup();

    // This test covers the new dedicated "SEE STOCK" path.
    // Because the stock is already in loaded frontend state, the context can
    // simply reload/prioritize the watchlist instead of re-checking/importing.
    axios.get
      .mockResolvedValueOnce({ data: [buildWatchlistStock()] })
      .mockResolvedValueOnce({ data: [buildWatchlistStock()] });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('stocks-status').textContent).toBe('success');
    });

    await user.click(screen.getByRole('button', { name: 'Open AAPL' }));

    await waitFor(() => {
      expect(screen.getByTestId('search-status').textContent).toBe('success');
    });

    // The open-existing path should never call either the existence check route
    // or the import route. It only reloads the already-known watchlist.
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(axios.get).not.toHaveBeenCalledWith('/api/watchlist/AAPL');
    expect(screen.getByText('AAPL:Apple Inc.')).toBeTruthy();
  });

  it('imports a missing stock with the default turnaround category', async () => {
    const user = userEvent.setup();

    // Call order here simulates the "stock does not exist yet" path:
    // 1. initial watchlist load is empty
    // 2. existence check for /api/watchlist/AAPL returns 404
    // 3. reloading the watchlist after import now returns AAPL
    axios.get
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce({
        response: {
          status: 404,
        },
      })
      .mockResolvedValueOnce({ data: [buildWatchlistStock()] });
    axios.post.mockResolvedValueOnce({
      data: buildWatchlistStock(),
    });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('stocks-status').textContent).toBe('success');
    });

    await user.click(screen.getByRole('button', { name: 'Add AAPL' }));

    await waitFor(() => {
      expect(screen.getByTestId('search-status').textContent).toBe('success');
    });

    // Missing stocks should still go through the import route with the default category.
    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/import', {
      tickerSymbol: 'AAPL',
      investmentCategory: 'Firm Specific Turnaround',
    });
    expect(screen.getByText('AAPL:Apple Inc.')).toBeTruthy();
  });

  it('removes a stock through the backend watchlist delete route', async () => {
    const user = userEvent.setup();

    // This test starts with one visible stock and then returns an empty
    // watchlist after delete to simulate the normal remove flow.
    axios.get
      .mockResolvedValueOnce({ data: [buildWatchlistStock()] })
      .mockResolvedValueOnce({ data: [] });
    axios.delete.mockResolvedValueOnce({
      data: {
        message: 'Deleted',
      },
    });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByText('AAPL:Apple Inc.')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Remove AAPL' }));

    await waitFor(() => {
      expect(screen.queryByText('AAPL:Apple Inc.')).toBeNull();
    });

    expect(axios.delete).toHaveBeenCalledWith('/api/watchlist/AAPL');
  });

  it('shows the backend search error message when the API returns structured JSON', async () => {
    const user = userEvent.setup();

    // Initial watchlist load succeeds, but the later stock-search request fails
    // with a structured backend JSON error. The UI should surface that message verbatim.
    axios.get
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce({
        response: {
          status: 502,
          data: {
            message: 'ROIC search authentication failed. Check ROIC_API_KEY.',
          },
        },
      });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('stocks-status').textContent).toBe('success');
    });

    await user.type(screen.getByLabelText('search-input'), 'AAPL');
    await user.click(screen.getByRole('button', { name: 'Run Search' }));

    await waitFor(() => {
      expect(screen.getByTestId('search-status').textContent).toBe('error');
    });

    expect(screen.getByTestId('search-error').textContent).toBe(
      'ROIC search authentication failed. Check ROIC_API_KEY.',
    );
  });

  it('shows the connectivity hint when the search request never reaches the backend', async () => {
    const user = userEvent.setup();

    // This simulates a network-level failure where there is no backend JSON body.
    // In that case the UI should switch to the connectivity-specific fallback message.
    axios.get
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce({
        code: 'ERR_NETWORK',
        message: 'Network Error',
      });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('stocks-status').textContent).toBe('success');
    });

    await user.type(screen.getByLabelText('search-input'), 'AAPL');
    await user.click(screen.getByRole('button', { name: 'Run Search' }));

    await waitFor(() => {
      expect(screen.getByTestId('search-status').textContent).toBe('error');
    });

    expect(screen.getByTestId('search-error').textContent).toBe(
      'The search service could not be reached. Make sure the backend API is running on http://localhost:3000.',
    );
  });
});
