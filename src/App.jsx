// Import the NavBar component from the components folder
import NavBar from './components/NavBar'

// Import the AppRoutes component that handles all routing
// This keeps routing logic separate and organized
import AppRoutes from './approutes/AppRoutes'
import { StockSearchProvider } from './contexts/StockSearchContext.jsx'

function App() {
  return (
    // The provider wraps both the navbar and the page routes.
    // This is what lets the search box and the Stocks page share the same stock list and search results.
    <StockSearchProvider>
      <>
        <NavBar />
        {/* AppRoutes renders page components directly below the NavBar */}
        <AppRoutes />
      </>
    </StockSearchProvider>
  )
}

export default App
