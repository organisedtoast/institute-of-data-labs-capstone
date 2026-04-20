import React from 'react';
import axios from 'axios';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    searchStatus,
    searchError,
    addStockFromResult,
    removeStockByIdentifier,
  } = useStockSearch();

  return (
    <div>
      <div data-testid="stocks-status">{stocksStatus}</div>
      <div data-testid="stocks-error">{stocksError}</div>
      <div data-testid="search-status">{searchStatus}</div>
      <div data-testid="search-error">{searchError}</div>

      <ul data-testid="stocks-list">
        {stocks.map((stock) => (
          <li key={stock.identifier}>
            {stock.identifier}:{stock.name}
          </li>
        ))}
      </ul>

      <button type="button" onClick={() => addStockFromResult({ identifier: 'AAPL', name: 'Apple Inc.' })}>
        Add AAPL
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
  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
    axios.delete.mockReset();
  });

  it('loads stock cards from the backend watchlist on mount', async () => {
    axios.get.mockResolvedValueOnce({
      data: [buildWatchlistStock()],
    });

    renderHarness();

    await waitFor(() => {
      expect(screen.getByTestId('stocks-status').textContent).toBe('success');
    });

    expect(screen.getByText('AAPL:Apple Inc.')).toBeTruthy();
  });

  it('reuses an existing watchlist stock without importing it again', async () => {
    const user = userEvent.setup();

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

    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.get).toHaveBeenNthCalledWith(2, '/api/watchlist/AAPL');
    expect(screen.getByText('AAPL:Apple Inc.')).toBeTruthy();
  });

  it('imports a missing stock with the default turnaround category', async () => {
    const user = userEvent.setup();

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

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/import', {
      tickerSymbol: 'AAPL',
      investmentCategory: 'Firm Specific Turnaround',
    });
    expect(screen.getByText('AAPL:Apple Inc.')).toBeTruthy();
  });

  it('removes a stock through the backend watchlist delete route', async () => {
    const user = userEvent.setup();

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
});
