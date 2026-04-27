// Purpose of this test file:
// These tests focus on the visible search-results UI. They verify that the
// action button says `SEE STOCK` when a search result already exists in the
// loaded watchlist, says `ADD STOCK` when it does not, and calls the correct
// action helper when the user clicks the button.

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StockSearchResults from '../StockSearchResults';
import useStockSearch from '../../hooks/useStockSearch';

const mockNavigate = vi.fn();
let currentPathname = '/stocks';

vi.mock('../../hooks/useStockSearch', () => ({
  default: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');

  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: currentPathname }),
  };
});

function buildSearchResult(overrides = {}) {
  return {
    identifier: 'AAPL',
    name: 'Apple Inc.',
    ...overrides,
  };
}

function renderSearchResults(overrides = {}) {
  const contextValue = {
    searchResults: [buildSearchResult()],
    searchStatus: 'success',
    searchError: '',
    isStockInWatchlist: vi.fn(() => false),
    addStockFromResult: vi.fn(),
    openExistingStock: vi.fn(),
    clearSearchFeedback: vi.fn(),
    queuePendingStockToAdd: vi.fn(),
    queuePendingStockToOpenExisting: vi.fn(),
    ...overrides,
  };

  useStockSearch.mockReturnValue(contextValue);

  return {
    contextValue,
    ...render(<StockSearchResults />),
  };
}

describe('StockSearchResults', () => {
  beforeEach(() => {
    currentPathname = '/stocks';
    mockNavigate.mockReset();
    useStockSearch.mockReset();
  });

  it('shows SEE STOCK when the result already exists in the loaded watchlist', () => {
    // This simulates the frontend already knowing that AAPL exists in the
    // loaded `/api/watchlist` state. The UI should immediately reflect that
    // knowledge in the button label.
    renderSearchResults({
      isStockInWatchlist: vi.fn(() => true),
    });

    expect(screen.getByRole('button', { name: 'SEE STOCK' })).toBeTruthy();
  });

  it('shows ADD STOCK when the result is not in the loaded watchlist', () => {
    // This is the opposite case: the current page state does not know about
    // the ticker yet, so the user should see the normal add/import action.
    renderSearchResults({
      isStockInWatchlist: vi.fn(() => false),
    });

    expect(screen.getByRole('button', { name: 'ADD STOCK' })).toBeTruthy();
  });

  it('opens an existing stock on the Stocks page instead of adding it again', async () => {
    const user = userEvent.setup();

    // On `/stocks`, the page still owns focused-metrics mode, so existing-stock
    // opens are queued back through that page-owned path instead of bypassing it.
    const { contextValue } = renderSearchResults({
      isStockInWatchlist: vi.fn(() => true),
    });

    await user.click(screen.getByRole('button', { name: 'SEE STOCK' }));

    expect(contextValue.queuePendingStockToOpenExisting).toHaveBeenCalledWith({
      identifier: 'AAPL',
      name: 'Apple Inc.',
    });
    expect(contextValue.openExistingStock).not.toHaveBeenCalled();
    expect(contextValue.addStockFromResult).not.toHaveBeenCalled();
  });

  it('queues and navigates to Stocks when opening an existing stock from Home', async () => {
    const user = userEvent.setup();
    currentPathname = '/';

    // On Home, the component cannot open the card in place because the card
    // lives on `/stocks`. Instead it stores the pending open action and navigates.
    const { contextValue } = renderSearchResults({
      isStockInWatchlist: vi.fn(() => true),
    });

    await user.click(screen.getByRole('button', { name: 'SEE STOCK' }));

    expect(contextValue.queuePendingStockToOpenExisting).toHaveBeenCalledWith({
      identifier: 'AAPL',
      name: 'Apple Inc.',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/stocks');
    expect(contextValue.queuePendingStockToAdd).not.toHaveBeenCalled();
  });

  it('queues an add action on the Stocks page instead of adding immediately', async () => {
    const user = userEvent.setup();

    const { contextValue } = renderSearchResults({
      isStockInWatchlist: vi.fn(() => false),
    });

    await user.click(screen.getByRole('button', { name: 'ADD STOCK' }));

    expect(contextValue.queuePendingStockToAdd).toHaveBeenCalledWith({
      identifier: 'AAPL',
      name: 'Apple Inc.',
    });
    expect(contextValue.addStockFromResult).not.toHaveBeenCalled();
    expect(contextValue.queuePendingStockToOpenExisting).not.toHaveBeenCalled();
  });
});
