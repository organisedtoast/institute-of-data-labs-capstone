// This file is the single source of truth for the beginner architecture doc.
// When the app has a major architecture change, update the structures here,
// then regenerate `docs/beginner-architecture-diagram.md`.

const GENERATED_FROM_PATH = "scripts/architecture-doc-source.js";

const HIGH_LEVEL_DIAGRAM = {
  direction: "LR",
  standaloneNodes: [
    { id: "user", label: "User" },
  ],
  groups: [
    {
      id: "presentation",
      label: "Presentation Layer",
      nodes: [
        { id: "nav", label: "Navigation + Search UI" },
        { id: "home", label: "Home Page" },
        { id: "stocks", label: "Stocks Page" },
      ],
    },
    {
      id: "frontend",
      label: "Frontend Application Layer<br/>React App (Browser)",
      nodes: [
        { id: "shared", label: "Shared Stock Search State" },
        { id: "frontApi", label: "Frontend API Services" },
      ],
    },
    {
      id: "backendApi",
      label: "Backend API Layer<br/>Express Server",
      nodes: [
        { id: "lookupApi", label: "Stock Lookup API" },
        { id: "watchlistApi", label: "Watchlist API" },
        { id: "homepageApi", label: "Homepage Category API" },
      ],
    },
    {
      id: "backendLogic",
      label: "Backend Business/Data Access Layer",
      nodes: [
        { id: "roicService", label: "Stock Search / ROIC Integration Service" },
        { id: "watchlistService", label: "Watchlist & Dashboard Service" },
        { id: "homepageService", label: "Homepage Category Cards Service" },
        { id: "persistence", label: "MongoDB Models / Persistence" },
      ],
    },
    {
      id: "external",
      label: "External Systems",
      nodes: [
        { id: "mongo", label: "MongoDB Database", shape: "database" },
        { id: "roic", label: "ROIC External API" },
      ],
    },
  ],
  edges: [
    { from: "user", to: "nav", label: "search, navigate" },
    { from: "user", to: "home", label: "view category cards" },
    { from: "user", to: "stocks", label: "view watchlist dashboards" },
    { from: "nav", to: "shared", label: "update search text, results, watchlist state" },
    { from: "home", to: "frontApi", label: "request category cards" },
    { from: "stocks", to: "frontApi", label: "request dashboards, metrics view, refresh, remove" },
    { from: "shared", to: "frontApi", label: "search stocks, load watchlist summary, import/open/remove stock" },
    { from: "frontApi", to: "lookupApi", label: "HTTP + JSON over /api/*" },
    { from: "frontApi", to: "watchlistApi", label: "HTTP + JSON over /api/*" },
    { from: "frontApi", to: "homepageApi", label: "HTTP + JSON over /api/*" },
    { from: "lookupApi", to: "roicService", label: "/api/stocks/search<br/>/api/stock-prices/:ticker" },
    { from: "watchlistApi", to: "watchlistService", label: "/api/watchlist/summary<br/>/api/watchlist/dashboards<br/>/api/watchlist/import<br/>/api/watchlist/:ticker" },
    { from: "homepageApi", to: "homepageService", label: "/api/homepage/investment-category-cards/query" },
    { from: "roicService", to: "roic", label: "external API requests" },
    { from: "watchlistService", to: "persistence", label: "service calls" },
    { from: "homepageService", to: "persistence", label: "service calls" },
    { from: "persistence", to: "mongo", label: "Mongo queries" },
  ],
};

const USER_FLOW_DIAGRAM = {
  direction: "TB",
  standaloneNodes: [
    { id: "start", label: "User opens app", type: "start" },
    { id: "homeLanding", label: "Land on Home page" },
  ],
  groups: [
    {
      id: "homeFlow",
      label: "Home Page Category Analysis",
      nodes: [
        { id: "homeChoice", label: "Choose next action", type: "decision" },
        { id: "browseCards", label: "Browse investment category cards" },
        { id: "sharedSearchEntry", label: "Search for a stock from navbar" },
        { id: "stocksNav", label: "Click Stocks in navbar" },
        { id: "viewCategory", label: "View investment category card" },
        { id: "adjustCategoryRange", label: "Adjust chart timeframe or visible month range" },
        { id: "openConstituents", label: "Open constituents list" },
        { id: "toggleDecision", label: "Enable or disable constituent?", type: "decision" },
        { id: "enableConstituent", label: "Enable constituent" },
        { id: "disableConstituent", label: "Disable constituent" },
        { id: "continueHome", label: "Continue browsing Home cards" },
      ],
    },
    {
      id: "searchFlow",
      label: "Shared Search And Watchlist Navigation",
      nodes: [
        { id: "searchResults", label: "View search results" },
        { id: "watchlistDecision", label: "Is stock already in watchlist?", type: "decision" },
        { id: "seeStock", label: "SEE STOCK" },
        { id: "addStock", label: "ADD STOCK" },
        { id: "clearResults", label: "Clear search results" },
        { id: "navigateToStocks", label: "Navigate to Stocks page" },
      ],
    },
    {
      id: "stocksFlow",
      label: "Stocks Page And Stock Card Analysis",
      nodes: [
        { id: "stocksLanding", label: "Land on Stocks page" },
        { id: "viewWatchlist", label: "View watchlist stock cards" },
        { id: "scrollCards", label: "Scroll through stock cards" },
        { id: "searchAgain", label: "Search again from navbar" },
        { id: "openExisting", label: "Open existing stock from results" },
        { id: "addNew", label: "Add new stock from results" },
        { id: "removeStock", label: "Remove stock from watchlist" },
        { id: "metricsMode", label: "Enter metrics mode for one stock" },
        { id: "confirmRemoval", label: "Confirm removal" },
        { id: "updatedWatchlist", label: "Return to updated watchlist" },
        { id: "detailedMetrics", label: "View detailed metrics" },
        { id: "changeCategory", label: "Change investment category" },
        { id: "editOverrides", label: "Edit override values" },
        { id: "hideRow", label: "Hide row" },
        { id: "boldRow", label: "Bold or unbold row" },
        { id: "exitMetrics", label: "Exit metrics mode" },
        { id: "returnToCards", label: "Return to stock-card list" },
      ],
    },
  ],
  edges: [
    { from: "start", to: "homeLanding" },
    { from: "homeLanding", to: "homeChoice" },
    { from: "homeChoice", to: "browseCards" },
    { from: "homeChoice", to: "sharedSearchEntry" },
    { from: "homeChoice", to: "stocksNav" },
    { from: "browseCards", to: "viewCategory" },
    { from: "viewCategory", to: "adjustCategoryRange" },
    { from: "adjustCategoryRange", to: "openConstituents" },
    { from: "openConstituents", to: "toggleDecision" },
    { from: "toggleDecision", to: "enableConstituent" },
    { from: "toggleDecision", to: "disableConstituent" },
    { from: "enableConstituent", to: "continueHome" },
    { from: "disableConstituent", to: "continueHome" },
    { from: "sharedSearchEntry", to: "searchResults" },
    { from: "searchResults", to: "watchlistDecision" },
    { from: "watchlistDecision", to: "seeStock", label: "Yes" },
    { from: "watchlistDecision", to: "addStock", label: "No" },
    { from: "searchResults", to: "clearResults" },
    { from: "seeStock", to: "navigateToStocks" },
    { from: "addStock", to: "navigateToStocks" },
    { from: "navigateToStocks", to: "stocksLanding" },
    { from: "stocksNav", to: "stocksLanding" },
    { from: "stocksLanding", to: "viewWatchlist" },
    { from: "viewWatchlist", to: "scrollCards" },
    { from: "viewWatchlist", to: "searchAgain" },
    { from: "viewWatchlist", to: "openExisting" },
    { from: "viewWatchlist", to: "addNew" },
    { from: "viewWatchlist", to: "removeStock" },
    { from: "viewWatchlist", to: "metricsMode" },
    { from: "removeStock", to: "confirmRemoval" },
    { from: "confirmRemoval", to: "updatedWatchlist" },
    { from: "metricsMode", to: "detailedMetrics" },
    { from: "detailedMetrics", to: "changeCategory" },
    { from: "detailedMetrics", to: "editOverrides" },
    { from: "detailedMetrics", to: "hideRow" },
    { from: "detailedMetrics", to: "boldRow" },
    { from: "changeCategory", to: "exitMetrics" },
    { from: "editOverrides", to: "exitMetrics" },
    { from: "hideRow", to: "exitMetrics" },
    { from: "boldRow", to: "exitMetrics" },
    { from: "exitMetrics", to: "returnToCards" },
    { from: "searchAgain", to: "searchResults" },
    { from: "openExisting", to: "returnToCards" },
    { from: "addNew", to: "updatedWatchlist" },
  ],
};

const FILE_MAP_SECTIONS = [
  {
    title: "Presentation layer",
    blocks: [
      {
        title: "a) Navigation + Search UI navbar",
        keyFiles: [
          { path: "src/components/NavBar.jsx", description: "the navbar UI, menu links, and search form." },
          { path: "src/components/StockSearchResults.jsx", description: "the shared search-results panel shown after searching." },
        ],
        supportingFiles: [
          { path: "src/components/stockSearchResultsLayout.js", description: "shared width/layout contract for the search-results panel." },
          { path: "src/App.jsx", description: "wires the navbar into the app shell so it appears above the routed pages." },
        ],
      },
      {
        title: "b) Home Page",
        keyFiles: [
          { path: "src/pages/Home.jsx", description: "main Home page container and layout." },
          { path: "src/components/SectorCardComponent.jsx", description: "main UI card for each investment category." },
          { path: "src/components/SectorChart.jsx", description: "chart shown inside each category card." },
        ],
        supportingFiles: [
          { path: "src/components/StockSearchResults.jsx", description: "shared search-results UI also rendered on Home." },
        ],
      },
      {
        title: "c) Stocks Page",
        keyFiles: [
          { path: "src/pages/Stocks.jsx", description: "main Stocks page container and page-level orchestration." },
          { path: "src/components/SharePriceDashboard.jsx", description: "main watchlist stock card UI." },
        ],
        supportingFiles: [
          { path: "src/components/StockSearchResults.jsx", description: "shared search-results UI rendered above the stock cards." },
        ],
      },
    ],
  },
  {
    title: "The Frontend Application Layer",
    blocks: [
      {
        title: "a) Shared Stock Search State",
        keyFiles: [
          { path: "src/contexts/StockSearchContext.jsx", description: "shared search and watchlist state used across pages." },
        ],
        supportingFiles: [
          { path: "src/hooks/useStockSearch.js", description: "hook that lets components consume the shared search state." },
          { path: "src/App.jsx", description: "wraps the app in `StockSearchProvider`." },
        ],
      },
      {
        title: "b) Frontend API Services",
        keyFiles: [
          { path: "src/services/investmentCategoryCardsApi.js", description: "frontend API adapter for Home page category cards." },
          { path: "src/services/watchlistDashboardApi.js", description: "public frontend API entry point for watchlist dashboard reads and mutations." },
        ],
        supportingFiles: [
          { path: "src/services/watchlistDashboardApi.reads.js", description: "dashboard data loading helpers." },
          { path: "src/services/watchlistDashboardApi.mutations.js", description: "dashboard update/mutation helpers." },
          { path: "src/services/watchlistDashboardApi.normalizers.js", description: "browser-side payload normalization." },
        ],
      },
    ],
  },
  {
    title: "The Bridge: HTTP + JSON over /api/*",
    intro: [
      "Key files:",
    ],
    keyFiles: [
      { path: "src/services/investmentCategoryCardsApi.js", description: "sends frontend requests into `/api/homepage/...`." },
      { path: "src/contexts/StockSearchContext.jsx", description: "sends shared search/watchlist requests into `/api/stocks/...` and `/api/watchlist/...`." },
      { path: "src/services/watchlistDashboardApi.reads.js", description: "sends dashboard read requests into `/api/watchlist/...`." },
      { path: "src/services/watchlistDashboardApi.mutations.js", description: "sends dashboard mutation requests into `/api/watchlist/...`." },
      { path: "server.js", description: "mounts the backend route groups under `/api`." },
    ],
    supportingFiles: [
      { path: "routes/stockLookupRoutes.js", description: "read-only stock lookup endpoints." },
      { path: "routes/watchlistRoutes.js", description: "watchlist and dashboard endpoints." },
      { path: "routes/investmentCategoryCardsRoutes.js", description: "homepage category-card endpoints." },
    ],
  },
  {
    title: "The Backend API Layer",
    blocks: [
      {
        title: "a) Stock Lookup API",
        keyFiles: [
          { path: "routes/stockLookupRoutes.js", description: "route definitions for live search and price lookup." },
          { path: "controllers/stockLookupController.js", description: "request validation and JSON response handling for stock lookup." },
        ],
        supportingFiles: [
          { path: "server.js", description: "mounts the stock lookup API under `/api`." },
        ],
      },
      {
        title: "b) Watchlist API",
        keyFiles: [
          { path: "routes/watchlistRoutes.js", description: "route definitions for summary, dashboards, import, CRUD, metrics, and refresh." },
          { path: "controllers/watchlistController.js", description: "core watchlist CRUD, summary, and dashboard bootstrap handlers." },
          { path: "controllers/importController.js", description: "stock import endpoint." },
          { path: "controllers/stockMetricsViewController.js", description: "metrics-view and row-preference endpoints." },
          { path: "controllers/refreshController.js", description: "stock refresh endpoint." },
          { path: "controllers/overrideController.js", description: "override update endpoints." },
        ],
        supportingFiles: [
          { path: "server.js", description: "mounts the watchlist API under `/api/watchlist`." },
        ],
      },
      {
        title: "c) Homepage Category API",
        keyFiles: [
          { path: "routes/investmentCategoryCardsRoutes.js", description: "route definitions for homepage category-card queries and updates." },
          { path: "controllers/investmentCategoryCardsController.js", description: "request validation and JSON responses for homepage category cards." },
        ],
        supportingFiles: [
          { path: "server.js", description: "mounts the homepage category API under `/api/homepage/investment-category-cards`." },
        ],
      },
    ],
  },
  {
    title: "The Backend Business/Data Access Layer",
    blocks: [
      {
        title: "a) Stock Search / ROIC Integration Service",
        keyFiles: [
          { path: "services/stockSearchService.js", description: "search classification, ranking, deduplication, and result shaping." },
          { path: "services/roicService.js", description: "low-level ROIC API client used to fetch external market/company data." },
        ],
        supportingFiles: [
          { path: "services/stockSearchApi.js", description: "backend helper around read-only stock lookup flows." },
        ],
      },
      {
        title: "b) Watchlist & Dashboard Service",
        keyFiles: [
          { path: "services/watchlistDashboardService.js", description: "summary and dashboard bootstrap logic for the Stocks page." },
          { path: "services/stockMetricsViewService.js", description: "metrics-view shaping and row-preference support." },
          { path: "services/watchlistStockRefreshService.js", description: "refreshes ROIC-backed stock data while preserving user data." },
        ],
        supportingFiles: [
          { path: "services/normalizationService.js", description: "converts imported ROIC data into the app's stock document shape." },
          { path: "services/stockDataVersionService.js", description: "decides whether stored stock documents need refresh or upgrade." },
        ],
      },
      {
        title: "c) Homepage Category Cards Service",
        keyFiles: [
          { path: "services/investmentCategoryCardsService.js", description: "builds homepage category-card payloads and updates constituent state." },
        ],
        supportingFiles: [
          { path: "services/lensService.js", description: "validates and prepares investment-category/lens configuration used by homepage cards." },
        ],
      },
      {
        title: "d) MongoDB Models / Persistence",
        keyFiles: [
          { path: "models/WatchlistStock.js", description: "main watchlist stock document." },
          { path: "models/StockMetricsRowPreference.js", description: "persisted row-level preferences for stock cards." },
          { path: "models/InvestmentCategoryConstituentPreference.js", description: "persisted constituent toggles for homepage cards." },
          { path: "models/StockPriceHistoryCache.js", description: "cached price history used by homepage category cards." },
          { path: "models/Lens.js", description: "lens/category configuration stored in MongoDB." },
        ],
        supportingFiles: [
          { path: "config/db.js", description: "MongoDB connection setup used by the Express server." },
        ],
      },
    ],
  },
  {
    title: "External Systems",
    blocks: [
      {
        title: "a) ROIC External API",
        keyFiles: [
          { path: "services/roicService.js", description: "the main backend boundary to the ROIC API." },
        ],
        supportingFiles: [
          { path: "services/stockSearchService.js", description: "uses ROIC-backed data to build search results." },
          { path: "services/watchlistStockRefreshService.js", description: "uses ROIC-backed datasets during import/refresh workflows." },
          { path: "services/investmentCategoryCardsService.js", description: "uses ROIC-backed price data for homepage cards." },
        ],
      },
      {
        title: "b) MongoDB Database",
        keyFiles: [
          { path: "config/db.js", description: "opens and closes the database connection." },
          { path: "server.js", description: "starts the app and connects to MongoDB during backend startup." },
        ],
        supportingFiles: [
          { path: "models/WatchlistStock.js" },
          { path: "models/StockMetricsRowPreference.js" },
          { path: "models/InvestmentCategoryConstituentPreference.js" },
          { path: "models/StockPriceHistoryCache.js" },
          { path: "models/Lens.js" },
        ],
      },
    ],
  },
];

const ARCHITECTURE_DOC_SOURCE = {
  generatedFromPath: GENERATED_FROM_PATH,
  title: "Beginner-Focused Architecture Diagram",
  introParagraphs: [
    "This diagram shows the app as a beginner-friendly early-stage architecture view.",
    "It keeps the main building blocks, boundaries, interfaces, and external systems visible",
    "without dropping down to file-by-file implementation detail.",
  ],
  sections: {
    highLevelDiagram: HIGH_LEVEL_DIAGRAM,
    legend: [
      "Boxes = components or modules",
      "Arrows = communication or dependency",
      "Outer grouped boxes = architectural boundaries or layers",
    ],
    beginnerNotes: [
      "The frontend does not talk to MongoDB or ROIC directly. It always goes through the Express API.",
      "The backend is split into three concerns: stock lookup, watchlist management, and homepage category cards.",
    ],
    howToRead: [
      "Start on the left with the `User`.",
      "Move across to the browser-based React app, where the user interacts with navigation, search, `Home`, and `Stocks`.",
      "The frontend sends HTTP + JSON requests to the Express backend.",
      "The backend separates request handling into three API concerns, then delegates to business/data services.",
      "MongoDB stores the app's own persistent data, while ROIC provides the main third-party market and company data.",
    ],
    userFlowIntro: [
      "This is a current-state user flow diagram. It shows the main steps a user can take",
      "while interacting with the app, without dropping down into backend or data-storage details.",
    ],
    userFlowDiagram: USER_FLOW_DIAGRAM,
    userFlowNotes: [
      "`Home` and `Stocks` are the two main page destinations in the app.",
      "Navbar search is shared across both pages.",
      "Search results use `SEE STOCK` for stocks already in the watchlist and `ADD STOCK` for new ones.",
      "Home category cards support chart-range changes, constituents viewing, and constituent enable/disable.",
      "The deeper stock-analysis path lives on the `Stocks` page through stock cards and focused metrics mode.",
      "This diagram intentionally does not show a direct constituent-row click-through to an individual stock card, because that is not the current verified interaction.",
    ],
    fileMapIntro: [
      "This section maps each diagram block to the main files you would open first.",
    ],
    fileMapSections: FILE_MAP_SECTIONS,
  },
  workflowNotes: [
    "Treat this file as generated output. Edit the source module instead of editing the markdown by hand.",
    "A major architecture change means any change to major layers, routes, page flows, backend service boundaries, external-system dependencies, or the key/supporting file mapping.",
    "After those changes, run `npm run docs:architecture`. CI-style doc tests will fail if the checked-in markdown is stale.",
  ],
};

module.exports = {
  ARCHITECTURE_DOC_SOURCE,
};
