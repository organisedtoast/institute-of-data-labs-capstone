import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAllInvestmentCategoryCards,
  queryInvestmentCategoryCard,
  updateInvestmentCategoryConstituent,
} from '../investmentCategoryCardsApi';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('investmentCategoryCardsApi', () => {
  beforeEach(() => {
    axios.post.mockReset();
    axios.patch.mockReset();
  });

  it('loads and normalizes all investment category cards', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        cards: [
          {
            investmentCategory: 'Profitable Hi Growth',
            minAvailableMonth: '2024-01',
            maxAvailableMonth: '2024-03',
            startMonth: '2024-01',
            endMonth: '2024-03',
            series: [
              { date: '2024-01-01', close: 100 },
              { date: '2024-02-01', close: '115' },
            ],
            counts: {
              active: 1,
              userDisabled: 0,
              unavailable: 1,
            },
            constituents: [
              {
                tickerSymbol: 'ALPHA',
                companyName: 'Alpha Corp',
                status: 'active',
                isEnabled: true,
                isToggleable: true,
              },
            ],
          },
        ],
      },
    });

    const cards = await fetchAllInvestmentCategoryCards();

    expect(axios.post).toHaveBeenCalledWith(
      '/api/homepage/investment-category-cards/query',
      {},
      undefined,
    );
    expect(cards).toEqual([
      {
        investmentCategory: 'Profitable Hi Growth',
        minAvailableMonth: '2024-01',
        maxAvailableMonth: '2024-03',
        startMonth: '2024-01',
        endMonth: '2024-03',
        series: [
          { date: '2024-01-01', close: 100 },
          { date: '2024-02-01', close: 115 },
        ],
        counts: {
          active: 1,
          userDisabled: 0,
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
        ],
      },
    ]);
  });

  it('queries one card through the bulk endpoint contract', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        cards: [
          {
            investmentCategory: 'Mature Compounder',
          },
        ],
      },
    });

    const card = await queryInvestmentCategoryCard({
      investmentCategory: 'Mature Compounder',
      startMonth: '2024-01',
      endMonth: '2024-03',
    });

    expect(axios.post).toHaveBeenCalledWith(
      '/api/homepage/investment-category-cards/query',
      {
        cards: [
          {
            investmentCategory: 'Mature Compounder',
            startMonth: '2024-01',
            endMonth: '2024-03',
          },
        ],
      },
      undefined,
    );
    expect(card.investmentCategory).toBe('Mature Compounder');
  });

  it('sends the current range when a constituent is toggled', async () => {
    axios.patch.mockResolvedValueOnce({
      data: {
        investmentCategory: 'Profitable Hi Growth',
      },
    });

    await updateInvestmentCategoryConstituent(
      'Profitable Hi Growth',
      'alpha',
      false,
      {
        startMonth: '2024-01',
        endMonth: '2024-03',
      },
    );

    expect(axios.patch).toHaveBeenCalledWith(
      '/api/homepage/investment-category-cards/Profitable%20Hi%20Growth/constituents/ALPHA',
      {
        isEnabled: false,
        startMonth: '2024-01',
        endMonth: '2024-03',
      },
      undefined,
    );
  });
});
