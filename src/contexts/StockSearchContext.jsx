import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import StockSearchContext from './stockSearchContext';

const DEFAULT_IMPORT_CATEGORY = 'Firm Specific Turnaround';
const STOCK_SEARCH_FALLBACK_MESSAGE = 'Search is unavailable right now. Please try again in a moment.';
const PENDING_STOCK_ACTION_ADD = 'add';
const PENDING_STOCK_ACTION_OPEN = 'open';

function normalizeTickerIdentifier(value) {
  return String(value || '').trim().toUpperCase();
}

function isDevelopmentEnvironment() {
  return Boolean(import.meta.env?.DEV);
}

function logRequestFailure(label, requestError) {
  if (!isDevelopmentEnvironment()) {
    return;
  }

  console.error(`[${label}]`, {
    message: requestError?.message || '',
    code: requestError?.code || '',
    status: requestError?.response?.status,
    data: requestError?.response?.data,
  });
}

function resolveSearchFailureMessage(requestError) {
  const backendMessage = requestError.response?.data?.message || requestError.response?.data?.error;
  if (backendMessage) {
    return backendMessage;
  }

  if (requestError.code === 'ECONNABORTED') {
    return 'Search timed out before the backend replied. Please try again in a moment.';
  }

  if (
    requestError.code === 'ERR_NETWORK' ||
    requestError.code === 'ENOTFOUND' ||
    requestError.code === 'ECONNREFUSED' ||
    requestError.message === 'Network Error'
  ) {
    return 'The search service could not be reached. Make sure the backend API is running on http://localhost:3000.';
  }

  return STOCK_SEARCH_FALLBACK_MESSAGE;
}

function getApiErrorMessage(requestError, fallbackMessage) {
  return (
    requestError.response?.data?.message ||
    requestError.response?.data?.error ||
    fallbackMessage
  );
}

function mapWatchlistStockToCard(stockDocument) {
  const identifier = normalizeTickerIdentifier(
    stockDocument?.identifier || stockDocument?.tickerSymbol,
  );

  if (!identifier) {
    return null;
  }

  const rawName =
    stockDocument?.name ||
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
  const [pendingStockAction, setPendingStockAction] = useState(null);

  const loadStocks = useCallback(async (options = {}) => {
    const { prioritizeTicker = '', showLoading = true } = options;

    if (showLoading) {
      setStocksStatus('loading');
    }

    setStocksError('');

    try {
      const response = await axios.get('/api/watchlist/summary');
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

  // We intentionally use the lightweight watchlist summary already loaded into
  // frontend state as the source of truth for the `SEE STOCK` label. That keeps
  // the shared search flow fast even though another tab could briefly make it stale.
  const watchlistTickerSet = useMemo(() => {
    return new Set(
      stocks
        .map((stock) => normalizeTickerIdentifier(stock?.identifier))
        .filter(Boolean),
    );
  }, [stocks]);

  const isStockInWatchlist = useCallback((identifierToCheck) => {
    const normalizedIdentifier = normalizeTickerIdentifier(identifierToCheck);
    return normalizedIdentifier !== '' && watchlistTickerSet.has(normalizedIdentifier);
  }, [watchlistTickerSet]);

  const queuePendingStockToAdd = useCallback((selectedStock) => {
    setPendingStockAction({
      mode: PENDING_STOCK_ACTION_ADD,
      stock: selectedStock,
    });
  }, []);

  // Opening an existing stock is a different user action from importing one.
  // We keep a separate mode here so the Stocks page can "show what already exists"
  // without accidentally going through the import-or-add code path.
  const queuePendingStockToOpenExisting = useCallback((selectedStock) => {
    setPendingStockAction({
      mode: PENDING_STOCK_ACTION_OPEN,
      stock: selectedStock,
    });
  }, []);

  const clearPendingStockAction = useCallback(() => {
    setPendingStockAction(null);
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
      logRequestFailure('stock-search', requestError);
      setSearchError(resolveSearchFailureMessage(requestError));
      return false;
    }
  }, [searchText]);

  const addStockFromResult = useCallback(async (selectedStock) => {
    const normalizedIdentifier = normalizeTickerIdentifier(selectedStock?.identifier);

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

  const openExistingStock = useCallback(async (selectedStock) => {
    const normalizedIdentifier = normalizeTickerIdentifier(selectedStock?.identifier);

    if (!normalizedIdentifier) {
      setSearchStatus('error');
      setSearchError('The selected stock was missing a ticker symbol.');
      return false;
    }

    // This helper never imports. Its only job is to refresh/prioritize the card
    // that already exists in the loaded watchlist so the user can jump straight to it.
    setSearchStatus('loading');
    setSearchError('');

    const nextStocks = await loadStocks({
      prioritizeTicker: normalizedIdentifier,
      showLoading: false,
    });

    if (!Array.isArray(nextStocks)) {
      setSearchStatus('error');
      setSearchError(`Unable to open ${normalizedIdentifier} right now.`);
      return false;
    }

    setSearchText('');
    setSearchResults([]);
    setSearchStatus('success');
    setSearchError('');
    return true;
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
      pendingStockAction,
      isStockInWatchlist,
      setSearchText,
      runStockSearch,
      addStockFromResult,
      openExistingStock,
      removeStockByIdentifier,
      clearSearchFeedback,
      queuePendingStockToAdd,
      queuePendingStockToOpenExisting,
      clearPendingStockAction,
    };
  }, [
    addStockFromResult,
    clearPendingStockAction,
    clearSearchFeedback,
    isStockInWatchlist,
    openExistingStock,
    pendingStockAction,
    queuePendingStockToAdd,
    queuePendingStockToOpenExisting,
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
