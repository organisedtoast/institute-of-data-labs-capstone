import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SectorCardComponent from '../SectorCardComponent';

vi.mock('../SectorChart', () => ({
  default: function MockSectorChart() {
    return React.createElement('div', { 'data-testid': 'mock-sector-chart' }, 'chart');
  },
}));

vi.mock('../../services/investmentCategoryCardsApi', () => ({
  queryInvestmentCategoryCard: vi.fn(),
  updateInvestmentCategoryConstituent: vi.fn(),
}));

import {
  queryInvestmentCategoryCard,
  updateInvestmentCategoryConstituent,
} from '../../services/investmentCategoryCardsApi';

const initialCardData = {
  investmentCategory: 'Profitable Hi Growth',
  minAvailableMonth: '2024-01',
  maxAvailableMonth: '2024-03',
  startMonth: '2024-01',
  endMonth: '2024-03',
  series: [{ date: '2024-01-01', close: 100 }],
  counts: {
    active: 1,
    userDisabled: 1,
    unavailable: 1,
  },
  emptyStateMessage: '',
  constituents: [
    {
      tickerSymbol: 'ALPHA',
      companyName: 'Alpha Corp',
      status: 'active',
      isEnabled: true,
      isToggleable: true,
    },
    {
      tickerSymbol: 'BETA',
      companyName: 'Beta Corp with a Longer Name',
      status: 'userDisabled',
      isEnabled: false,
      isToggleable: true,
    },
    {
      tickerSymbol: 'GAMMA',
      companyName: 'Gamma Corp',
      status: 'unavailable',
      isEnabled: true,
      isToggleable: true,
    },
  ],
};

describe('SectorCardComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens an inline constituents list with a dedicated scroll container, status chips, and preserved order', async () => {
    queryInvestmentCategoryCard.mockResolvedValue(initialCardData);

    const { container } = render(<SectorCardComponent initialCardData={initialCardData} />);

    fireEvent.click(screen.getByRole('button', { name: 'CONSTITUENTS' }));

    expect(await screen.findByText('Alpha Corp')).toBeTruthy();
    expect(screen.getByTestId('sector-card-constituents-list')).toBeTruthy();
    expect(screen.getAllByTestId('sector-card-constituent-status-chip')).toHaveLength(3);
    expect(screen.getByText('Disabled')).toBeTruthy();
    expect(screen.getByText('Unavailable for this range')).toBeTruthy();

    const flattenedText = container.textContent;
    expect(flattenedText.indexOf('ALPHA')).toBeLessThan(flattenedText.indexOf('BETA'));
    expect(flattenedText.indexOf('BETA')).toBeLessThan(flattenedText.indexOf('GAMMA'));
  });

  it('renders each constituent with stable identity, status, and action regions', async () => {
    queryInvestmentCategoryCard.mockResolvedValue(initialCardData);

    render(<SectorCardComponent initialCardData={initialCardData} />);

    fireEvent.click(screen.getByRole('button', { name: 'CONSTITUENTS' }));

    const constituentRows = await screen.findAllByTestId('sector-card-constituent-row');

    expect(constituentRows).toHaveLength(3);

    const betaRow = screen.getByText('BETA').closest('[data-testid="sector-card-constituent-row"]');

    expect(betaRow).toBeTruthy();
    expect(within(betaRow).getByTestId('sector-card-constituent-identity').textContent).toContain('Beta Corp with a Longer Name');
    expect(within(betaRow).getByTestId('sector-card-constituent-status').textContent).toContain('Disabled');
    expect(within(betaRow).getByTestId('sector-card-constituent-action-region').textContent).toContain('Enable');
  });

  it('lets an unavailable constituent stay toggleable and sends the current range', async () => {
    queryInvestmentCategoryCard.mockResolvedValue(initialCardData);
    updateInvestmentCategoryConstituent.mockResolvedValue({
      ...initialCardData,
      constituents: [
        initialCardData.constituents[0],
        initialCardData.constituents[1],
        {
          ...initialCardData.constituents[2],
          isEnabled: false,
          status: 'userDisabled',
        },
      ],
    });

    render(<SectorCardComponent initialCardData={initialCardData} />);

    fireEvent.click(screen.getByRole('button', { name: 'CONSTITUENTS' }));
    const gammaRow = screen.getByText('GAMMA').closest('[data-testid="sector-card-constituent-row"]');

    expect(gammaRow).toBeTruthy();
    fireEvent.click(within(gammaRow).getByTestId('sector-card-constituent-action'));

    await waitFor(() => {
      expect(updateInvestmentCategoryConstituent).toHaveBeenCalledWith(
        'Profitable Hi Growth',
        'GAMMA',
        false,
        {
          startMonth: '2024-01',
          endMonth: '2024-03',
        },
      );
    });
  });

  it('keeps the row regions in stacked DOM order for the mobile 3-tier layout', async () => {
    queryInvestmentCategoryCard.mockResolvedValue(initialCardData);

    render(<SectorCardComponent initialCardData={initialCardData} />);

    fireEvent.click(screen.getByRole('button', { name: 'CONSTITUENTS' }));

    const alphaRow = (await screen.findByText('ALPHA')).closest('[data-testid="sector-card-constituent-row"]');

    expect(alphaRow).toBeTruthy();
    const identityRegion = within(alphaRow).getByTestId('sector-card-constituent-identity');
    const statusRegion = within(alphaRow).getByTestId('sector-card-constituent-status');
    const actionRegion = within(alphaRow).getByTestId('sector-card-constituent-action-region');

    expect(identityRegion.compareDocumentPosition(statusRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(statusRegion.compareDocumentPosition(actionRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
