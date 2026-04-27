# Test And Script Overview

> Generated from [`scripts/test-and-script-overview-source.js`](../scripts/test-and-script-overview-source.js). Edit the source module, not this markdown. Regenerate with `npm run docs:test-overview`.

This document is a beginner-friendly map of the repo's automated tests, performance tooling, manual diagnostic scripts, and documentation generators.
Use it when you want the "why does this file exist?" explanation, not just a command list. The README still acts as the quick-reference index for commands. This doc is the longer narrative overview.

## How this doc stays updated

- This file is generated. Edit `scripts/test-and-script-overview-source.js` instead of editing the markdown by hand.
- Regenerate the markdown with `npm run docs:test-overview`.
- Run `npm run test:docs:test-overview` or the wider `npm run test:docs` bundle to confirm the checked-in file is up to date.
- A meaningful update here usually means a new test file, removed test file, renamed script, new generated-doc workflow, or a major behaviour change in an existing high-signal test suite.

## 1. Frontend / UI automated tests

These tests mainly live under `src/**/__tests__/` and run with Vitest plus JSDOM. They focus on browser-side state, rendering, interaction behaviour, and frontend request normalization.

### Shared search and page-level behaviour

`src/contexts/__tests__/StockSearchContext.test.jsx` tests the shared stock-search state used across the app. It verifies watchlist summary loading, stock add/open/remove flows, and shared search error handling.

`src/components/__tests__/StockSearchResults.test.jsx` tests the visible search-results UI. It checks that the app shows the right action for each result, especially `SEE STOCK` for existing watchlist stocks and `ADD STOCK` for new ones.

`src/components/__tests__/StockSearchResults.layout.test.jsx` tests the width and layout contract for the shared search-results component so it stays visually consistent across pages.

`src/pages/__tests__/Home.search-results-layout.test.jsx` checks that the `Home` page keeps the shared search-results width and alignment correct even though the page uses a different layout wrapper from `Stocks`.

### Home page category cards and charts

`src/components/__tests__/SectorChart.test.jsx` tests the investment-category chart behaviour, including date ranges, preset movement, label behaviour, hover tooltip positioning, and shared scrollbar rules.

`src/components/__tests__/SectorCardComponent.test.jsx` tests the homepage investment-category card UI. It covers constituent opening, constituent toggling, layout behaviour, default trailing-range behaviour, and related card interactions.

`src/services/__tests__/investmentCategoryCardsApi.test.js` tests the frontend API wrapper used by the `Home` page category-card system. It checks request and response handling, normalization, and canonical initial-range behaviour.

### Stocks page orchestration

`src/pages/__tests__/Stocks.test.jsx` is one of the most important frontend tests in the app. It covers summary shells rendering before full dashboard bootstraps finish, the bounded initial render window, render-window growth as the user scrolls, small queued dashboard bootstrap requests, automatic queue draining after an in-flight batch settles, fresh-load progressive stock-card activation across multiple follow-up batches, deferred legacy refresh after the first visible real dashboard paint, and focused metrics mode plus restoring the full stock-card list afterwards.

`src/pages/__tests__/StocksRemount.integration.test.jsx` is a larger integration-style UI test around `Stocks` route remount behaviour and focused-card restoration flows.

### Stock dashboard UI and metrics interactions

`src/components/__tests__/SharePriceDashboard.test.jsx` is the deepest frontend UI suite in the app. It covers stock chart preset behaviour and horizontal scroll syncing, lazy metrics loading, focused metrics mode, row-action menus, hide/show and bold/unbold row behaviour, override editing behaviour, currency-row display rules, section boundary rendering, tooltip behaviour, scrollbar behaviour, and several difficult React regression cases.

`src/components/__tests__/sharePriceChartScale.test.jsx` tests stock-chart Y-axis scale logic and label formatting.

### Frontend service and normalization tests

`src/services/__tests__/watchlistDashboardApi.test.js` tests the frontend watchlist dashboard API layer. It covers payload normalization, default bold-row behaviour, currency rows, derived-field read-only behaviour, chunked dashboard bootstrap requests, lazy metrics loading, and row-preference update contracts.

## 2. Backend automated tests

These tests mainly live under `tests/` and run with Node's built-in test runner. They focus on backend services, business rules, routes, startup behaviour, migration support, and generated-doc sanity checks.

### Backend service and business-rule tests

`tests/stock-search-service.test.js` tests the stock search service logic in isolation. It covers ticker-vs-name query handling, exchange suffix variants, fallback word broadening, duplicate merging, ranking behaviour, latest-price enrichment, and upstream error handling.

`tests/watchlist-dashboard-service.test.js` tests backend shaping for the `Stocks` page dashboard bootstrap payload, including row-preference loading.

`tests/stock-metrics-view-service.test.js` tests the backend service that shapes the detailed metrics view, including visibility rules, default bold rows, derived-field behaviour, and saved preference precedence.

`tests/investment-category-cards-service.test.js` tests the backend logic for building homepage investment-category card data, including price condensation, re-indexing, averaging, and default range selection.

`tests/import-range-behavior.test.js` tests how import range caps, annual history behaviour, earnings-release-date fallback logic, and currency normalization work during stock import.

`tests/roic-annual-fetch-options.test.js` tests how annual-history fetch options are sent to the external ROIC API.

`tests/default-bold-stock-rows.test.js` tests the shared source of truth for default-bold stock rows.

`tests/default-bold-stock-rows-vite.test.js` tests that the browser-facing default-bold helper still works correctly through Vite and browser module loading.

### HTTP route and integration tests

`tests/frontend-api-routes.test.js` tests the read-only backend HTTP routes for stock search and stock prices. It starts the real Express app, stubs the service layer, sends real HTTP requests, and checks validation, response shape, and upstream error translation.

`tests/watchlist-routes.test.js` tests the watchlist-related backend routes, including the lightweight summary route, batched dashboard bootstrap route, metrics-view route, row-preference persistence, and override restrictions on derived fields.

`tests/investment-category-cards-routes.test.js` tests the homepage category-card routes, including aggregation, default ranges, constituent toggles, and validation.

`tests/lens-visibility.test.js` is an integration test for the Lens system. It seeds lens data and verifies that each investment category resolves to the expected visible fields for both card and detail surfaces.

`tests/missing-earnings-calls-import.test.js` tests a real edge case where the external API returns a special "no earnings calls found" result.

### Startup, schema, migration, and doc support tests

`tests/server-startup.test.js` tests that the backend can still start and expose read-only stock search even if MongoDB is unavailable at boot.

`tests/watchlist-stock-model-load.test.js` is a simple model-load smoke test for the main stock model.

`tests/schema-reference-generator.test.js` is a sanity test for generated schema documentation. It checks that important schema-reference sections still appear and fails fast if required sections would be empty.

`tests/beginner-architecture-generator.test.js` is the matching sanity and stale-output test for the generated beginner architecture doc. It verifies key headings, diagram anchors, file-map anchors, and that the checked-in generated markdown matches the latest script output.

`tests/inspect-lens-fields.test.js` is a smoke test for the CLI lens inspection script.

`tests/investment-category-migration.test.js` tests investment-category migration behaviour.

## 3. End-to-end backend workflow tests

These tests exercise more of the real backend system at once than isolated service or route tests.

`tests/e2e-stubbed-import-crud.test.js` is a deterministic end-to-end backend test with stubbed external financial API data but real Express routes, normalization, and MongoDB persistence. It covers import, read/list, update, annual overrides, forecast overrides, top-level metric overrides, refresh, and delete.

`tests/e2e-live-import-crud.test.js` is the live end-to-end backend confidence test against the real external financial API and real MongoDB. It exercises the same general workflow as the stubbed E2E test, but with live upstream data.

A beginner way to think about the difference is:

- stubbed E2E = safer, repeatable, controlled
- live E2E = closer to production behaviour, but dependent on real outside data

## 4. Performance and scalability tests

These tools are heavier than normal correctness tests. Their job is to answer whether the app stays usable and bounded as the watchlist grows.

### Browser benchmark

`tests/performance/browserBenchmark.js` is the real Playwright browser benchmark used to measure how the `Stocks` page behaves under large watchlists. It measures first visible shell render, first visible real dashboard render, first usable interaction, progressive dashboard activation during scroll, browser heap growth, and whether background refresh starts too early.

### Backend performance harness

`tests/performance/backendHarness.js` is the custom backend performance harness that measures route latency, payload size, heap memory growth, RSS memory growth, and repeated-run drift. It focuses on the routes most important to scale, especially watchlist and homepage category-card routes.

### Performance dataset and helpers

`tests/performance/largeWatchlistDataset.js` creates deterministic large watchlist datasets for performance testing.

`tests/chunked-large-watchlist-seeding.test.js` tests that the chunked seeding logic works correctly and inserts the expected records.

`tests/performance/baselines/*.json` are the checked-in baseline files used for relative benchmark comparisons.

These performance tools differ from the rest of the suite because they are not mainly checking correctness. They are checking whether the app remains usable and bounded when the watchlist becomes very large.

## 5. Manual diagnostic scripts

These scripts are useful when a developer wants to inspect behaviour directly without always going through the full frontend.

### Live search CLI

`scripts/live-stock-search-cli.js` is a manual live-search harness for the backend search logic. It loads `.env`, expects a real external API key, prompts for a ticker or company name, calls the search service directly, and prints a diagnostic results table.

This is useful for quick manual inspection of live search behaviour, unusual or messy real-world search inputs, ranking sources, name-source diagnostics, and live upstream quirks that are hard to simulate perfectly.

### Lens inspection CLI

`scripts/inspect-lens-fields.js` is a developer-facing CLI for inspecting what fields a category or stock can see under the Lens system.

This is useful for a fast backend-only check of visibility rules, confirming which fields belong in card vs detail view, and working without opening the frontend.

### Branch sync helper

`scripts/check-frontend-branch-sync.js` is a developer utility script for checking frontend branch sync status.

### Stock backfill helper

`scripts/backfill-watchlist-stocks.js` is a utility script related to watchlist stock backfill and repair work.

## 6. Documentation tooling

These scripts keep repo documentation aligned with real source-of-truth data instead of relying on hand-maintained docs alone.

### Schema reference generator

`scripts/generate-schema-reference.js` generates the schema reference from the field catalog and writes it to `docs/schema-reference.md`.

This is useful because it keeps documentation aligned with the actual schema source of truth and makes the stock document shape easier to browse. It summarizes field paths, source types, endpoint mappings, and category visibility.

### Beginner architecture doc generator

`scripts/architecture-doc-source.js` is the structured source-of-truth module for the beginner architecture doc. When a major architecture change happens, this is the file developers edit.

`scripts/generate-beginner-architecture-doc.js` generates `docs/beginner-architecture-diagram.md` from that structured source module.

`npm run docs:architecture` is the local regeneration command for the architecture doc.

`npm run test:docs:architecture` runs the focused architecture-doc generator test.

`npm run test:docs` now runs both generated-doc checks: the schema reference generator test and the beginner architecture generator test.

This tooling is useful because it keeps the architecture diagram aligned with the app's current layers, flows, routes, and key file map while still giving beginners a readable high-level document.

### Test and script overview doc generator

`scripts/test-and-script-overview-source.js` is the structured source-of-truth module for this document. If tests, scripts, or generated-doc workflows change in a meaningful way, this is the file to update.

`scripts/generate-test-and-script-overview.js` generates `docs/test-and-script-overview.md` from that structured source module.

`npm run docs:test-overview` is the local regeneration command for this overview doc.

`npm run test:docs:test-overview` runs the focused stale-output and anchor test for this overview doc.

This workflow is useful because the overview itself changes whenever the repo gains or removes important tests, scripts, or generated-doc tooling. The generator keeps the checked-in markdown deterministic, while the test makes sure the committed file stays aligned with the source module.
