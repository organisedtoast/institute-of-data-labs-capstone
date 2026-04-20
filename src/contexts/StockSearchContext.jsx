import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import StockSearchContext from './stockSearchContext';

const DEFAULT_IMPORT_CATEGORY = 'Firm Specific Turnaround';

function getApiErrorMessage(requestError, fallbackMessage) {
  return (
    requestError.response?.data?.message ||
    requestError.response?.data?.error ||
    fallbackMessage
  );
}

function mapWatchlistStockToCard(stockDocument) {
  const identifier = String(stockDocument?.tickerSymbol || '').trim().toUpperCase();

  if (!identifier) {
    return null;
  }

  const rawName =
    stockDocument?.companyName?.effectiveValue ||
    stockDocument?.companyName?.userValue ||
    stockDocument?.companyName?.roicValue ||
    identifier;
  const resolvedName = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : identifier;

  return {
    identifier,
    name: resolvedName,
    isUserAdded: true,
  };
}

function prioritizeStockCards(stockCards, prioritizedIdentifier) {
  if (!prioritizedIdentifier) {
    return stockCards;
  }

  const normalizedIdentifier = prioritizedIdentifier.trim().toUpperCase();
  const prioritizedCards = [];
  const remainingCards = [];

  stockCards.forEach((stockCard) => {
    if (stockCard.identifier === normalizedIdentifier) {
      prioritizedCards.push(stockCard);
      return;
    }

    remainingCards.push(stockCard);
  });

  return [...prioritizedCards, ...remainingCards];
}

export function StockSearchProvider({ children }) {
  const [stocks, setStocks] = useState([]);
  const [stocksStatus, setStocksStatus] = useState('idle');
  const [stocksError, setStocksError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle');
  const [searchError, setSearchError] = useState('');
  const [pendingStockToAdd, setPendingStockToAdd] = useState(null);

  const loadStocks = useCallback(async (options = {}) => {
    const { prioritizeTicker = '', showLoading = true } = options;

    if (showLoading) {
      setStocksStatus('loading');
    }

    setStocksError('');

    try {
      const response = await axios.get('/api/watchlist');
      const stockCards = Array.isArray(response.data)
        ? response.data.map(mapWatchlistStockToCard).filter(Boolean)
        : [];
      const nextStocks = prioritizeStockCards(stockCards, prioritizeTicker);

      setStocks(nextStocks);
      setStocksStatus('success');
      return nextStocks;
    } catch (requestError) {
      setStocks([]);
      setStocksStatus('error');
      setStocksError(
        getApiErrorMessage(requestError, 'Unable to load watchlist stocks right now.'),
      );
      return null;
    }
  }, []);

  useEffect(() => {
    loadStocks();
  }, [loadStocks]);

  const clearSearchFeedback = useCallback(() => {
    setSearchResults([]);
    setSearchStatus('idle');
    setSearchError('');
  }, []);

  const queuePendingStockToAdd = useCallback((selectedStock) => {
    setPendingStockToAdd(selectedStock);
  }, []);

  const clearPendingStockToAdd = useCallback(() => {
    setPendingStockToAdd(null);
  }, []);

  const runStockSearch = useCallback(async () => {
    const normalizedQuery = searchText.trim();

    if (!normalizedQuery) {
      setSearchResults([]);
      setSearchStatus('error');
      setSearchError('Please type a ticker or company name before searching.');
      return false;
    }

    setSearchStatus('loading');
    setSearchError('');

    try {
      const response = await axios.get('/api/stocks/search', {
        params: {
          q: normalizedQuery,
        },
      });

      const nextResults = Array.isArray(response.data?.results) ? response.data.results : [];

      setSearchResults(nextResults);
      setSearchStatus('success');

      if (nextResults.length === 0) {
        setSearchError('No matching stocks were found. Try another ticker or company name.');
      }

      return true;
    } catch (requestError) {
      setSearchResults([]);
      setSearchStatus('error');
      setSearchError(
        getApiErrorMessage(
          requestError,
          'Search is unavailable right now. Please try again in a moment.',
        ),
      );
      return false;
    }
  }, [searchText]);

  const addStockFromResult = useCallback(async (selectedStock) => {
    const normalizedIdentifier = selectedStock?.identifier?.trim().toUpperCase();

    if (!normalizedIdentifier) {
      setSearchStatus('error');
      setSearchError('The selected stock was missing a ticker symbol.');
      return false;
    }

    setSearchStatus('loading');
    setSearchError('');

    try {
      try {
        await axios.get(`/api/watchlist/${normalizedIdentifier}`);
      } catch (requestError) {
        if (requestError.response?.status !== 404) {
          throw requestError;
        }

        await axios.post('/api/watchlist/import', {
          tickerSymbol: normalizedIdentifier,
          investmentCategory: DEFAULT_IMPORT_CATEGORY,
        });
      }

      const nextStocks = await loadStocks({
        prioritizeTicker: normalizedIdentifier,
        showLoading: false,
      });

      if (!Array.isArray(nextStocks)) {
        return false;
      }

      setSearchText('');
      setSearchResults([]);
      setSearchStatus('success');
      setSearchError('');
      return true;
    } catch (requestError) {
      setSearchStatus('error');
      setSearchError(
        getApiErrorMessage(
          requestError,
          `Unable to add ${normalizedIdentifier} to the watchlist right now.`,
        ),
      );
      return false;
    }
  }, [loadStocks]);

  const removeStockByIdentifier = useCallback(async (identifierToRemove) => {
    const normalizedIdentifier = String(identifierToRemove || '').trim().toUpperCase();

    if (!normalizedIdentifier) {
      return false;
    }

    setStocksError('');

    try {
      await axios.delete(`/api/watchlist/${normalizedIdentifier}`);
      const nextStocks = await loadStocks({ showLoading: false });
      return Array.isArray(nextStocks);
    } catch (requestError) {
      setStocksError(
        getApiErrorMessage(
          requestError,
          `Unable to remove ${normalizedIdentifier} from the watchlist right now.`,
        ),
      );
      return false;
    }
  }, [loadStocks]);

  const contextValue = useMemo(() => {
    return {
      stocks,
      stocksStatus,
      stocksError,
      searchText,
      searchResults,
      searchStatus,
      searchError,
      pendingStockToAdd,
      setSearchText,
      runStockSearch,
      addStockFromResult,
      removeStockByIdentifier,
      clearSearchFeedback,
      queuePendingStockToAdd,
      clearPendingStockToAdd,
    };
  }, [
    addStockFromResult,
    clearPendingStockToAdd,
    clearSearchFeedback,
    pendingStockToAdd,
    queuePendingStockToAdd,
    removeStockByIdentifier,
    runStockSearch,
    searchError,
    searchResults,
    searchStatus,
    searchText,
    stocks,
    stocksError,
    stocksStatus,
  ]);

  return (
    <StockSearchContext.Provider value={contextValue}>
      {children}
    </StockSearchContext.Provider>
  );
}

export default StockSearchProvider;
