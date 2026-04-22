import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useEffect } from 'react';

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

        {stocks.map((stock) => {
          return (
            <SharePriceDashboard
              key={stock.identifier}
              identifier={stock.identifier}
              name={stock.name}
              isRemovable={stock.isUserAdded}
              onRemove={() => removeStockByIdentifier(stock.identifier)}
            />
          );
        })}
      </Box>
    </Box>
  );
}

export default Stocks;
