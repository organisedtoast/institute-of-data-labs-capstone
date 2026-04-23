import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';

import SharePriceDashboard from '../components/SharePriceDashboard';
import StockSearchResults from '../components/StockSearchResults';
import useStockSearch from '../hooks/useStockSearch';

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
  const [focusedMetricsIdentifier, setFocusedMetricsIdentifier] = useState('');

  useEffect(() => {
    if (!pendingStockAction) {
      return undefined;
    }

    const { mode, stock } = pendingStockAction;
    clearPendingStockAction();

    // The search flow can arrive here in two different modes:
    // - add/import a missing stock
    // - open and prioritize a stock that already exists
    //
    // Handling both modes in one place keeps navigation from Home to Stocks
    // consistent for beginners reading the code.
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

  useEffect(() => {
    if (
      stocksStatus === 'success'
      && focusedMetricsIdentifier
      && !stocks.some((stock) => stock.identifier === focusedMetricsIdentifier)
    ) {
      // Focus mode is a page concern because the page is the only place that
      // knows about the sibling cards sitting beside the selected stock. If the
      // focused stock disappears from the watchlist, we clear that page-level
      // focus so the screen cannot get stuck pointing at a missing card.
      setFocusedMetricsIdentifier('');
    }
  }, [focusedMetricsIdentifier, stocks, stocksStatus]);

  const handleMetricsVisibilityChange = useCallback((identifier, nextIsOpen) => {
    // `SHOW METRICS` and `HIDE METRICS` still live on the stock card itself,
    // but the page owns the "which card is the one in focus?" decision.
    // That lets the card stay reusable while the page hides sibling cards.
    setFocusedMetricsIdentifier(nextIsOpen ? identifier : '');
  }, []);

  const visibleStocks = useMemo(() => {
    if (!focusedMetricsIdentifier) {
      return stocks;
    }

    // When one stock enters focused metrics mode, we intentionally hide the
    // sibling cards so the learner can study one chart/table combination at a time.
    return stocks.filter((stock) => stock.identifier === focusedMetricsIdentifier);
  }, [focusedMetricsIdentifier, stocks]);

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
        {stocksStatus === 'loading' ? (
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

        {stocksStatus !== 'loading' && stocksError ? (
          <Alert severity="warning" sx={{ width: '100%', maxWidth: 960 }}>
            {stocksError}
          </Alert>
        ) : null}

        {stocksStatus === 'success' && stocks.length === 0 ? (
          <Box sx={{ width: '100%', textAlign: 'center', px: 2, py: 4 }}>
            <Typography variant="body1" color="text.secondary">
              Add a stock from the search results above to start building your watchlist.
            </Typography>
          </Box>
        ) : null}

        {visibleStocks.map((stock) => {
          return (
            <SharePriceDashboard
              key={stock.identifier}
              identifier={stock.identifier}
              name={stock.name}
              isRemovable={stock.isUserAdded}
              isFocusedMetricsMode={focusedMetricsIdentifier === stock.identifier}
              onMetricsVisibilityChange={(nextIsOpen) => handleMetricsVisibilityChange(stock.identifier, nextIsOpen)}
              onRemove={() => removeStockByIdentifier(stock.identifier)}
            />
          );
        })}
      </Box>
    </Box>
  );
}

export default Stocks;
