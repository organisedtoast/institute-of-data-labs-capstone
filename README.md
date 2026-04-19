# institute-of-data-labs-capstone

## Start the app

### Prerequisites

- Node.js and npm installed
- A MongoDB connection string

### Environment variables

Create a `.env` file in the project root with:

```env
MONGO_URI=your_mongodb_connection_string
PORT=3000
```

`PORT` is optional. If it is not set, the API starts on `3000`.

### Install dependencies

```bash
npm install
```

### Run the backend API

```bash
npm run server
```

The Express server will start at `http://localhost:3000` unless you set a different `PORT`.

### Run the frontend dev server

In a second terminal, start the Vite frontend:

```bash
npm run dev
```

### Helpful scripts

- `npm run build`  
  Builds the frontend for production.

- `npm run preview`  
  Serves the built frontend locally so you can preview the production build.

- `npm run search:live`  
  Starts the interactive live stock search CLI for querying the ROIC-backed search flow from the terminal.

- `npm run test:stock-search`  
  Runs the fast service-level backend test suite for `stockSearchService`.

- `npm run test:stock-lookup-routes`  
  Runs the HTTP route/controller tests for the read-only stock lookup endpoints.

- `npm run test:backend`  
  Runs both of the fast backend suites together: stock search service tests and stock lookup route tests.

- `npm run test:e2e-stubbed`  
  Runs the deterministic end-to-end backend test with stubbed ROIC data, real normalization, and real MongoDB persistence.

- `npm run test:e2e-live`  
  Runs the live end-to-end backend test against the real ROIC API and real MongoDB. Use this as a manual confidence check.

## Backend Tests

This project has four main backend test files. Together, they answer four questions:

1. Does the stock search logic work?
2. Do the stock lookup API routes behave correctly over HTTP?
3. Does import + normalization + MongoDB work end to end with safe stubbed data?
4. Does the same flow still work against the real live ROIC API?

The test suite is layered. The smaller tests are faster and more deterministic. The larger end-to-end tests give extra confidence that the real system still works when all the pieces are connected.

### Which test should I run?

- If you changed stock search logic, run:

```bash
npm run test:stock-search
```

- If you changed the read-only stock lookup routes or controller, run:

```bash
npm run test:stock-lookup-routes
```

- If you want both of the fast backend suites together, run:

```bash
npm run test:backend
```

- If you changed import, normalization, refresh, or MongoDB persistence, run:

```bash
npm run test:e2e-stubbed
```

- If you want a manual confidence check against the real ROIC API, run:

```bash
npm run test:e2e-live
```

### 1. `tests/stock-search-service.test.js`

Purpose:
Tests `stockSearchService` by itself, without HTTP routes or MongoDB.

What it proves:
- the service can tell the difference between ticker-first searches and name-first searches
- exact ticker matching works
- exchange suffix probing works, such as checking variants like `.AX` or `.HK`
- duplicate results from different ROIC search branches are merged correctly
- result ranking stays sensible when there are strong matches and weaker fallback matches
- sparse company-name searches can broaden into fallback word variants
- partial upstream failures do not always break the whole search
- latest-price enrichment and diagnostic result ordering behave correctly

What is real:
- the real `stockSearchService` code

What is stubbed:
- the `roicService` functions

Why this matters:
This is the safest place to test search rules because the inputs are controlled and repeatable.

### 2. `tests/frontend-api-routes.test.js`

Purpose:
Tests the stock lookup API routes over real HTTP requests to the Express server.

What it proves:
- `GET /api/stocks/search` validates input and returns the expected JSON shape
- `GET /api/stock-prices/:ticker` validates ticker and month filters
- the routes normalize tickers correctly before calling the service layer
- upstream failures are turned into clean API error responses
- the lookup routes stay thin and service-driven

What is real:
- the Express app
- the mounted routes
- the controller behavior
- the HTTP request/response path

What is stubbed:
- `roicService` and `stockSearchService`
- MongoDB connect/disconnect helpers

Why this matters:
This file protects the read-only stock lookup boundary. These routes are meant for live lookup and preview, not for creating MongoDB watchlist records.

### 3. `tests/e2e-stubbed-import-crud.test.js`

Purpose:
This is the strongest deterministic end-to-end backend test. It exercises the real import and CRUD flow using stubbed ROIC data, but real Express routes, real normalization, and real MongoDB writes.

What it proves:
- `POST /api/watchlist/import` can normalize upstream data into the `WatchlistStock` schema
- imported annual rows preserve the expected overridable-field object shape
- earnings release date fallback logic works when earnings-call data is missing for a year
- imported records can be read, listed, updated, refreshed, and deleted
- user overrides still survive a refresh
- lookup routes stay read-only and do not silently create MongoDB records before import

What is real:
- Express routes and controllers
- normalization logic
- MongoDB persistence
- HTTP round-trips

What is stubbed:
- upstream ROIC responses

Why this matters:
This test gives strong confidence in the backend workflow while staying stable enough to run regularly.

### 4. `tests/e2e-live-import-crud.test.js`

Purpose:
This is the live confidence harness. It runs the same general flow as the stubbed import test, but against the real ROIC API and real MongoDB.

What it proves:
- the live import route still works end to end
- the imported document has the expected top-level structure
- CRUD still works after a live import
- refresh still works after a live import
- user overrides still survive refresh

What is real:
- Express app
- MongoDB
- ROIC API
- HTTP requests

What is stubbed:
- nothing meaningful in the backend flow

Why this matters:
This test is closest to production reality, but because it depends on live external data, it is better used as a manual confidence check than as an everyday fast feedback test.

### Real vs Stubbed at a Glance

- `stock-search-service.test.js`
  - real service logic
  - stubbed ROIC
- `frontend-api-routes.test.js`
  - real Express route/controller path
  - stubbed services and DB lifecycle
- `e2e-stubbed-import-crud.test.js`
  - real Express + normalization + MongoDB
  - stubbed ROIC
- `e2e-live-import-crud.test.js`
  - real Express + normalization + MongoDB + ROIC
  - no meaningful stubbing

### Important Backend Testing Idea

The backend has a clear boundary between:

- live stock lookup routes:
  - `GET /api/stocks/search`
  - `GET /api/stock-prices/:ticker`
- MongoDB persistence routes:
  - `POST /api/watchlist/import`
  - `POST /api/watchlist/:ticker/refresh`
  - watchlist CRUD routes

That boundary matters. Search and price preview should stay read-only. A stock should only become a MongoDB watchlist document when the app explicitly calls the import route.

## Live Search CLI

Use the interactive CLI to run live stock searches against the external API and view ticker, company name, source branch, and latest price (`date + close`).

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
