// Home page component - displays the main landing page
// This component is rendered when the user navigates to "/" route

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';

// Import the SectorCardComponent to display on the home page
import StockSearchResults from '../components/StockSearchResults';
import SectorCardComponent from '../components/SectorCardComponent'
import { fetchAllInvestmentCategoryCards } from '../services/investmentCategoryCardsApi';

function Home() {
  const [cards, setCards] = useState([]);
  const [cardsStatus, setCardsStatus] = useState('loading');
  const [cardsError, setCardsError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const loadInvestmentCategoryCards = async () => {
      setCardsStatus('loading');
      setCardsError('');

      try {
        const nextCards = await fetchAllInvestmentCategoryCards({
          signal: controller.signal,
        });

        setCards(nextCards);
        setCardsStatus('success');
      } catch (requestError) {
        if (requestError.name === 'CanceledError') {
          return;
        }

        setCards([]);
        setCardsStatus('error');
        setCardsError(
          requestError.response?.data?.error
            || requestError.response?.data?.message
            || 'Unable to load investment category cards right now.',
        );
      }
    };

    loadInvestmentCategoryCards();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <Box sx={{ px: 2, py: 3 }}>
      <Stack spacing={3} alignItems="center">
        {/* The search results are shared across pages, so Home can display them too.
            That lets the user search from the landing page without immediately leaving it. */}
        <StockSearchResults />

        {cardsStatus === 'loading' ? (
          <Box
            sx={{
              minHeight: 220,
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
              Loading investment category cards...
            </Typography>
          </Box>
        ) : null}

        {cardsStatus !== 'loading' && cardsError ? (
          <Alert severity="warning" sx={{ width: '100%', maxWidth: 1120 }}>
            {cardsError}
          </Alert>
        ) : null}

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: { xs: 2.5, md: 3 },
            width: '100%',
            maxWidth: { xs: '100%', xl: 1760 },
            mx: 'auto',
            alignItems: 'stretch',
          }}
        >
          {cards.map((cardData) => (
            <SectorCardComponent
              key={cardData.investmentCategory}
              initialCardData={cardData}
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}

// Export the Home component so it can be imported in other files (like App.jsx)
export default Home;
