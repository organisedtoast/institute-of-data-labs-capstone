// Home page component - displays the main landing page
// This component is rendered when the user navigates to "/" route

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

// Import the SectorCardComponent to display on the home page
import StockSearchResults from '../components/StockSearchResults';
import SectorCardComponent from '../components/SectorCardComponent'

function Home() {
  return (
    <Box sx={{ px: 2, py: 3 }}>
      <Stack spacing={3} alignItems="center">
        {/* The search results are shared across pages, so Home can display them too.
            That lets the user search from the landing page without immediately leaving it. */}
        <StockSearchResults />

        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          {/* Render the SectorCardComponent which contains a chart */}
          <SectorCardComponent />
        </Box>
      </Stack>
    </Box>
  );
}

// Export the Home component so it can be imported in other files (like App.jsx)
export default Home;
