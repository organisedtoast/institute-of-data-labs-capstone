// AppRoutes component - manages all routing for the application
// This file centralizes all route definitions in one place

// Import React helpers used for lazy loading.
// `lazy()` tells React to load a component only when it is first needed.
// `Suspense` lets us show a temporary fallback UI while that lazy-loaded file is downloading.
import { lazy, Suspense } from 'react';

// Import Routes and Route from react-router-dom for setting up routing
import { Routes, Route } from 'react-router-dom';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

// Lazy-load page components instead of importing them eagerly at the top of the file.
// This helps reduce the size of the very first JavaScript bundle the browser downloads.
// The Home page code will only be downloaded when the "/" route is visited.
const Home = lazy(() => import('../pages/Home'));

// The Stocks page and its chart-heavy dependencies will only be downloaded
// when the user navigates to "/stocks".
const Stocks = lazy(() => import('../pages/Stocks'));

// AppRoutes is a separate component that holds all route definitions
// This keeps the routing logic organized and separate from the main App component
export default function AppRoutes() {
  return (
    // Suspense wraps the route content so React can pause while a lazy-loaded page arrives.
    // The fallback UI below is only shown during that loading moment.
    <Suspense
      fallback={
        <Box
          sx={{
            minHeight: 240,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            px: 2,
            py: 3,
          }}
        >
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">
            Loading page...
          </Typography>
        </Box>
      }
    >
      {/* Routes is a container that holds all Route components */}
      <Routes>
        {/*
          Each Route defines a mapping between a URL path and a component:
          - path: the URL pattern to match (e.g., "/" for home page)
          - element: the React component to render when the path matches
        */}

        {/* Home page route - renders Home component when URL is "/" */}
        <Route path="/" element={<Home />} />

        {/* Stocks page route - renders Stocks component when URL is "/stocks" */}
        <Route path="/stocks" element={<Stocks />} />
      </Routes>
    </Suspense>
  );
}
