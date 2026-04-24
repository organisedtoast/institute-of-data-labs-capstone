import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import Home from '../Home.jsx';

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

vi.mock('../../components/SectorCardComponent.jsx', () => ({
  default: function MockSectorCardComponent() {
    return <div data-testid="mock-sector-card" />;
  },
}));

vi.mock('../../services/investmentCategoryCardsApi', () => ({
  fetchAllInvestmentCategoryCards: vi.fn().mockResolvedValue([]),
}));

describe('Home search-results layout', () => {
  it('keeps the shared search-results width contract on Home even inside the centered page stack', async () => {
    // This protects the page-level regression that started the bug: Home uses
    // a centered stack, but the shared search bar should still keep Stocks width.
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );

    const shell = screen.getByTestId('stock-search-results-shell');
    expect(shell.getAttribute('data-layout-contract')).toBe('shared-page-width');

    await waitFor(() => {
      expect(screen.queryByText('Loading investment category cards...')).toBeNull();
    });
  });
});
