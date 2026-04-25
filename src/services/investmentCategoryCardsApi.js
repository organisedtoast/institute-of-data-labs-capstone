import axios from 'axios';
import normalizeTickerIdentifier from '../utils/normalizeTickerIdentifier';

function normalizeCard(card) {
  return {
    investmentCategory:
      typeof card?.investmentCategory === 'string' ? card.investmentCategory.trim() : '',
    minAvailableMonth:
      typeof card?.minAvailableMonth === 'string' ? card.minAvailableMonth : '',
    maxAvailableMonth:
      typeof card?.maxAvailableMonth === 'string' ? card.maxAvailableMonth : '',
    startMonth:
      typeof card?.startMonth === 'string' ? card.startMonth : '',
    endMonth:
      typeof card?.endMonth === 'string' ? card.endMonth : '',
    isCanonicalInitialRange: card?.isCanonicalInitialRange === true,
    series: Array.isArray(card?.series)
      ? card.series
          .map((point) => ({
            date: typeof point?.date === 'string' ? point.date : '',
            close: Number(point?.close),
          }))
          .filter((point) => point.date && Number.isFinite(point.close))
      : [],
    counts: {
      active: Number(card?.counts?.active) || 0,
      userDisabled: Number(card?.counts?.userDisabled) || 0,
      unavailable: Number(card?.counts?.unavailable) || 0,
    },
    emptyStateMessage:
      typeof card?.emptyStateMessage === 'string' ? card.emptyStateMessage : '',
    constituents: Array.isArray(card?.constituents)
      ? card.constituents.map((constituent) => ({
          tickerSymbol:
            typeof constituent?.tickerSymbol === 'string' ? constituent.tickerSymbol : '',
          companyName:
            typeof constituent?.companyName === 'string' ? constituent.companyName : '',
          status:
            typeof constituent?.status === 'string' ? constituent.status : 'unavailable',
          isEnabled: constituent?.isEnabled !== false,
          isToggleable: constituent?.isToggleable !== false,
        }))
      : [],
  };
}

function buildRequestOptions(options = {}) {
  return options.signal ? { signal: options.signal } : undefined;
}

export async function fetchAllInvestmentCategoryCards(options = {}) {
  const response = await axios.post(
    '/api/homepage/investment-category-cards/query',
    {},
    buildRequestOptions(options),
  );

  return Array.isArray(response.data?.cards)
    ? response.data.cards.map(normalizeCard)
    : [];
}

export async function queryInvestmentCategoryCard(cardRequest, options = {}) {
  const response = await axios.post(
    '/api/homepage/investment-category-cards/query',
    {
      cards: [cardRequest],
    },
    buildRequestOptions(options),
  );

  return normalizeCard(response.data?.cards?.[0] || {});
}

export async function updateInvestmentCategoryConstituent(
  investmentCategory,
  tickerSymbol,
  isEnabled,
  cardRange,
  options = {},
) {
  const normalizedTicker = normalizeTickerIdentifier(tickerSymbol);
  const response = await axios.patch(
    `/api/homepage/investment-category-cards/${encodeURIComponent(investmentCategory)}/constituents/${normalizedTicker}`,
    {
      isEnabled,
      startMonth: cardRange?.startMonth || '',
      endMonth: cardRange?.endMonth || '',
    },
    buildRequestOptions(options),
  );

  return normalizeCard(response.data || {});
}
