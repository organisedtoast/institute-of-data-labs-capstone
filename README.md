# institute-of-data-labs-capstone

This project has two main halves:

- an Express + MongoDB backend in the repo root
- a React + Vite frontend under `src/`

If you are new to the app, read this file from top to bottom once. It starts with the basics, then explains the scripts, then explains the tests in the same order you are most likely to need them.

## 1. Start the app

### Prerequisites

- Node.js and npm installed
- a MongoDB connection string
- a ROIC API key for live stock search and live price lookup

### Environment variables

Create a `.env` file in the project root:

```env
MONGO_URI=your_mongodb_connection_string
ROIC_API_KEY=your_roic_api_key
PORT=3000
```

`PORT` is optional. If you do not set it, the backend starts on `3000`.

### Install dependencies

```bash
npm install
```

### Start the backend API

```bash
npm run server
```

The Express API will start at `http://localhost:3000` unless you set a different `PORT`.

### Start the frontend dev server

Open a second terminal and run:

```bash
npm run dev
```

Important beginner note: `npm run dev` only starts the Vite frontend. It does **not** start the backend API for you. The frontend expects the backend to already be running on `http://localhost:3000`, and Vite proxies `/api/*` requests there during local development.

## 2. Main scripts you will use most often

These are the scripts beginners usually reach for first.

| Command | What it does | When to run it |
| --- | --- | --- |
| `npm run server` | Starts the backend API with `nodemon`. | Use this whenever you need the local backend, database-backed watchlist routes, or `/api/*` requests from the frontend. |
| `npm run dev` | Starts the Vite frontend dev server. | Use this while building or debugging the React UI. |
| `npm run build` | Creates a production frontend build. | Use this before deployment checks or when you want to confirm the frontend still builds cleanly. |
| `npm run preview` | Serves the production frontend build locally. | Use this after `npm run build` when you want to preview the built app instead of the dev server. |
| `npm run lint` | Runs ESLint across the repo. | Use this before commits or after frontend/backend edits that may affect linting. |
| `npm run test:ui` | Runs the frontend/UI test suite with Vitest. | Use this for React components, frontend service helpers, context logic, and page regressions. |
| `npm run test:ui:watch` | Runs Vitest in watch mode. | Use this while iterating on frontend code and you want tests to rerun automatically. |
| `npm run test:backend` | Runs the fast backend bundle with Node's built-in test runner. | Use this when you want a broad backend confidence check without running the slower end-to-end harnesses. |
| `npm run test:watchlist-routes` | Runs the watchlist summary + batched dashboard route integration test. | Use this when you change the backend routes that feed the `Stocks` page first paint. |
| `npm run test:homepage-routes` | Runs the homepage category-card route integration test. | Use this when you change homepage card route behavior, canonical default ranges, or constituent toggles. |
| `npm run test:e2e-stubbed` | Runs the deterministic end-to-end backend import/CRUD harness with fake ROIC responses. | Use this when you changed import, refresh, overrides, normalization, or MongoDB persistence behavior. |
| `npm run test:e2e-live` | Runs the live end-to-end backend harness against the real ROIC API and real MongoDB. | Use this as a manual confidence check when you need production-like confirmation. |
| `npm run perf:seed -- 1000` | Seeds a deterministic large-watchlist dataset into an isolated performance database. | Use this before manual scale investigations when you want a repeatable watchlist size such as `1000` or `5000` stocks. |
| `npm run perf:backend` | Runs the backend large-watchlist stress/resource harness and compares the results to the checked-in baseline JSON. | Use this when you want to measure route latency, payload size, and Node memory behavior as the watchlist scales. |
| `npm run perf:browser:check` | Runs only the Playwright browser setup check and launch smoke test. | Use this first when the real browser benchmark is failing and you need to know whether the issue is browser setup or the app itself. |
| `npm run perf:browser` | Runs the manual real-browser benchmark for the `Stocks` page against large seeded watchlists. | Use this when you want to see whether the actual page still renders and stays usable at scale. |
| `npm run perf:baseline` | Intentionally refreshes the checked-in large-watchlist baseline JSON after you decide the new measurements should become the shared reference. | Use this only when you intentionally want to accept the new performance profile as the project baseline. |
| `node --test tests/chunked-large-watchlist-seeding.test.js` | Runs the targeted chunked-seeding backend test. | Use this when you change how the large-watchlist performance dataset is generated or inserted. |

Two extra script notes:

- `npm run start` is effectively the same backend behavior as `npm run server` in this repo. Both run `nodemon server.js`.
- `npm test` is only a placeholder script right now. It is **not** the real test entry point for this project.

## 2.5. How Home And Stocks Load Data

The app now splits "shared lightweight state" from "page-heavy data" on purpose:

- `GET /api/watchlist/summary` loads the lightweight stock list used by shared search state, `SEE STOCK` detection, and add/open/remove flows.
- `GET /api/watchlist/dashboards` still provides the rich stock-card bootstrap payload, but the `Stocks` page now renders only a bounded window of shells, then requests real dashboard data in a small queued ticker flow instead of waiting for one giant whole-watchlist response before first paint.
- `GET /api/watchlist/:ticker/metrics-view` is lazy. The `Stocks` page only requests it after the user clicks `SHOW METRICS`.
- `PATCH /api/watchlist/:ticker/metrics-row-preferences` now stores stock-card row display choices. Detailed metrics rows can be hidden and bolded, while main-table rows can be bolded but not hidden.
- `POST /api/watchlist/:ticker/refresh` still upgrades legacy stocks, but the `Stocks` page now waits for the first visible real dashboard paint and a short idle gap before starting that background work.
- `POST /api/homepage/investment-category-cards/query` now returns the canonical latest trailing 5Y homepage payload on first load, so `Home` no longer mounts and immediately re-queries the same cards.
- Stock-card default-bold rows now come from one shared JSON source that both the backend and frontend reuse through format-specific wrappers, so saved row bolding defaults stay consistent across first paint, older fallback payloads, and browser builds such as Edge.
- The backend wrapper is CommonJS because Node loads it on the server, while the browser wrapper stays self-contained ESM because Vite serves that file directly during local development and in-browser module loading.

One small stock-card behavior note for beginners:

- Right click or long press a detailed-metrics left-rail label to open `HIDE ROW` and `BOLD` / `UNBOLD`.
- Right click or long press a main-table left-rail label to open `BOLD` / `UNBOLD`.
- Those stock-card overlays now shift inward near the viewport edge, so the full menu stays visible even at narrower zoomed desktop widths.
- `Share price` and `Market cap` in the main table now start bold by default.
- Stock cards now show two separate currency references:
  - `SP currency` sits above `Share price` in the main table and repeats the ticker pricing currency across visible columns.
  - `Reporting currency` sits directly under the `DETAIL METRICS` heading and repeats the financial-statement currency across visible columns.
- `priceCurrency` and `reportingCurrency` are intentionally different concepts. Trading currency comes from the ROIC company profile, while reporting currency comes from the income statement and is cross-checked against the balance sheet for mismatch diagnostics.
- In detailed metrics, the default-bold rows now include the requested EPS, DY, DPS, EV/EBIT, PE, EV/Sales, and forecast market-cap rows whenever those rows are visible for that stock.
- These are only defaults. A user's saved `UNBOLD` choice still wins later for that one stock card.
- Derived/internal-calculation stock fields now stay visible and keep recalculating, but they are no longer directly editable. Users change the input rows, and the backend recalculates things like market cap from there.
- Stock-card display values no longer prepend `$`, including the main table, detailed metrics, stock-chart Y-axis labels, and stock-chart hover values. The payload can still keep currency metadata, but the visible UI no longer assumes every stock is USD-denominated.
- Detail-metrics section headers use one full-width divider across both the frozen label rail and the scrolling values area, even if hidden rows change which visible row starts the section.
- Home and Stocks internal card scrollers now share one opt-in visibly wider scrollbar rule, so the horizontal and vertical in-card scrollbars are easier to see without changing the browser page scrollbar.
- That shared helper now splits Chromium and Firefox behavior on purpose, because Edge will ignore the wider `::-webkit-scrollbar` width if a standards-based color rule is applied too broadly.
- The scrollbar regressions now protect both the opt-in marker and the shared thickness values, so a future refactor cannot quietly keep the rule name while shrinking the scrollbar back down or reintroducing the Edge override problem.

One small shared chart note for beginners:

- Sector and stock cards now slide the hover tooltip inward near the chart edges so the box and text stay readable instead of getting clipped off-screen.

## 3. How testing is organized

This app uses **two** test systems.

### Frontend/UI tests

- Runner: Vitest
- DOM environment: JSDOM
- Main command: `npm run test:ui`
- Test file location: `src/**/__tests__/`

JSDOM means "a fake browser running inside Node." It lets React components render, click handlers fire, and DOM assertions run without opening a real browser window.

The shared frontend test setup lives in `src/test/setupTests.js`. That file provides browser-like helpers such as `matchMedia`, `requestAnimationFrame`, and Testing Library cleanup so the UI tests can run consistently in Node.

### Backend tests

- Runner: Node's built-in test runner
- Main style: `node --test ...`
- Test file location: `tests/`

These backend tests range from tiny smoke checks to real HTTP + MongoDB harnesses.

### A few beginner definitions

- **Stubbed** means the test replaces an external dependency with a fake version so the inputs stay controlled and repeatable.
- **Integration** means several real parts are wired together, such as Express routes plus controllers plus MongoDB.
- **End-to-end** means a large, realistic workflow is exercised from the outside, often through real HTTP requests.

### Most useful example commands

Run all frontend/UI tests:

```bash
npm run test:ui
```

Run one frontend/UI file:

```bash
npm run test:ui -- src/components/__tests__/SharePriceDashboard.test.jsx
```

Run the fast backend bundle:

```bash
npm run test:backend
```

Run one backend file directly:

```bash
node --test tests/stock-search-service.test.js
```

Important beginner note: many frontend test files are run by passing the file path to Vitest, because only some backend suites have dedicated npm aliases.

## 4. Frontend/UI test catalog

Run the whole frontend suite with:

```bash
npm run test:ui
```

Run one frontend file with:

```bash
npm run test:ui -- path/to/test-file
```

### Pure helper and chart-math tests

| File | What it proves | When to run it | How to run it |
| --- | --- | --- | --- |
| `src/components/__tests__/sharePriceChartScale.test.jsx` | Proves the chart-scale helper can build readable Y-axis ticks and labels for large, medium, small, and flat price ranges, and that stock-chart Y-axis labels keep their decimal rules without assuming a `$` symbol. | Run this when you change share-price chart scale math, tick spacing, or Y-axis label formatting. | `npm run test:ui -- src/components/__tests__/sharePriceChartScale.test.jsx` |

### Frontend API adapter tests

`src/services/watchlistDashboardApi.js` remains the public frontend dashboard-data import path even though its normalization, read, and mutation helpers now live in smaller sibling modules.
The dashboard helpers still depend on the browser-safe default-bold wrapper, so changes near `shared/defaultBoldStockRows.mjs` should preserve real browser ESM compatibility, not just Node import parity.

| File | What it proves | When to run it | How to run it |
| --- | --- | --- | --- |
| `src/services/__tests__/watchlistDashboardApi.test.js` | Proves the frontend watchlist dashboard API layer can normalize full dashboard payloads, preserve row-preference metadata such as main-table row bolding, keep the new `SP currency` and `Reporting currency` stock-card rows alive through both live and fallback payload shapes, apply the expanded default-bold stock rows for pricing, valuation, EPS, dividends, and forecast market cap when older payloads omit that flag, keep derived main-table rows read-only in the normalized payload, load the browser-safe shared default-bold helper path, support chunked dashboard bootstrap requests through the existing `tickers` contract, lazy-load metrics-view payloads, and send the shared row-preference update contract used for both hide/show and bold/unbold actions. | Run this when you change frontend dashboard data loading, currency-row normalization, default row bolding, derived-field editability, the browser-safe shared helper, row-preference normalization, chunked bootstrap behavior, lazy metrics loading, or legacy refresh behavior. | `npm run test:ui -- src/services/__tests__/watchlistDashboardApi.test.js` |
| `src/services/__tests__/investmentCategoryCardsApi.test.js` | Proves the homepage category-cards API wrapper can load and normalize cards, preserve the canonical-initial-range flag, request one card through the bulk contract, and send constituent-toggle updates with the right range payload. | Run this when you change homepage category card fetching or the frontend API wrapper around those routes. | `npm run test:ui -- src/services/__tests__/investmentCategoryCardsApi.test.js` |

### Shared state and context tests

| File | What it proves | When to run it | How to run it |
| --- | --- | --- | --- |
| `src/contexts/__tests__/StockSearchContext.test.jsx` | Proves the shared stock-search context can load the lightweight watchlist summary, reuse existing stocks, import missing stocks, remove stocks, and show useful search error messages. | Run this when you change navbar search state, summary-route loading, stock add/open/remove flows, or frontend error messaging. | `npm run test:ui -- src/contexts/__tests__/StockSearchContext.test.jsx` |

### Focused UI component tests

| File | What it proves | When to run it | How to run it |
| --- | --- | --- | --- |
| `src/components/__tests__/StockSearchResults.test.jsx` | Proves the search-results list shows the correct action for each result, such as `SEE STOCK` for existing watchlist items and `ADD STOCK` for new ones. | Run this when you change search-result buttons, navigation behavior, or existing-stock detection in the visible UI. | `npm run test:ui -- src/components/__tests__/StockSearchResults.test.jsx` |
| `src/components/__tests__/StockSearchResults.layout.test.jsx` | Proves the shared search-results component owns one page-wide layout contract, so centered parents like `Home` cannot make it narrower than `Stocks` or future pages. | Run this when you change the shared search-results width, centering, or page reuse behavior. | `npm run test:ui -- src/components/__tests__/StockSearchResults.layout.test.jsx` |
| `src/components/__tests__/SectorChart.test.jsx` | Proves the homepage category chart renders correctly, validates month ranges, handles empty states, maps preset scroll movement, keeps the Y-axis left rail sticky, filters long x-axis labels for readability, keeps the shared hover tooltip readable near both chart edges, and protects the shared enhanced scrollbar contract including its visibly wider thickness values and browser-specific helper branches. | Run this when you change the category-chart layout, preset scrolling, axis labeling, date-range behavior, shared hover tooltip positioning, or the shared internal scrollbar rule. | `npm run test:ui -- src/components/__tests__/SectorChart.test.jsx` |
| `src/components/__tests__/SectorCardComponent.test.jsx` | Proves a homepage category card can open its constituents list, preserve constituent order and status, stay compact with long company names, skip a redundant mount-time request when the initial payload is already canonical, still re-query stale homepage payloads into the latest trailing 5Y range, and keep the constituents scroller on the shared enhanced scrollbar contract with the same widened size. | Run this when you change homepage category cards, constituent toggles, list layout, canonical/default 5Y behavior, or the shared internal scrollbar rule. | `npm run test:ui -- src/components/__tests__/SectorCardComponent.test.jsx` |

### Page, dashboard, and integration-style regressions

| File | What it proves | When to run it | How to run it |
| --- | --- | --- | --- |
| `src/pages/__tests__/Stocks.test.jsx` | Proves the `Stocks` page renders summary shells before rich dashboard bootstraps finish, keeps the initial render window bounded, grows that render window as the bottom sentinel reaches the viewport, requests dashboard bootstraps through a small page-owned queue, keeps search visible while hiding sibling stock cards during focused metrics mode, restores the full watchlist when metrics are closed, and refreshes legacy dashboard cards only after the first visible real dashboard paint plus the initial queue settle gate. | Run this when you change page-level watchlist rendering, render-window growth, queued dashboard bootstrap behavior, deferred background refresh, or focused metrics behavior on the `Stocks` route. | `npm run test:ui -- src/pages/__tests__/Stocks.test.jsx` |
| `src/pages/__tests__/Home.search-results-layout.test.jsx` | Proves the `Home` page keeps the shared search-results width contract even though it uses a centered stack, so the search bar stays aligned with `Stocks`. | Run this when you change Home page layout wrappers or shared search-results placement on non-Stocks pages. | `npm run test:ui -- src/pages/__tests__/Home.search-results-layout.test.jsx` |
| `src/pages/__tests__/StocksRemount.integration.test.jsx` | Proves the `Stocks` route can survive remount-oriented flows where the page, provider, and dashboard wiring are exercised together in a larger integration-style test. | Run this when you change remount behavior, route/provider wiring, or flows where the focused stock hides and restores the rest of the page. | `npm run test:ui -- src/pages/__tests__/StocksRemount.integration.test.jsx` |
| `src/components/__tests__/SharePriceDashboard.test.jsx` | Proves the stock dashboard survives the hardest UI scenarios: preset scrolling, sticky rails, chart alignment, lazy metrics loading, row-action menus, stock-card overlay edge positioning, main-table versus detailed-metrics interaction differences, the new `SP currency` row above `Share price`, the new `Reporting currency` row directly under the detail heading, expanded default-bold stock rows plus user unbolding, persisted row-preference regressions, shared hover tooltip edge positioning, full-width detail-metrics section-boundary styling, stock-card value formatting without forced `$` symbols, exact-zero table values rendering as `0` or `0%` instead of noisy decimal versions, derived main-table/detail cells staying inert while editable input rows still open the shared override editor, shared enhanced scrollbar contracts for the chart/table and focused metrics viewport including their widened size, React loop regressions, and focused metrics layout edge cases such as `MAX`. It also protects the browser-safe scrollbar helper shape so Edge keeps the wider width instead of falling back to the standards-only path. | Run this when you change the stock card dashboard, batched bootstrap handoff, currency-row placement, default row bolding, row-action behavior, derived-field editability, stock-card overlay positioning, detail metrics table, section-boundary styling, value formatting, scroll measurement, preset logic, shared hover tooltip positioning, the shared internal scrollbar rule, or any animation/layout code inside `SharePriceDashboard`. | `npm run test:ui -- src/components/__tests__/SharePriceDashboard.test.jsx` |

### Frontend investigation notes

`src/components/__tests__/ACT_WARNING_INVESTIGATION.md` is a developer investigation note. It is **not** a runnable test file.

## 5. Backend test catalog

Backend tests use Node's built-in runner. Some have dedicated npm scripts, and some are run directly with `node --test`.

### Fast backend test scripts

| Command | What it does | When to run it |
| --- | --- | --- |
| `npm run test:backend` | Runs the fast backend bundle: `stock-search-service`, `frontend-api-routes`, `server-startup`, `lens-visibility`, `inspect-lens-fields`, `schema-reference-generator`, `import-range-behavior`, and `investment-category-migration`. | Use this when you want a broad backend check after service, route, docs, or migration changes. |
| `npm run test:stock-search` | Runs only `tests/stock-search-service.test.js`. | Use this when you are changing search classification, result ranking, suffix probing, or search diagnostics. |
| `npm run test:stock-lookup-routes` | Runs only `tests/frontend-api-routes.test.js`. | Use this when you changed the read-only stock lookup routes or their request/response behavior. |
| `npm run test:server-startup` | Runs only `tests/server-startup.test.js`. | Use this when you changed startup behavior or degraded-mode availability during MongoDB failures. |
| `npm run test:watchlist-routes` | Runs only `tests/watchlist-routes.test.js`. | Use this when you change watchlist summary loading, batched dashboard bootstrap loading, or the backend route contract behind the `Stocks` page first paint. |
| `npm run test:homepage-routes` | Runs only `tests/investment-category-cards-routes.test.js`. | Use this when you change homepage card route behavior, canonical default ranges, constituent toggles, or category-card aggregation rules. |
| `npm run test:lenses` | Runs `tests/lens-visibility.test.js` and `tests/inspect-lens-fields.test.js`. | Use this when you change lens seeding, field visibility rules, or the lens inspection flow. |
| `npm run test:docs` | Runs only `tests/schema-reference-generator.test.js`. | Use this when you change the schema-reference generator or field-catalog-driven docs. |
| `npm run test:e2e-stubbed` | Runs the deterministic end-to-end import/CRUD backend harness. | Use this for import, refresh, override, and MongoDB workflow changes. |
| `npm run test:e2e-live` | Runs the live end-to-end import/CRUD backend harness. | Use this as a manual high-confidence check against the real ROIC API. |

### Small regressions and smoke checks

| File | What it proves | When to run it | How to run it |
| --- | --- | --- | --- |
| `tests/watchlist-stock-model-load.test.js` | Proves the `WatchlistStock` model can load without initialization-order errors before the server even starts. | Run this when you change model imports, schema setup, or startup wiring. | `node --test tests/watchlist-stock-model-load.test.js` |
| `tests/server-startup.test.js` | Proves the backend can still boot and serve read-only stock search even when MongoDB is unavailable at startup. | Run this when you change server startup, dependency loading, or degraded-mode availability. | `npm run test:server-startup` |
| `tests/schema-reference-generator.test.js` | Proves the schema reference generator still emits the key markdown sections developers rely on, including the new `reportingCurrency` references, and fails loudly if required sections would be empty. | Run this when you change the schema doc generator or the field catalog that feeds it. | `npm run test:docs` |
| `tests/inspect-lens-fields.test.js` | Proves the lens inspection CLI can print seeded visible fields without needing the frontend. | Run this when you change the lens inspection script or field-visibility output format. | `node --test tests/inspect-lens-fields.test.js` |
| `tests/default-bold-stock-rows.test.js` | Proves the shared stock-card default-bold source can derive the backend row-key lookup and the frontend field-path lookup from one canonical list, and that the browser-safe ESM wrapper stays aligned with the backend CommonJS helper. | Run this when you change the shared default-bold config or the helper wrappers that feed backend shaping and frontend fallback normalization. | `node --test tests/default-bold-stock-rows.test.js` |
| `tests/default-bold-stock-rows-vite.test.js` | Proves Vite can transform the browser-facing default-bold wrapper without exposing CommonJS syntax in the `/stocks` import path, which protects the exact dev-only regression that can break the page while Node-side tests still pass. | Run this when you change `shared/defaultBoldStockRows.mjs`, its helper boundaries, or any browser-facing module-format decisions around the default-bold helper. | `node --test tests/default-bold-stock-rows-vite.test.js` |

### Backend service and business-rule tests

| File | What it proves | When to run it | How to run it |
| --- | --- | --- | --- |
| `tests/stock-search-service.test.js` | Proves the backend search service handles ticker-first vs name-first searches, suffix probing, ranking, broadening, diagnostics, and partial upstream failures. | Run this when you change the stock search service or ROIC search result ranking rules. | `npm run test:stock-search` |
| `tests/investment-category-cards-service.test.js` | Proves the backend homepage category-card helpers can condense daily prices into monthly points, re-index stocks fairly, average constituent series, and choose the default trailing month range. | Run this when you change the category-card service or the math behind homepage card series. | `node --test tests/investment-category-cards-service.test.js` |
| `tests/watchlist-dashboard-service.test.js` | Proves the backend dashboard bootstrap service batches stock-card row-preference reads into one query while still applying each saved bold choice to the correct stock payload. | Run this when you change the backend bootstrap shaping, dashboard preference loading, or stock-card first-paint data flow. | `node --test tests/watchlist-dashboard-service.test.js` |
| `tests/import-range-behavior.test.js` | Proves import-range year caps are parsed correctly, annual history is capped or left uncapped correctly, earnings release dates fall back to `fiscalYearEndDate + 60 days` when needed, and stock-document building keeps ticker pricing currency separate from reporting currency while recording mismatch diagnostics. | Run this when you change import range parsing, stock document building, earnings-date fallback rules, or currency normalization. | `node --test tests/import-range-behavior.test.js` |
| `tests/stock-metrics-view-service.test.js` | Proves the backend metrics-view service hides fully empty rows by default while preserving user visibility preferences, applies the expanded default-bold pricing, valuation, EPS, dividend, and forecast market-cap rows from the shared source plus the main-table bold defaults, exposes the read-only `Reporting currency` detail row from the stored stock metadata, clears legacy user-owned derived values back to calculated state, and keeps derived detail rows read-only while manual forecast rows stay editable. | Run this when you change metrics-mode row visibility, currency-row shaping, default row bolding, saved row-preference precedence, derived-field cleanup, override markers, annual metrics shaping, or the shared stock-row default source. | `node --test tests/stock-metrics-view-service.test.js` |
| `tests/roic-annual-fetch-options.test.js` | Proves the ROIC annual-history service sends the correct request options, especially the difference between uncapped defaults and explicit year caps. | Run this when you change ROIC annual fetch options or the `years` contract used during import/refresh. | `node --test tests/roic-annual-fetch-options.test.js` |

### HTTP route and backend integration tests

| File | What it proves | When to run it | How to run it |
| --- | --- | --- | --- |
| `tests/frontend-api-routes.test.js` | Proves the read-only stock lookup HTTP routes validate input, normalize requests, surface service errors cleanly, and return the expected response shape over real HTTP. | Run this when you change `GET /api/stocks/search`, `GET /api/stock-prices/:ticker`, or the route/controller boundary around them. | `npm run test:stock-lookup-routes` |
| `tests/watchlist-routes.test.js` | Proves the watchlist summary route returns the lightweight shared-search payload, the batched dashboard route returns the first-paint `Stocks` payload with the new read-only `SP currency` row plus the correct default-bold main-table rows and read-only derived market-cap cells, `GET /api/watchlist/:ticker/metrics-view` returns the new `Reporting currency` row alongside the requested default-bold pricing, valuation, EPS, dividend, and forecast market-cap rows from the shared source while still respecting a saved unbold choice, derived override requests now fail with `400`, valid input-field overrides still recalculate derived outputs, legacy derived overrides are cleaned back to calculated state on read, and the backend route that saves stock-card row visibility and row bolding choices persists `isBold` without wiping the saved hide/show preference. | Run this when you change `/api/watchlist/summary`, `/api/watchlist/dashboards`, `/api/watchlist/:ticker/metrics-view`, `/api/watchlist/:ticker/metrics-row-preferences`, currency-row payload shaping, derived-field override policy, the backend bootstrap contract behind the `Stocks` page, or the shared stock-row default source. | `npm run test:watchlist-routes` |
| `tests/investment-category-cards-routes.test.js` | Proves the homepage investment-category card routes can build category payloads, classify constituents, persist user-disabled toggles, return the canonical trailing 5Y default range, and reject invalid requests. | Run this when you change the backend routes for homepage investment-category cards. | `npm run test:homepage-routes` |
| `tests/lens-visibility.test.js` | Proves the backend alone can resolve the correct card/detail visible fields for each investment category and for real stocks. | Run this when you change seeded lenses, visibility rules, or how categories resolve to lenses. | `npm run test:lenses` |
| `tests/missing-earnings-calls-import.test.js` | Proves import and refresh tolerate ROIC's special "no earnings calls found" 404 while still failing loudly for genuine upstream failures. | Run this when you change import, refresh, or earnings-call fallback behavior. | `node --test tests/missing-earnings-calls-import.test.js` |
| `tests/investment-category-migration.test.js` | Protects investment-category migration behavior. This is documented conservatively here because it is part of the fast backend bundle and its filename shows it guards category migration rules. | Run this when you change investment-category renaming or migration behavior. | `node --test tests/investment-category-migration.test.js` |

### End-to-end backend harnesses

| File | What it proves | When to run it | How to run it |
| --- | --- | --- | --- |
| `tests/e2e-stubbed-import-crud.test.js` | Proves the real Express app, real normalization logic, real MongoDB persistence, and real override/refresh routes all work together when ROIC responses are faked in a stable way, including the separation between ticker pricing currency and financial reporting currency during import. | Run this when you need strong confidence in the full backend workflow without depending on live third-party data. | `npm run test:e2e-stubbed` |
| `tests/e2e-live-import-crud.test.js` | Proves the same general import, refresh, override, and delete workflow still works against the real ROIC API and real MongoDB. | Run this when you want a production-like manual confidence check. | `npm run test:e2e-live` |

## 6. Developer utility scripts

These are useful developer tools, but they are **not** automated tests.

| Command | What it does | When to run it |
| --- | --- | --- |
| `npm run search:live` | Starts an interactive terminal-based stock search against the real ROIC-backed search flow. | Use this when you want to manually explore search results without booting the frontend. |
| `npm run docs:schema` | Regenerates `docs/schema-reference.md` from the field catalog and related schema metadata. | Use this when you change schema docs, field-catalog entries, or the generator script. |
| `npm run inspect:lens` | Runs the lens inspection CLI for the example category `Profitable Hi Growth`. | Use this when you want to inspect visible card/detail fields without starting the frontend. |
| `npm run check:frontend-branch-sync` | Fails unless local `frontend-branch` and `main` point to identical file trees. | Use this before a manual merge that is supposed to leave `main` unchanged. |
| `npm run perf:seed -- 1000` | Seeds a deterministic performance dataset into an isolated MongoDB database name. | Use this before manual scale checks or when you want a known watchlist size ready in the database. |
| `npm run perf:backend` | Runs the backend large-watchlist performance harness and writes JSON results under `performance-results/backend/`. | Use this when you are investigating API scaling, payload growth, or backend memory drift. |
| `npm run perf:browser:check` | Runs the browser discovery step plus a launch smoke test without seeding data or starting the app servers. | Use this as the first troubleshooting step for Playwright browser issues. |
| `npm run perf:browser` | Runs the manual browser benchmark and writes JSON results under `performance-results/browser/`. | Use this when you want to measure first visible stock cards, first usable interaction, and progressive activation on the real `Stocks` page. |
| `npm run perf:baseline` | Refreshes the checked-in baseline files in `tests/performance/baselines/`. | Use this only after you intentionally approve a new baseline and want future regressions measured against it. |
| `node --test tests/chunked-large-watchlist-seeding.test.js` | Verifies the chunked performance seeder still inserts the expected records and summary counts. | Use this when you change `tests/performance/largeWatchlistDataset.js` or the seeding configuration. |

## 6.5. Large-Watchlist Performance Toolkit

This repo now includes a dedicated **large-watchlist performance toolkit** for the specific problem that originally showed up in this app: once the watchlist grows, the `Stocks` page and the watchlist-related backend routes need to stay fast enough to feel usable.

The toolkit has **two parts**:

- a **backend harness** for route latency, payload size, and Node memory behavior
- a **manual browser benchmark** for the real `Stocks` page in a real browser

Both parts use **deterministic seeded data** instead of live ROIC data. That matters because performance regressions are much easier to spot when the data stays repeatable from run to run.

The seeded-data setup is now **chunked on purpose**. Instead of building the full synthetic watchlist in one giant in-memory array, the seeder builds and inserts smaller batches. This reduces setup-time memory spikes and helps the benchmark spend more of its memory on the real app routes rather than on test-fixture preparation.

The `Stocks` page now follows a **summary-first first-paint strategy**:

- the shared search context loads the lightweight watchlist summary first
- the page renders a bounded window of shell cards from that summary immediately
- each shell reserves roughly the same vertical space as a real dashboard card, so the first scroll layout stays close to the final dashboard layout
- the page then requests rich dashboard bootstraps through a small page-owned queue
- the bootstrap viewport observer uses a tighter preload margin, so only cards genuinely near the viewport activate on first paint
- the page grows the rendered card window as the user scrolls deeper into the watchlist
- legacy stock refresh only starts after the first visible real dashboard has already painted and the initial bootstrap queue has settled

Important beginner note: this means the page now loads **what the user needs first** instead of waiting for every stock card's chart payload before showing anything useful.

Important beginner note: this toolkit is about **performance behavior**, not financial-value correctness. It is trying to answer questions like "does the app still load and stay responsive with thousands of stocks?" rather than "is ROIC returning the right market data today?"

### Why there are two harnesses

The backend harness and browser benchmark answer different questions:

- The **backend harness** asks: "How heavy are the API routes when the watchlist becomes very large?"
- The **browser benchmark** asks: "How quickly does the real `Stocks` page show useful content and stay interactive in the browser?"

You need both because an app can have:

- fast backend routes but a slow browser UI
- or a responsive-feeling UI that is still overusing server memory

### Commands

Seed a deterministic large watchlist:

```bash
npm run perf:seed -- 1000
```

Example with an explicit chunk size:

```bash
PERF_SEED_CHUNK_SIZE=100 npm run perf:seed -- 5000
```

Run the backend harness:

```bash
npm run perf:backend
```

Run the manual browser benchmark:

```bash
npm run perf:browser
```

Run only the browser setup check:

```bash
npm run perf:browser:check
```

Refresh the checked-in baseline on purpose:

```bash
npm run perf:baseline
```

### Supported dataset sizes

By default, the toolkit measures these watchlist sizes:

- `100`
- `500`
- `1000`
- `2000`
- `5000`

You can override that with:

```bash
PERF_DATASET_SIZES=100,1000,5000 npm run perf:backend
```

or:

```bash
PERF_DATASET_SIZES=5000 npm run perf:browser
```

### Useful performance environment variables

These environment variables are optional:

| Variable | What it changes | Example |
| --- | --- | --- |
| `PERF_DATASET_SIZES` | Comma-separated dataset sizes to test instead of the defaults. | `PERF_DATASET_SIZES=1000,5000` |
| `PERF_LEGACY_PERCENTAGE` | Fraction of seeded stocks that behave like older legacy records and should need background refresh. | `PERF_LEGACY_PERCENTAGE=0.1` |
| `PERF_ANNUAL_HISTORY_SIZE` | Number of annual rows to seed per stock. | `PERF_ANNUAL_HISTORY_SIZE=7` |
| `PERF_PRICE_HISTORY_MONTHS` | Number of monthly homepage price-cache points to seed per stock. | `PERF_PRICE_HISTORY_MONTHS=72` |
| `PERF_SEED_CHUNK_SIZE` | Number of fake stocks to build and insert per chunk while seeding the large-watchlist dataset. Smaller chunks use less memory during setup. | `PERF_SEED_CHUNK_SIZE=100` |
| `PERF_DATABASE_NAME` | Overrides the default isolated MongoDB database name used by the performance scripts. This is helpful when you want a fresh benchmark database after a crashed run. | `PERF_DATABASE_NAME=stockgossipmonitor_perf_retry` |
| `PERF_BACKEND_REPEATS` | Number of repeated route calls per backend scenario. | `PERF_BACKEND_REPEATS=5` |
| `PERF_BROWSER_SCROLL_STEPS` | How many large scroll steps the browser benchmark uses to trigger progressive card activation. | `PERF_BROWSER_SCROLL_STEPS=10` |
| `PERF_BROWSER_HEADLESS=1` | Runs the browser benchmark without opening a visible browser window. | `PERF_BROWSER_HEADLESS=1` |
| `PERF_BROWSER_EXECUTABLE_PATH` | Points the benchmark at a browser executable you know can be launched locally. | `PERF_BROWSER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"` |
| `PERF_BROWSER_PREFLIGHT=1` | Tells `npm run perf:browser` to stop after the browser setup check instead of running the full benchmark. | `PERF_BROWSER_PREFLIGHT=1 npm run perf:browser` |
| `PERF_BASELINE_HARNESS` | Chooses which baseline to refresh when running `npm run perf:baseline`. | `PERF_BASELINE_HARNESS=browser` |

### Where the results go

Manual benchmark outputs are intentionally **not** committed to Git. They are written to:

- `performance-results/backend/`
- `performance-results/browser/`

The latest run is also copied to a stable filename in each folder:

- `performance-results/backend/backend-harness-latest.json`
- `performance-results/browser/browser-benchmark-latest.json`

### Where the shared baselines live

The checked-in baseline profiles live here:

- [backend-baseline.json](C:/Users/Daniel/OneDrive/organisedshare.ai/Institute%20of%20Data/2026-02-02-SE-FT-AP-A-B/institute-of-data-labs-capstone/tests/performance/baselines/backend-baseline.json)
- [browser-baseline.json](C:/Users/Daniel/OneDrive/organisedshare.ai/Institute%20of%20Data/2026-02-02-SE-FT-AP-A-B/institute-of-data-labs-capstone/tests/performance/baselines/browser-baseline.json)

Those files exist so everyone compares against the same shared reference instead of inventing their own private timing targets.

### Browser setup and troubleshooting order

The manual browser benchmark now separates three different failure types on purpose:

- **browser install problems** such as "Chromium is not installed"
- **browser launch problems** such as `spawn EPERM`, where the environment blocks starting the browser process
- **real benchmark failures after launch**, where the browser started but the app benchmark itself then failed

The benchmark tries browser candidates in this order:

1. the browser pointed to by `PERF_BROWSER_EXECUTABLE_PATH`, if you set one
2. a detected local Chrome installation
3. Playwright's bundled Chromium browser

Use this troubleshooting order:

1. Verify the Playwright package is installed:

```bash
npm install
```

2. Verify the bundled browser binary is installed:

```bash
npx playwright install chromium
```

3. Run the lightweight setup check before the real benchmark:

```bash
npm run perf:browser:check
```

4. Only run the full browser benchmark after that setup check passes:

```bash
npm run perf:browser
```

You can also ask the main browser script to stop after preflight:

```bash
PERF_BROWSER_PREFLIGHT=1 npm run perf:browser
```

Important beginner note: `spawn EPERM` means the local environment blocked launching the browser process. That is a **setup-blocked** result, not proof that the React app regressed. In other words, the browser could not even start, so the `Stocks` page benchmark never got a chance to run.

Typical outcomes are:

- `passed` = browser setup worked and the real benchmark can run
- `setup_blocked` = browser discovery or browser launch is blocked before the app benchmark starts
- `benchmark_failed` = browser setup worked, but the benchmark later failed or regressed after launch

### How baseline comparison works

This toolkit uses a **relative baseline** model, not fixed promises like "this route must always finish in 300 ms".

That means each run compares the current measurement against the checked-in baseline and asks:

- did this get slower by more than the allowed percentage?
- did memory growth get worse by more than the allowed percentage?
- did something catastrophic happen, such as a timeout, crash, or non-responsive page?

This is more realistic for local performance work because absolute timings vary from machine to machine, but **relative regressions** are still meaningful.

### What counts as a regression

For the current starter version, a scenario is treated as a regression when:

- a measured metric exceeds its baseline by more than the allowed regression percentage
- the browser benchmark can no longer progressively activate more stock cards as the user scrolls
- the first real dashboard no longer appears before legacy background refresh starts
- the first real dashboard no longer appears before legacy background refresh completes
- the harness times out, crashes, or returns invalid measurements

### Beginner metric definitions

- **First paint / first visible render**: how long it takes before the user can actually see the first useful stock card content on screen.
- **First visible shell**: how long it takes before the page shows the lightweight stock-card shell structure.
- **First visible real dashboard**: how long it takes before the first fully bootstrapped stock dashboard appears with the real chart/table scroll region.
- **First usable interaction**: how long it takes before the page is ready for a meaningful click, such as opening stock metrics.
- **Progressive activation**: whether scrolling reveals and activates more real stock dashboards later, instead of activating the whole render window immediately on first paint.
- **Route latency**: how long one backend API route takes to respond.
- **Payload size**: how many bytes came back from one API response. Larger payloads usually mean more work for both the server and the browser.
- **RSS memory**: the total memory the Node process is holding at the operating-system level.
- **Heap memory**: the JavaScript memory the process or browser is actively using for objects and arrays.
- **Repeated-run drift**: whether the same route gets steadily slower across repeated calls in the same process. This is a simple beginner-friendly signal that memory pressure or unstable work may be building up.

### What each harness measures

The backend harness measures:

- `GET /api/watchlist/summary`
- `GET /api/watchlist/dashboards`
- `GET /api/watchlist/:ticker/metrics-view`
- `POST /api/homepage/investment-category-cards/query`

It records:

- `p50` and `p95` route latency
- response payload size
- Node `rss` and `heapUsed` growth during repeated calls
- repeated-run drift

The browser benchmark measures:

- initial route load for `/stocks`
- time to first visible shell card
- time to first visible stock card
- time to first usable interaction
- whether scrolling activates more stock cards progressively instead of front-loading the whole visible render window
- browser heap growth where the browser exposes that metric
- whether legacy background refresh starts and completes after the first real dashboard instead of racing ahead of it

### Important limitation

This toolkit does **not** prove that every one of the thousands of stock cards is fully rendered immediately. That would go against the current app design.

This app is intentionally built to:

- load lightweight summary data separately from heavier dashboard data
- render only a bounded window of stock cards at first, instead of mounting the full watchlist at once
- request stock-card bootstraps in bounded queued chunks instead of one whole-watchlist payload
- lazy-load detailed metrics only when needed
- refresh legacy stocks in the background only after the first real dashboard has visibly painted
- progressively activate cards near the viewport instead of doing all possible work at once

So the large-watchlist question is:

**"Does the app stay usable, bounded, and consistent with its intended design at scale?"**

That is the question this toolkit is trying to answer.

## 7. Schema reference

Use `docs/schema-reference.md` when you want a compact developer map of the current stock document shape without reading all of the catalog source files.

Regenerate it with:

```bash
npm run docs:schema
```

## 7.5. Beginner architecture diagram

Use `docs/beginner-architecture-diagram.md` when you want a high-level, beginner-friendly view of the app's major layers, components, interfaces, and external systems.

This is the best starting point if you want to understand the system as an early planning-stage architecture rather than as a file-by-file implementation.

It now also includes a current-state user flow diagram that shows how a user moves from `Home` into shared search, watchlist navigation, and deeper `Stocks` page analysis.

## 8. Live search CLI

The live search CLI is a manual debugging tool for stock search.

Make sure your `.env` includes:

```env
ROIC_API_KEY=your_roic_api_key
```

Start the CLI:

```bash
npm run search:live
```

Example queries once the prompt is open:

```text
> AAPL
> WTC
> Apple Inc
> quit
```

## 9. Search troubleshooting

If typing a ticker such as `AAPL` into the navbar search shows a generic unavailable message, check the request path in this order:

1. Start the backend API:

```bash
npm run server
```

2. Start the Vite frontend in a second terminal:

```bash
npm run dev
```

3. Confirm the backend route works directly before debugging the UI:

```text
http://localhost:3000/api/stocks/search?q=AAPL
```

Expected result:

- a JSON payload with `query`, `queryType`, and `results`
- or a specific JSON error message such as `ROIC API key is not configured.`

4. If the browser cannot reach `/api/stocks/search`, confirm Vite is proxying `/api` to `http://localhost:3000` and that the backend is actually running on port `3000`.

5. If the backend route responds with an authentication or upstream error, verify:

- `ROIC_API_KEY` exists in `.env`
- the API key is valid
- outbound network access to `api.roic.ai` is allowed

6. MongoDB is still needed for watchlist persistence, but the read-only stock search route should still start even if MongoDB is temporarily unavailable during boot.

## 10. Frontend branch workflow

The canonical repository is this repo. The old standalone frontend repo under `C:\Users\Daniel\Downloads\frontend\institute-of-data-labs-capstone` is archival reference only.

`frontend-branch` is not a stripped-down frontend-only tree. It must carry the same tip tree as `main` whenever you want a later manual merge into `main` to be a true no-op.

### Frontend-owned paths

Treat these paths as frontend-owned on `frontend-branch`:

- `src/`
- `public/`
- `index.html`
- `vite.config.mjs`
- frontend-related sections of `package.json` and `package-lock.json`
- frontend UI tests under `src/**/__tests__` and `src/test/`

### Out-of-scope paths for frontend work

Do not modify these paths as part of frontend-only work on `frontend-branch`:

- `server.js`
- `routes/`
- `controllers/`
- `services/` except frontend-only code under `src/services/`
- `models/`
- `middleware/`
- `config/`
- `catalog/`
- repo-root `utils/`
- repo-root `tests/`
- `docs/`
- backend scripts outside frontend build tooling

### No-op merge rule

If you want `git merge frontend-branch` into `main` to change nothing:

1. First merge any real frontend work from `frontend-branch` into `main` through the normal flow.
2. Then reset or recreate `frontend-branch` from the new `main` tip.
3. Run:

```bash
npm run check:frontend-branch-sync
```

4. Only perform the manual merge after that command reports that the two branches match.

If `frontend-branch` is ahead of `main`, a manual merge is expected to change `main`.
