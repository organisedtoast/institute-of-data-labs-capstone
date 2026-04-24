import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SectorCardComponent from '../SectorCardComponent';
import { ENHANCED_INTERNAL_SCROLLBAR_SIZE, enhancedInternalScrollbarSx } from '../sharedScrollbarStyles.js';

const mockSectorChart = vi.fn();

vi.mock('../SectorChart', () => ({
  default: function MockSectorChart(props) {
    mockSectorChart(props);
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
    mockSectorChart.mockClear();
  });

  it('opens an inline constituents list with a dedicated scroll container, status chips, and preserved order', async () => {
    queryInvestmentCategoryCard.mockResolvedValue(initialCardData);

    const { container } = render(<SectorCardComponent initialCardData={initialCardData} />);

    fireEvent.click(screen.getByRole('button', { name: 'CONSTITUENTS' }));

    expect(await screen.findByText('Alpha Corp')).toBeTruthy();
    expect(screen.getByTestId('sector-card-constituents-list')).toBeTruthy();
    expect(screen.getByTestId('sector-card-constituents-list').getAttribute('data-scrollbar-style')).toBe('enhanced');
    expect(
      enhancedInternalScrollbarSx['@supports selector(::-webkit-scrollbar)']['&::-webkit-scrollbar'].width,
    ).toBe(ENHANCED_INTERNAL_SCROLLBAR_SIZE);
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

  // The constituents redesign intentionally replaces the old tall 3-tier row
  // with a denser "identity + compact controls" structure. These tests protect
  // that new compact contract without changing the user-facing meanings of the
  // identity, status, and action regions.
  it('groups the status chip and action into one compact controls region', async () => {
    queryInvestmentCategoryCard.mockResolvedValue(initialCardData);

    render(<SectorCardComponent initialCardData={initialCardData} />);

    fireEvent.click(screen.getByRole('button', { name: 'CONSTITUENTS' }));

    const alphaRow = (await screen.findByText('ALPHA')).closest('[data-testid="sector-card-constituent-row"]');

    expect(alphaRow).toBeTruthy();
    const controlsRegion = within(alphaRow).getByTestId('sector-card-constituent-controls');

    // A compact controls wrapper proves the status chip and action button are
    // now treated as one tight group instead of two separate tall rows.
    expect(within(controlsRegion).getByTestId('sector-card-constituent-status-chip')).toBeTruthy();
    expect(within(controlsRegion).getByTestId('sector-card-constituent-action').textContent).toBe('Disable');
    expect(alphaRow.getAttribute('data-compact-layout')).toBe('true');
  });

  it('keeps long company names inside the identity region while preserving the compact controls', async () => {
    queryInvestmentCategoryCard.mockResolvedValue(initialCardData);

    render(<SectorCardComponent initialCardData={initialCardData} />);

    fireEvent.click(screen.getByRole('button', { name: 'CONSTITUENTS' }));

    const betaRow = (await screen.findByText('BETA')).closest('[data-testid="sector-card-constituent-row"]');

    expect(betaRow).toBeTruthy();

    const identityRegion = within(betaRow).getByTestId('sector-card-constituent-identity');
    const controlsRegion = within(betaRow).getByTestId('sector-card-constituent-controls');

    // Beta has the longest sample name in this fixture. If the compact layout
    // keeps that long label inside the identity region while the controls still
    // render beside/below it as one grouped block, we know the row is no longer
    // wasting space on a permanently oversized action column.
    expect(identityRegion.textContent).toContain('Beta Corp with a Longer Name');
    expect(within(controlsRegion).getByTestId('sector-card-constituent-status').textContent).toContain('Disabled');
    expect(within(controlsRegion).getByTestId('sector-card-constituent-action-region').textContent).toContain('Enable');
  });

  it('anchors the default 5Y homepage view to the latest available month instead of a stale incoming range', async () => {
    const staleCardData = {
      ...initialCardData,
      minAvailableMonth: '2020-01',
      maxAvailableMonth: '2026-04',
      startMonth: '2019-04',
      endMonth: '2024-04',
      series: [
        { date: '2024-04-01', close: 100 },
        { date: '2025-04-01', close: 115 },
        { date: '2026-04-01', close: 130 },
      ],
    };

    render(<SectorCardComponent initialCardData={staleCardData} />);

    const latestChartProps = mockSectorChart.mock.calls.at(-1)?.[0];

    expect(latestChartProps.activePreset).toBe('5Y');
    expect(latestChartProps.startDate).toBe('2021-04');
    expect(latestChartProps.endDate).toBe('2026-04');
  });

  it('re-queries stale homepage payloads using the latest trailing 5Y range', async () => {
    vi.useFakeTimers();

    try {
      const staleCardData = {
        ...initialCardData,
        minAvailableMonth: '2020-01',
        maxAvailableMonth: '2026-04',
        startMonth: '2019-04',
        endMonth: '2024-04',
      };

      queryInvestmentCategoryCard.mockResolvedValue({
        ...staleCardData,
        startMonth: '2021-04',
        endMonth: '2026-04',
      });

      render(<SectorCardComponent initialCardData={staleCardData} />);

      await act(async () => {
        vi.advanceTimersByTime(200);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(queryInvestmentCategoryCard).toHaveBeenCalledWith(
        {
          investmentCategory: 'Profitable Hi Growth',
          startMonth: '2021-04',
          endMonth: '2026-04',
        },
        { signal: expect.any(AbortSignal) },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-query when the homepage payload already matches the latest trailing 5Y range', async () => {
    vi.useFakeTimers();

    try {
      const latestCardData = {
        ...initialCardData,
        minAvailableMonth: '2020-01',
        maxAvailableMonth: '2026-04',
        startMonth: '2021-04',
        endMonth: '2026-04',
      };

      render(<SectorCardComponent initialCardData={latestCardData} />);

      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      expect(queryInvestmentCategoryCard).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
