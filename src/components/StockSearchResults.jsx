import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useLocation, useNavigate } from 'react-router-dom';

import useStockSearch from '../hooks/useStockSearch';

// This component shows the shared search results UI on any page that needs it.
// We keep it in one place so Home and Stocks stay consistent without duplicating markup.
export default function StockSearchResults() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    searchResults,
    searchStatus,
    searchError,
    isStockInWatchlist,
    addStockFromResult,
    openExistingStock,
    clearSearchFeedback,
    queuePendingStockToAdd,
    queuePendingStockToOpenExisting,
  } = useStockSearch();

  const handleStockAction = async (selectedStock) => {
    const stockAlreadyExists = isStockInWatchlist(selectedStock?.identifier);

    // The button text is driven by the loaded watchlist state:
    // - `ADD STOCK` means this page does not currently know about the ticker
    // - `SEE STOCK` means the ticker is already in the watchlist we loaded earlier
    //
    // We intentionally keep the click paths separate so "open existing stock"
    // never looks like "import a missing stock" in the code.
    if (location.pathname === '/stocks') {
      if (stockAlreadyExists) {
        await openExistingStock(selectedStock);
        return;
      }

      await addStockFromResult(selectedStock);
      return;
    }

    // When the user is on Home, we store the intended action before navigating.
    // The Stocks page will consume that pending action after navigation so the
    // user gets one smooth "search here, view there" flow.
    if (stockAlreadyExists) {
      queuePendingStockToOpenExisting(selectedStock);
      navigate('/stocks');
      return;
    }

    queuePendingStockToAdd(selectedStock);
    navigate('/stocks');
  };

  return (
    <Card sx={{ maxWidth: 1200, width: '100%', mx: 'auto', mb: 3, borderRadius: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" component="h1">
              Search results
            </Typography>
          </Box>

          {searchError ? (
            <Alert severity={searchStatus === 'success' ? 'info' : 'warning'}>
              {searchError}
            </Alert>
          ) : null}

          {searchStatus === 'loading' ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                Working on your stock search...
              </Typography>
            </Box>
          ) : null}

          {searchResults.length > 0 ? (
            <Stack spacing={1}>
              {searchResults.map((stock) => {
                const stockAlreadyExists = isStockInWatchlist(stock?.identifier);
                const actionLabel = stockAlreadyExists ? 'SEE STOCK' : 'ADD STOCK';
                const actionButtonSx = stockAlreadyExists
                  ? {
                      backgroundColor: '#1b5e20',
                      '&:hover': {
                        backgroundColor: '#154a19',
                      },
                    }
                  : {};

                return (
                  <Box
                    key={stock.identifier}
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'stretch', sm: 'center' },
                      justifyContent: 'space-between',
                      gap: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      p: 2,
                      backgroundColor: 'background.paper',
                    }}
                  >
                    <Box
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: { xs: 'center', sm: 'left' },
                      }}
                    >
                      <Typography variant="subtitle1">{stock.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {stock.identifier}
                      </Typography>
                    </Box>

                    <Button
                      variant="contained"
                      sx={{
                        // On small screens we always place the button underneath the text and center it.
                        // This avoids the previous "sometimes right, sometimes left" movement that happened
                        // when flex-wrap made a different decision for each card based on text length.
                        //
                        // We also keep one shared button width for both actions so
                        // `SEE STOCK` and `ADD STOCK` occupy the same visual space.
                        alignSelf: { xs: 'center', sm: 'center' },
                        width: { xs: '100%', sm: 180 },
                        maxWidth: { xs: 220, sm: 180 },
                        ...actionButtonSx,
                      }}
                      onClick={() => handleStockAction(stock)}
                    >
                      {actionLabel}
                    </Button>
                  </Box>
                );
              })}

              <Box>
                <Button variant="text" onClick={clearSearchFeedback}>
                  Clear search results
                </Button>
              </Box>
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
