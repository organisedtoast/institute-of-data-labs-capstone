import React from 'react';
import Stack from '@mui/material/Stack';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import StockSearchResults from '../StockSearchResults.jsx';
import { stockSearchResultsShellSx } from '../stockSearchResultsLayout.js';

vi.mock('../../hooks/useStockSearch', () => ({
  default: () => ({
    searchResults: [],
    searchStatus: 'idle',
    searchError: '',
    isStockInWatchlist: () => false,
    addStockFromResult: vi.fn(),
    openExistingStock: vi.fn(),
    clearSearchFeedback: vi.fn(),
    queuePendingStockToAdd: vi.fn(),
    queuePendingStockToOpenExisting: vi.fn(),
  }),
}));

describe('StockSearchResults shared layout', () => {
  it('owns the shared page-width contract instead of relying on each page wrapper', () => {
    // This protects the real layout fix: future pages should inherit the same
    // search-results width without remembering special wrapper rules.
    expect(stockSearchResultsShellSx).toMatchObject({
      width: '100%',
      maxWidth: 1200,
      mx: 'auto',
      alignSelf: 'stretch',
    });
  });

  it('renders the shared search shell even inside a centered parent layout', () => {
    render(
      <MemoryRouter>
        <Stack spacing={3} alignItems="center">
          <StockSearchResults />
        </Stack>
      </MemoryRouter>,
    );

    const shell = screen.getByTestId('stock-search-results-shell');

    expect(shell.getAttribute('data-layout-contract')).toBe('shared-page-width');
    expect(screen.getByRole('heading', { name: 'Search results' })).toBeTruthy();
  });
});
