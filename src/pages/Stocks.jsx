import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import SharePriceDashboard from '../components/SharePriceDashboard';
import StockSearchResults from '../components/StockSearchResults';
import useStockSearch from '../hooks/useStockSearch';
import {
  fetchWatchlistDashboardBootstraps,
  refreshWatchlistDashboardBootstrap,
} from '../services/watchlistDashboardApi';

function ProgressiveDashboardCard({
  dashboardCard,
  isFocusedMetricsMode,
  onMetricsVisibilityChange,
  onRemove,
}) {
  const containerRef = React.useRef(null);
  const canObserveViewport = typeof IntersectionObserver === 'function';
  const [isActivated, setIsActivated] = useState(() => !canObserveViewport);

  useEffect(() => {
    // This card can derive "activate immediately" during render when the
    // browser has no IntersectionObserver. The effect is only for wiring the
    // viewport subscription, not for repairing user-visible state after render.
    if (isActivated || !canObserveViewport) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const matchingEntry = entries.find((entry) => entry.target === containerRef.current);

        if (!matchingEntry?.isIntersecting) {
          return;
        }

        setIsActivated(true);
        observer.disconnect();
      },
      {
        rootMargin: '600px 0px',
      },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [canObserveViewport, isActivated]);

  return (
    <Box ref={containerRef} sx={{ width: '100%' }}>
      {isActivated ? (
        <SharePriceDashboard
          key={dashboardCard.identifier}
          identifier={dashboardCard.identifier}
          name={dashboardCard.companyName}
          initialDashboardData={dashboardCard}
          isRemovable={dashboardCard.isUserAdded}
          isFocusedMetricsMode={isFocusedMetricsMode}
          onMetricsVisibilityChange={onMetricsVisibilityChange}
          onRemove={onRemove}
        />
      ) : (
        <Card
          sx={{
            width: '100%',
            maxWidth: 1200,
            display: 'flex',
            flexDirection: 'column',
            margin: 0,
            borderRadius: 2,
          }}
        >
          <CardContent
            sx={{
              paddingBottom: '16px !important',
              paddingTop: '18px !important',
              px: { xs: 2, sm: 2.5, lg: 3 },
            }}
          >
            <Typography
              gutterBottom
              sx={{
                color: 'text.secondary',
                fontSize: 11,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              Stock
            </Typography>
            <Typography variant="h5" component="div" sx={{ marginBottom: 0, marginTop: 0 }}>
              {dashboardCard.companyName || dashboardCard.identifier}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {dashboardCard.identifier}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
              Preparing chart and metrics...
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

function Stocks() {
  const {
    stocks,
    stocksStatus,
    stocksError,
    addStockFromResult,
    openExistingStock,
    removeStockByIdentifier,
    pendingStockAction,
    clearPendingStockAction,
  } = useStockSearch();
  const [dashboardCards, setDashboardCards] = useState([]);
  const [dashboardCardsStatus, setDashboardCardsStatus] = useState('idle');
  const [dashboardCardsError, setDashboardCardsError] = useState('');
  const [focusedMetricsIdentifier, setFocusedMetricsIdentifier] = useState('');
  const backgroundRefreshStartedRef = useRef(new Set());

  const reconcileFocusedMetricsIdentifier = useCallback((nextDashboardCards) => {
    setFocusedMetricsIdentifier((previousFocusedMetricsIdentifier) => {
      if (!previousFocusedMetricsIdentifier) {
        return previousFocusedMetricsIdentifier;
      }

      return nextDashboardCards.some((stock) => stock.identifier === previousFocusedMetricsIdentifier)
        ? previousFocusedMetricsIdentifier
        : '';
    });
  }, []);

  useEffect(() => {
    if (!pendingStockAction) {
      return undefined;
    }

    const { mode, stock } = pendingStockAction;
    clearPendingStockAction();

    // The page handles both search outcomes in one place: add a missing stock
    // or open an existing one. Keeping that routing together preserves one
    // consistent Home-to-Stocks flow for the user and for beginners reading it.
    const handlePendingStockActionOnStocksPage = async () => {
      if (mode === 'open') {
        await openExistingStock(stock);
        return;
      }

      await addStockFromResult(stock);
    };

    handlePendingStockActionOnStocksPage();

    return undefined;
  }, [addStockFromResult, clearPendingStockAction, openExistingStock, pendingStockAction]);

  const stockIdentifierList = useMemo(() => {
    return stocks
      .map((stock) => String(stock?.identifier || '').trim().toUpperCase())
      .filter(Boolean);
  }, [stocks]);

  useEffect(() => {
    const controller = new AbortController();

    const loadDashboardCards = async () => {
      if (stocksStatus === 'loading' || stocksStatus === 'idle') {
        setDashboardCardsStatus('loading');
        setDashboardCardsError('');
        return;
      }

      if (stocksStatus === 'error') {
        setDashboardCards([]);
        setDashboardCardsStatus('error');
        setDashboardCardsError(stocksError || 'Unable to load watchlist stocks right now.');
        reconcileFocusedMetricsIdentifier([]);
        return;
      }

      if (stockIdentifierList.length === 0) {
        setDashboardCards([]);
        setDashboardCardsStatus('success');
        setDashboardCardsError('');
        reconcileFocusedMetricsIdentifier([]);
        return;
      }

      setDashboardCardsStatus('loading');
      setDashboardCardsError('');

      try {
        // The shared provider only loads the summary payload used by search and
        // button labels. The page then asks the backend for one batched
        // bootstrap payload so the browser avoids one request per card.
        const nextDashboardCards = await fetchWatchlistDashboardBootstraps({
          signal: controller.signal,
          tickers: stockIdentifierList,
        });

        const nextResolvedDashboardCards = nextDashboardCards.map((dashboardCard) => ({
          ...dashboardCard,
          isUserAdded: stocks.some((stock) => stock.identifier === dashboardCard.identifier && stock.isUserAdded),
        }));

        setDashboardCards(nextResolvedDashboardCards);
        reconcileFocusedMetricsIdentifier(nextResolvedDashboardCards);
        setDashboardCardsStatus('success');
      } catch (requestError) {
        if (requestError.name === 'CanceledError') {
          return;
        }

        setDashboardCards([]);
        setDashboardCardsStatus('error');
        setDashboardCardsError(
          requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          'Unable to load dashboard data for your watchlist right now.',
        );
        reconcileFocusedMetricsIdentifier([]);
      }
    };

    loadDashboardCards();

    return () => {
      controller.abort();
    };
  }, [reconcileFocusedMetricsIdentifier, stockIdentifierList, stocks, stocksError, stocksStatus]);

  useEffect(() => {
    const pendingBackgroundRefreshCards = dashboardCards.filter((dashboardCard) => {
      return (
        dashboardCard.needsBackgroundRefresh
        && !backgroundRefreshStartedRef.current.has(dashboardCard.identifier)
      );
    });

    if (!pendingBackgroundRefreshCards.length) {
      return undefined;
    }

    let isCancelled = false;

    const refreshDashboardCardsInBackground = async () => {
      for (const dashboardCard of pendingBackgroundRefreshCards) {
        if (isCancelled) {
          return;
        }

        backgroundRefreshStartedRef.current.add(dashboardCard.identifier);

        try {
          // Legacy stocks still use the existing refresh route, but the page
          // now waits until first paint. That keeps one old card from blocking
          // the rest of the watchlist.
          const refreshedDashboardCard = await refreshWatchlistDashboardBootstrap(dashboardCard.identifier);

          if (!refreshedDashboardCard || isCancelled) {
            continue;
          }

          setDashboardCards((previousDashboardCards) => {
            return previousDashboardCards.map((existingDashboardCard) => {
              if (existingDashboardCard.identifier !== refreshedDashboardCard.identifier) {
                return existingDashboardCard;
              }

              return {
                ...refreshedDashboardCard,
                isUserAdded: existingDashboardCard.isUserAdded,
              };
            });
          });
        } catch {
          // Background refresh is best-effort. The current card stays visible,
          // so one slow legacy refresh does not block the rest of the page.
        }
      }
    };

    refreshDashboardCardsInBackground();

    return () => {
      isCancelled = true;
    };
  }, [dashboardCards]);

  const handleMetricsVisibilityChange = useCallback((identifier, nextIsOpen) => {
    // The card owns the `ENTER METRICS` / `EXIT METRICS` button, but the page owns which card is
    // currently focused. This state keeps that page-level decision in one place.
    setFocusedMetricsIdentifier(nextIsOpen ? identifier : '');
  }, []);

  const handleRemoveStock = useCallback((identifier) => {
    // Clearing focus in the same state transition is safer than rendering one
    // frame of stale focus and repairing it later in an effect.
    setFocusedMetricsIdentifier((previousFocusedMetricsIdentifier) => {
      return previousFocusedMetricsIdentifier === identifier ? '' : previousFocusedMetricsIdentifier;
    });
    removeStockByIdentifier(identifier);
  }, [removeStockByIdentifier]);

  const visibleStocks = useMemo(() => {
    if (!focusedMetricsIdentifier) {
      return dashboardCards;
    }

    // When one card enters focused metrics mode, the page hides sibling cards
    // so the user can study one chart/table combination at a time.
    return dashboardCards.filter((stock) => stock.identifier === focusedMetricsIdentifier);
  }, [dashboardCards, focusedMetricsIdentifier]);

  return (
    <Box sx={{ px: 2, py: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <StockSearchResults />
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 3,
        }}
      >
        {stocksStatus === 'loading' || dashboardCardsStatus === 'loading' ? (
          <Box
            sx={{
              minHeight: 160,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <CircularProgress />
            <Typography variant="body2" color="text.secondary">
              Loading your watchlist...
            </Typography>
          </Box>
        ) : null}

        {stocksStatus !== 'loading' && (stocksError || dashboardCardsError) ? (
          <Alert severity="warning" sx={{ width: '100%', maxWidth: 960 }}>
            {stocksError || dashboardCardsError}
          </Alert>
        ) : null}

        {stocksStatus === 'success' && dashboardCardsStatus === 'success' && dashboardCards.length === 0 ? (
          <Box sx={{ width: '100%', textAlign: 'center', px: 2, py: 4 }}>
            <Typography variant="body1" color="text.secondary">
              Add a stock from the search results above to start building your watchlist.
            </Typography>
          </Box>
        ) : null}

        {visibleStocks.map((stock) => {
          return (
            <ProgressiveDashboardCard
              key={stock.identifier}
              dashboardCard={stock}
              isFocusedMetricsMode={focusedMetricsIdentifier === stock.identifier}
              onMetricsVisibilityChange={(nextIsOpen) => handleMetricsVisibilityChange(stock.identifier, nextIsOpen)}
              onRemove={() => handleRemoveStock(stock.identifier)}
            />
          );
        })}
      </Box>
    </Box>
  );
}

export default Stocks;
