# institute-of-data-labs-capstone

This project is a beginner-friendly investment research app prototype. It combines a React frontend, an Express backend, MongoDB persistence, and an external market-data API so a user can search stocks, maintain a watchlist, view price and fundamentals dashboards, and inspect grouped investment-category cards.

If you are new to the repo, treat this README as your starter guide. It explains what the app is for, how the codebase is organized, how to run it, how to test it, and where to find deeper generated docs when you want more detail.

## Contents

- [What This App Is For](#what-this-app-is-for)
- [Main Pages](#main-pages)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment And Configuration](#environment-and-configuration)
- [Common Scripts](#common-scripts)
- [How The App Loads Data](#how-the-app-loads-data)
- [Testing Strategy](#testing-strategy)
- [Frontend Tests](#frontend-tests)
- [Backend Tests](#backend-tests)
- [Performance Toolkit](#performance-toolkit)
- [Reference Docs](#reference-docs)
- [Search And Troubleshooting](#search-and-troubleshooting)
- [Developer Workflow](#developer-workflow)

## What This App Is For

This app is trying to make equity research more organized and less stressful for an individual investor or a small team.

In plain language:

- the **frontend** is the part the user sees and clicks
- the **backend** is the server that handles routes, business logic, database access, and API calls
- an **API** is a way for one piece of software to ask another piece of software for data
- a **test runner** is the tool that automatically executes test files
- **generated docs** are markdown files built from source scripts so the documentation stays aligned with the code

The app is designed to help a user:

- search for stocks using live market-data lookup
- maintain a watchlist in MongoDB
- compare stock dashboards on the `Stocks` page
- inspect grouped investment-category cards on the `Home` page
- test changes safely with automated frontend, backend, and performance tooling

## Main Pages

### Home

The `Home` page shows investment-category cards. Each card represents a category such as a style or strategy bucket and can display:

- a category price index chart
- date-range presets
- a constituents list
- enable or disable controls for category constituents

This page is useful when you want a higher-level view of grouped stocks rather than a single stock dashboard.

### Stocks

The `Stocks` page is the deeper stock-analysis workspace. It shows watchlist stock cards with:

- share-price charts
- main financial metric tables
- detailed metrics views
- row hide and bold preferences
- lazy metrics loading
- focused single-stock mode

This page is where most of the rich stock-specific analysis happens.

## Project Structure

Here is the simple mental map of the repo:

```text
src/                    React frontend, pages, components, contexts, frontend services, UI tests
routes/                 Express route definitions
controllers/            Route controllers
services/               Backend business logic and external API adapters
models/                 Mongoose schemas and MongoDB models
config/                 Backend configuration such as DB connection
tests/                  Backend route, integration, and performance tests
docs/                   Generated reference markdown documents
scripts/                Utility scripts, doc generators, CLI tools, performance helpers
server.js               Express app entrypoint
```

Use this rule of thumb:

- if the change is about what the user sees, start in `src/`
- if the change is about routes, persistence, or upstream API behavior, start in `routes/`, `controllers/`, `services/`, or `models/`
- if you want the big-picture explanation, start in `docs/`

## Quick Start

### Prerequisites

You need:

- Node.js and npm
- a MongoDB connection string
- a ROIC API key for live stock search and live price lookup

### Install dependencies

```bash
npm install
```

### Create your `.env` file

Create a `.env` file in the project root:

```env
MONGO_URI=your_mongodb_connection_string
ROIC_API_KEY=your_roic_api_key
PORT=3000
```

`PORT` is optional. If you do not set it, the backend uses `3000`.

### Start the backend

```bash
npm run server
```

The Express API will start at `http://localhost:3000` unless you choose another port.

### Start the frontend

Open a second terminal and run:

```bash
npm run dev
```

Important beginner note: `npm run dev` starts only the Vite frontend. It does not start the backend for you. During local development, the frontend expects the backend to already be running and Vite proxies `/api/*` requests to the backend.

### Where to start first

If you want to:

- run the app: use `npm run server` and `npm run dev`
- run frontend tests: use `npm run test:ui`
- run backend tests: use `npm run test:backend`
- inspect architecture: open `docs/beginner-architecture-diagram.md`
- troubleshoot search: read [Search And Troubleshooting](#search-and-troubleshooting)

## Environment And Configuration

### Core environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `MONGO_URI` | Yes for normal app usage | Connects the backend to MongoDB for watchlist persistence and related data. |
| `ROIC_API_KEY` | Yes for live search and live market-data lookup | Authenticates requests to the external ROIC market-data API. |
| `PORT` | Optional | Chooses the backend server port. Defaults to `3000`. |

### Performance-only environment variables

These are optional and mainly matter when running the large-watchlist performance toolkit:

| Variable | What it changes |
| --- | --- |
| `PERF_DATASET_SIZES` | Comma-separated watchlist sizes to benchmark. |
| `PERF_LEGACY_PERCENTAGE` | Fraction of seeded stocks treated like older legacy records. |
| `PERF_ANNUAL_HISTORY_SIZE` | Number of annual rows to seed per stock. |
| `PERF_PRICE_HISTORY_MONTHS` | Number of monthly homepage price points to seed per stock. |
| `PERF_SEED_CHUNK_SIZE` | Number of fake stocks inserted per chunk during seeding. |
| `PERF_DATABASE_NAME` | Custom isolated MongoDB database name for performance runs. |
| `PERF_BACKEND_REPEATS` | Number of repeated backend route calls in the harness. |
| `PERF_BROWSER_SCROLL_STEPS` | Number of scroll steps in the browser benchmark. |
| `PERF_BROWSER_HEADLESS` | Runs the browser benchmark without a visible window when set. |
| `PERF_BROWSER_EXECUTABLE_PATH` | Forces the browser benchmark to use a specific local browser. |
| `PERF_BROWSER_PREFLIGHT` | Stops the browser benchmark after setup checks when set to `1`. |
| `PERF_BASELINE_HARNESS` | Chooses which baseline to refresh for `npm run perf:baseline`. |

## Common Scripts

These are the scripts a beginner is most likely to use first.

| Command | What it does | When to use it |
| --- | --- | --- |
| `npm run server` | Starts the backend API with `nodemon`. | Use when you need Express routes, MongoDB-backed watchlist features, or `/api/*` requests. |
| `npm run dev` | Starts the Vite frontend dev server. | Use while building or debugging the React UI. |
| `npm run build` | Creates a production frontend build. | Use to confirm the frontend still builds cleanly. |
| `npm run preview` | Serves the production frontend build locally. | Use after `npm run build` if you want to preview the built app. |
| `npm run lint` | Runs ESLint across the repo. | Use before commits or after larger code edits. |
| `npm run test:ui` | Runs frontend tests with Vitest. | Use for React components, frontend services, and page behavior. |
| `npm run test:ui:watch` | Runs Vitest in watch mode. | Use while actively changing frontend code. |
| `npm run test:backend` | Runs the main backend Node test bundle. | Use for a broad backend confidence check. |
| `npm run test:watchlist-routes` | Runs watchlist route integration coverage. | Use after changing the backend routes that feed the `Stocks` page. |
| `npm run test:homepage-routes` | Runs homepage category-card route coverage. | Use after changing homepage category-card route behavior. |
| `npm run test:e2e-stubbed` | Runs deterministic end-to-end backend import and CRUD coverage using stubbed upstream data. | Use when import, refresh, normalization, or persistence logic changes. |
| `npm run test:e2e-live` | Runs the live end-to-end backend harness against the real ROIC API and MongoDB. | Use as a manual confidence check when you want production-like confirmation. |
| `npm run perf:seed -- 1000` | Seeds a deterministic large-watchlist performance dataset. | Use before performance investigations at scale. |
| `npm run perf:backend` | Runs the backend performance harness. | Use to measure route latency, payload size, and Node memory behavior. |
| `npm run perf:browser:check` | Runs only the Playwright browser setup check. | Use first when browser benchmarking is failing. |
| `npm run perf:browser` | Runs the real-browser `Stocks` page benchmark. | Use when you want realistic browser-level performance results. |
| `npm run perf:baseline` | Refreshes checked-in performance baselines on purpose. | Use only when you intentionally accept a new baseline. |
| `npm run docs:schema` | Rebuilds the schema reference doc. | Use after schema or stock-document shape changes. |
| `npm run docs:architecture` | Rebuilds the beginner architecture doc. | Use after major architecture changes. |
| `npm run docs:test-overview` | Rebuilds the test and script overview doc. | Use after important testing or script workflow changes. |
| `npm run search:live` | Opens the live search CLI. | Use for manual search debugging without the frontend. |

Two useful notes:

- `npm run start` is effectively the same backend behavior as `npm run server` in this repo.
- `npm test` is only a placeholder and is not the real project test entry point.

## How The App Loads Data

The app intentionally splits lightweight state from heavier dashboard data so the user sees something useful sooner.

### Shared watchlist flow

- `GET /api/watchlist/summary` returns the lightweight stock list used by shared search state, existing-stock detection, and add or open flows.
- `GET /api/watchlist/dashboards` returns richer stock-card bootstrap data.
- the `Stocks` page renders a bounded window of shell cards first, then loads richer dashboard data in smaller queued batches

This design helps the page feel faster because it does not wait for the entire watchlist to fully bootstrap before showing anything.

### Detailed stock metrics flow

- `GET /api/watchlist/:ticker/metrics-view` is lazy
- the `Stocks` page requests it only after the user opens metrics for a stock
- `PATCH /api/watchlist/:ticker/metrics-row-preferences` stores row display choices such as hide or bold preferences

### Homepage category-card flow

- `POST /api/homepage/investment-category-cards/query` returns homepage investment-category card data
- the first load now uses the canonical latest trailing `5Y` payload so the `Home` page does not immediately re-query the same thing on mount

### Beginner UI notes

- Right click or long press a detailed-metrics row label to open row actions such as `HIDE ROW` and `BOLD` or `UNBOLD`.
- Right click or long press a main-table row label to open `BOLD` or `UNBOLD`.
- The app keeps trading currency and reporting currency as different concepts on purpose.
- Shared chart tooltips now shift inward near the chart edges so the text stays readable.

## Testing Strategy

This app uses different automated test styles because one kind of test cannot cover every risk well.

### Frontend testing

The frontend uses:

- `Vitest` as the test runner
- `Testing Library` to render components and simulate user behavior
- `JSDOM` as a fake browser so React components can run inside Node

In simple terms:

- `Vitest` runs the test files
- `Testing Library` lets the tests interact with the UI like a user
- `JSDOM` gives those tests a browser-like environment with `window`, `document`, and DOM elements

### Backend testing

The backend uses Node's built-in test runner with `node --test`.

These backend tests cover things like:

- API routes
- controller and service behavior
- CRUD flows
- investment-category lens validation
- schema and generated-doc checks

### Real-browser performance testing

The app also uses `Playwright` for browser-level performance checks. This is different from `JSDOM` because Playwright launches a real browser and can measure realistic page load, scrolling, and interaction behavior on the `Stocks` page.

## Frontend Tests

Run all frontend tests with:

```bash
npm run test:ui
```

Run one frontend test file with:

```bash
npm run test:ui -- path/to/test-file
```

### What the frontend tests cover

- chart math and helper logic
- frontend API normalization
- search context behavior
- component-level UI behavior
- page-level orchestration on `Home` and `Stocks`
- stock dashboard interactions such as presets, sticky rails, metrics mode, and row actions

### High-signal frontend test files

| File | What it is useful for |
| --- | --- |
| `src/components/__tests__/sharePriceChartScale.test.jsx` | Chart-scale math and Y-axis label behavior. |
| `src/services/__tests__/watchlistDashboardApi.test.js` | Frontend stock-dashboard API normalization and payload handling. |
| `src/services/__tests__/investmentCategoryCardsApi.test.js` | Homepage category-card API normalization and toggle request behavior. |
| `src/contexts/__tests__/StockSearchContext.test.jsx` | Shared navbar search and watchlist state behavior. |
| `src/components/__tests__/SectorChart.test.jsx` | Homepage chart rendering, presets, axis layout, and tooltip behavior. |
| `src/components/__tests__/SectorCardComponent.test.jsx` | Category-card constituent flows and canonical initial range behavior. |
| `src/components/__tests__/SharePriceDashboard.test.jsx` | Rich stock dashboard UI behavior including presets, metrics, row actions, and alignment. |
| `src/pages/__tests__/Stocks.test.jsx` | Page-level watchlist shell rendering, bootstrap queue behavior, and focused metrics mode. |

If you want the longer catalog with more narrative detail, use `docs/test-and-script-overview.md`.

## Backend Tests

Run the main backend bundle with:

```bash
npm run test:backend
```

Run one backend test file directly with:

```bash
node --test tests/stock-search-service.test.js
```

### What the backend tests cover

- stock search service logic
- frontend-facing stock search routes
- server startup behavior
- investment-category lens validation
- watchlist route behavior
- homepage category-card route behavior
- stubbed and live import and CRUD flows
- generated-doc freshness checks

### High-signal backend commands

| Command | What it checks |
| --- | --- |
| `npm run test:backend` | Main fast backend confidence bundle. |
| `npm run test:watchlist-routes` | Watchlist summary and dashboard route integration behavior. |
| `npm run test:homepage-routes` | Homepage investment-category-card route behavior. |
| `npm run test:lenses` | Investment-category lens visibility validation. |
| `npm run test:e2e-stubbed` | Deterministic backend import and CRUD workflow using stubbed upstream data. |
| `npm run test:e2e-live` | Production-like live backend import and CRUD workflow. |
| `npm run test:docs` | Generated-doc stale checks. |

Why use the Node test runner here instead of only Postman, Insomnia, or Thunder Client? Because automated backend tests are repeatable, live in the repo, and help catch regressions every time code changes instead of relying on manual clicking.

## Performance Toolkit

This repo includes a dedicated large-watchlist performance toolkit because the `Stocks` page needs to stay usable even when the watchlist becomes very large.

The toolkit has two parts:

- a backend harness for route latency, payload size, and Node memory behavior
- a Playwright real-browser benchmark for the `Stocks` page

Both parts use deterministic seeded data instead of live ROIC data so runs stay more repeatable.

### Main performance commands

```bash
npm run perf:seed -- 1000
npm run perf:backend
npm run perf:browser:check
npm run perf:browser
npm run perf:baseline
```

### Supported default dataset sizes

By default, the toolkit measures:

- `100`
- `500`
- `1000`
- `2000`
- `5000`

### Where performance results go

Performance outputs are written to:

- `performance-results/backend/`
- `performance-results/browser/`

Shared baseline files live in:

- `tests/performance/baselines/backend-baseline.json`
- `tests/performance/baselines/browser-baseline.json`

Important beginner note: performance testing answers questions like "does the app still stay usable at scale?" It is not mainly checking financial-data correctness.

## Reference Docs

The repo includes generated markdown docs for deeper technical reading.

### Schema reference

Use `docs/schema-reference.md` when you want a compact map of the stock document shape.

Regenerate it with:

```bash
npm run docs:schema
```

### Beginner architecture diagram

Use `docs/beginner-architecture-diagram.md` when you want a high-level view of the app's layers, user flow, and major moving parts.

Regenerate it with:

```bash
npm run docs:architecture
```

### Test and script overview

Use `docs/test-and-script-overview.md` when you want the longer explanation of test suites, performance tools, manual diagnostics, and doc-generation workflows.

Regenerate it with:

```bash
npm run docs:test-overview
```

### Auto-updating doc workflow

These docs are designed to be regenerated from source scripts instead of being hand-maintained forever.

Edit these source files when the underlying behavior changes:

- `scripts/generate-schema-reference.js`
- `scripts/architecture-doc-source.js`
- `scripts/test-and-script-overview-source.js`

After regenerating docs, use:

```bash
npm run test:docs
```

That stale-doc test bundle is the enforcement path that helps stop generated docs from quietly drifting out of date.

## Search And Troubleshooting

### Live search CLI

The live search CLI is a manual debugging tool for stock search.

Start it with:

```bash
npm run search:live
```

Example queries:

```text
> AAPL
> WTC
> Apple Inc
> quit
```

### Navbar search troubleshooting order

If a ticker search such as `AAPL` is failing in the navbar, check the path in this order:

1. Start the backend:

```bash
npm run server
```

2. Start the frontend in a second terminal:

```bash
npm run dev
```

3. Test the backend route directly:

```text
http://localhost:3000/api/stocks/search?q=AAPL
```

4. If the route fails, check:

- `ROIC_API_KEY` exists in `.env`
- the API key is valid
- outbound network access to `api.roic.ai` is allowed

5. If the browser cannot reach `/api/stocks/search`, confirm Vite is proxying `/api` to the backend and the backend is actually running on the expected port.

Important note: MongoDB is still needed for normal watchlist persistence, but the read-only stock search route can still start even if MongoDB is temporarily unavailable during boot.

## Developer Workflow

The canonical repo is this repo. The older standalone frontend repo under `C:\Users\Daniel\Downloads\frontend\institute-of-data-labs-capstone` is archival reference only.

`frontend-branch` is expected to match `main` whenever you want a later manual merge into `main` to be a true no-op.

### Frontend-owned paths

Treat these paths as frontend-owned on `frontend-branch`:

- `src/`
- `public/`
- `index.html`
- `vite.config.mjs`
- frontend-related sections of `package.json` and `package-lock.json`
- frontend UI tests under `src/**/__tests__` and `src/test/`

### Out-of-scope paths for frontend-only work

Do not modify these as part of frontend-only branch work:

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

### No-op merge check

If you want `git merge frontend-branch` into `main` to change nothing:

1. merge the real frontend work into `main` first
2. reset or recreate `frontend-branch` from the new `main` tip
3. run:

```bash
npm run check:frontend-branch-sync
```

4. only do the manual merge after that command confirms the branches match
