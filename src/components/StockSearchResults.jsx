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
    addStockFromResult,
    clearSearchFeedback,
    queuePendingStockToAdd,
  } = useStockSearch();

  const handleAddStockCard = async (selectedStock) => {
    // When the user is already on the Stocks page, we can add immediately.
    // That page already knows how to display the stock cards and charts directly below.
    if (location.pathname === '/stocks') {
      await addStockFromResult(selectedStock);
      return;
    }

    // When the user is on Home, we store the selected stock first and then navigate.
    // The Stocks page will notice this pending item and perform the actual add there,
    // which keeps the "search on Home, view chart on Stocks" experience reliable.
    queuePendingStockToAdd(selectedStock);
    navigate('/stocks');
  };

  return (
    <Card sx={{ maxWidth: 960, mx: 'auto', mb: 3 }}>
      <CardContent>
        <Stack spacing={2}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" component="h1">
              Search results
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use the navbar search to find a stock by ticker or company name, then choose one result to add it as a new stock card.
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
                        alignSelf: { xs: 'center', sm: 'center' },
                        width: { xs: '100%', sm: 'auto' },
                        maxWidth: { xs: 220, sm: 'none' },
                        backgroundColor: '#4a148c',
                        '&:hover': {
                          backgroundColor: '#6a1b9a',
                        },
                      }}
                      onClick={() => handleAddStockCard(stock)}
                    >
                      ADD STOCK
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
