// This file is the single source of truth for `docs/test-and-script-overview.md`.
// If tests, scripts, or docs tooling change in a meaningful way, update the
// entries here and then regenerate the markdown file.

const TEST_AND_SCRIPT_OVERVIEW_SOURCE = {
  generatedFromPath: "scripts/test-and-script-overview-source.js",
  title: "Test And Script Overview",
  introParagraphs: [
    "This document is a beginner-friendly map of the repo's automated tests, performance tooling, manual diagnostic scripts, and documentation generators.",
    "Use it when you want the \"why does this file exist?\" explanation, not just a command list. The README still acts as the quick-reference index for commands. This doc is the longer narrative overview.",
  ],
  workflowNotes: [
    "This file is generated. Edit `scripts/test-and-script-overview-source.js` instead of editing the markdown by hand.",
    "Regenerate the markdown with `npm run docs:test-overview`.",
    "Run `npm run test:docs:test-overview` or the wider `npm run test:docs` bundle to confirm the checked-in file is up to date.",
    "A meaningful update here usually means a new test file, removed test file, renamed script, new generated-doc workflow, or a major behaviour change in an existing high-signal test suite.",
  ],
  sections: [
    {
      heading: "1. Frontend / UI automated tests",
      intro: [
        "These tests mainly live under `src/**/__tests__/` and run with Vitest plus JSDOM. They focus on browser-side state, rendering, interaction behaviour, and frontend request normalization.",
      ],
      groups: [
        {
          heading: "Shared search and page-level behaviour",
          entries: [
            {
              name: "`src/contexts/__tests__/StockSearchContext.test.jsx`",
              description: "tests the shared stock-search state used across the app. It verifies watchlist summary loading, stock add/open/remove flows, and shared search error handling.",
            },
            {
              name: "`src/components/__tests__/StockSearchResults.test.jsx`",
              description: "tests the visible search-results UI. It checks that the app shows the right action for each result, especially `SEE STOCK` for existing watchlist stocks and `ADD STOCK` for new ones.",
            },
            {
              name: "`src/components/__tests__/StockSearchResults.layout.test.jsx`",
              description: "tests the width and layout contract for the shared search-results component so it stays visually consistent across pages.",
            },
            {
              name: "`src/pages/__tests__/Home.search-results-layout.test.jsx`",
              description: "checks that the `Home` page keeps the shared search-results width and alignment correct even though the page uses a different layout wrapper from `Stocks`.",
            },
          ],
        },
        {
          heading: "Home page category cards and charts",
          entries: [
            {
              name: "`src/components/__tests__/SectorChart.test.jsx`",
              description: "tests the investment-category chart behaviour, including date ranges, preset movement, label behaviour, hover tooltip positioning, and shared scrollbar rules.",
            },
            {
              name: "`src/components/__tests__/SectorCardComponent.test.jsx`",
              description: "tests the homepage investment-category card UI. It covers constituent opening, constituent toggling, layout behaviour, default trailing-range behaviour, and related card interactions.",
            },
            {
              name: "`src/services/__tests__/investmentCategoryCardsApi.test.js`",
              description: "tests the frontend API wrapper used by the `Home` page category-card system. It checks request and response handling, normalization, and canonical initial-range behaviour.",
            },
          ],
        },
        {
          heading: "Stocks page orchestration",
          entries: [
            {
              name: "`src/pages/__tests__/Stocks.test.jsx`",
              description: "is one of the most important frontend tests in the app. It covers summary shells rendering before full dashboard bootstraps finish, the bounded initial render window, render-window growth as the user scrolls, small queued dashboard bootstrap requests, automatic queue draining after an in-flight batch settles, fresh-load progressive stock-card activation across multiple follow-up batches, deferred legacy refresh after the first visible real dashboard paint, and focused metrics mode plus restoring the full stock-card list afterwards.",
            },
            {
              name: "`src/pages/__tests__/StocksRemount.integration.test.jsx`",
              description: "is a larger integration-style UI test around `Stocks` route remount behaviour and focused-card restoration flows.",
            },
          ],
        },
        {
          heading: "Stock dashboard UI and metrics interactions",
          entries: [
            {
              name: "`src/components/__tests__/SharePriceDashboard.test.jsx`",
              description: "is the deepest frontend UI suite in the app. It covers stock chart preset behaviour and horizontal scroll syncing, lazy metrics loading, focused metrics mode, row-action menus, hide/show and bold/unbold row behaviour, override editing behaviour, currency-row display rules, section boundary rendering, tooltip behaviour, scrollbar behaviour, and several difficult React regression cases.",
            },
            {
              name: "`src/components/__tests__/sharePriceChartScale.test.jsx`",
              description: "tests stock-chart Y-axis scale logic and label formatting.",
            },
          ],
        },
        {
          heading: "Frontend service and normalization tests",
          entries: [
            {
              name: "`src/services/__tests__/watchlistDashboardApi.test.js`",
              description: "tests the frontend watchlist dashboard API layer. It covers payload normalization, default bold-row behaviour, currency rows, derived-field read-only behaviour, chunked dashboard bootstrap requests, lazy metrics loading, and row-preference update contracts.",
            },
          ],
        },
      ],
    },
    {
      heading: "2. Backend automated tests",
      intro: [
        "These tests mainly live under `tests/` and run with Node's built-in test runner. They focus on backend services, business rules, routes, startup behaviour, migration support, and generated-doc sanity checks.",
      ],
      groups: [
        {
          heading: "Backend service and business-rule tests",
          entries: [
            { name: "`tests/stock-search-service.test.js`", description: "tests the stock search service logic in isolation. It covers ticker-vs-name query handling, exchange suffix variants, fallback word broadening, duplicate merging, ranking behaviour, latest-price enrichment, and upstream error handling." },
            { name: "`tests/watchlist-dashboard-service.test.js`", description: "tests backend shaping for the `Stocks` page dashboard bootstrap payload, including row-preference loading." },
            { name: "`tests/stock-metrics-view-service.test.js`", description: "tests the backend service that shapes the detailed metrics view, including visibility rules, default bold rows, derived-field behaviour, and saved preference precedence." },
            { name: "`tests/investment-category-cards-service.test.js`", description: "tests the backend logic for building homepage investment-category card data, including price condensation, re-indexing, averaging, and default range selection." },
            { name: "`tests/import-range-behavior.test.js`", description: "tests how import range caps, annual history behaviour, earnings-release-date fallback logic, and currency normalization work during stock import." },
            { name: "`tests/roic-annual-fetch-options.test.js`", description: "tests how annual-history fetch options are sent to the external ROIC API." },
            { name: "`tests/default-bold-stock-rows.test.js`", description: "tests the shared source of truth for default-bold stock rows." },
            { name: "`tests/default-bold-stock-rows-vite.test.js`", description: "tests that the browser-facing default-bold helper still works correctly through Vite and browser module loading." },
          ],
        },
        {
          heading: "HTTP route and integration tests",
          entries: [
            { name: "`tests/frontend-api-routes.test.js`", description: "tests the read-only backend HTTP routes for stock search and stock prices. It starts the real Express app, stubs the service layer, sends real HTTP requests, and checks validation, response shape, and upstream error translation." },
            { name: "`tests/watchlist-routes.test.js`", description: "tests the watchlist-related backend routes, including the lightweight summary route, batched dashboard bootstrap route, metrics-view route, row-preference persistence, and override restrictions on derived fields." },
            { name: "`tests/investment-category-cards-routes.test.js`", description: "tests the homepage category-card routes, including aggregation, default ranges, constituent toggles, and validation." },
            { name: "`tests/lens-visibility.test.js`", description: "is an integration test for the Lens system. It seeds lens data and verifies that each investment category resolves to the expected visible fields for both card and detail surfaces." },
            { name: "`tests/missing-earnings-calls-import.test.js`", description: "tests a real edge case where the external API returns a special \"no earnings calls found\" result." },
          ],
        },
        {
          heading: "Startup, schema, migration, and doc support tests",
          entries: [
            { name: "`tests/server-startup.test.js`", description: "tests that the backend can still start and expose read-only stock search even if MongoDB is unavailable at boot." },
            { name: "`tests/watchlist-stock-model-load.test.js`", description: "is a simple model-load smoke test for the main stock model." },
            { name: "`tests/schema-reference-generator.test.js`", description: "is a sanity test for generated schema documentation. It checks that important schema-reference sections still appear and fails fast if required sections would be empty." },
            { name: "`tests/beginner-architecture-generator.test.js`", description: "is the matching sanity and stale-output test for the generated beginner architecture doc. It verifies key headings, diagram anchors, file-map anchors, and that the checked-in generated markdown matches the latest script output." },
            { name: "`tests/inspect-lens-fields.test.js`", description: "is a smoke test for the CLI lens inspection script." },
            { name: "`tests/investment-category-migration.test.js`", description: "tests investment-category migration behaviour." },
          ],
        },
      ],
    },
    {
      heading: "3. End-to-end backend workflow tests",
      intro: [
        "These tests exercise more of the real backend system at once than isolated service or route tests.",
      ],
      paragraphs: [
        "`tests/e2e-stubbed-import-crud.test.js` is a deterministic end-to-end backend test with stubbed external financial API data but real Express routes, normalization, and MongoDB persistence. It covers import, read/list, update, annual overrides, forecast overrides, top-level metric overrides, refresh, and delete.",
        "`tests/e2e-live-import-crud.test.js` is the live end-to-end backend confidence test against the real external financial API and real MongoDB. It exercises the same general workflow as the stubbed E2E test, but with live upstream data.",
        "A beginner way to think about the difference is:",
      ],
      bullets: [
        "stubbed E2E = safer, repeatable, controlled",
        "live E2E = closer to production behaviour, but dependent on real outside data",
      ],
    },
    {
      heading: "4. Performance and scalability tests",
      intro: [
        "These tools are heavier than normal correctness tests. Their job is to answer whether the app stays usable and bounded as the watchlist grows.",
      ],
      groups: [
        {
          heading: "Browser benchmark",
          entries: [
            { name: "`tests/performance/browserBenchmark.js`", description: "is the real Playwright browser benchmark used to measure how the `Stocks` page behaves under large watchlists. It measures first visible shell render, first visible real dashboard render, first usable interaction, progressive dashboard activation during scroll, browser heap growth, and whether background refresh starts too early." },
          ],
        },
        {
          heading: "Backend performance harness",
          entries: [
            { name: "`tests/performance/backendHarness.js`", description: "is the custom backend performance harness that measures route latency, payload size, heap memory growth, RSS memory growth, and repeated-run drift. It focuses on the routes most important to scale, especially watchlist and homepage category-card routes." },
          ],
        },
        {
          heading: "Performance dataset and helpers",
          entries: [
            { name: "`tests/performance/largeWatchlistDataset.js`", description: "creates deterministic large watchlist datasets for performance testing." },
            { name: "`tests/chunked-large-watchlist-seeding.test.js`", description: "tests that the chunked seeding logic works correctly and inserts the expected records." },
            { name: "`tests/performance/baselines/*.json`", description: "are the checked-in baseline files used for relative benchmark comparisons." },
          ],
          closingParagraphs: [
            "These performance tools differ from the rest of the suite because they are not mainly checking correctness. They are checking whether the app remains usable and bounded when the watchlist becomes very large.",
          ],
        },
      ],
    },
    {
      heading: "5. Manual diagnostic scripts",
      intro: [
        "These scripts are useful when a developer wants to inspect behaviour directly without always going through the full frontend.",
      ],
      groups: [
        {
          heading: "Live search CLI",
          entries: [
            { name: "`scripts/live-stock-search-cli.js`", description: "is a manual live-search harness for the backend search logic. It loads `.env`, expects a real external API key, prompts for a ticker or company name, calls the search service directly, and prints a diagnostic results table." },
          ],
          closingParagraphs: [
            "This is useful for quick manual inspection of live search behaviour, unusual or messy real-world search inputs, ranking sources, name-source diagnostics, and live upstream quirks that are hard to simulate perfectly.",
          ],
        },
        {
          heading: "Lens inspection CLI",
          entries: [
            { name: "`scripts/inspect-lens-fields.js`", description: "is a developer-facing CLI for inspecting what fields a category or stock can see under the Lens system." },
          ],
          closingParagraphs: [
            "This is useful for a fast backend-only check of visibility rules, confirming which fields belong in card vs detail view, and working without opening the frontend.",
          ],
        },
        {
          heading: "Branch sync helper",
          entries: [
            { name: "`scripts/check-frontend-branch-sync.js`", description: "is a developer utility script for checking frontend branch sync status." },
          ],
        },
        {
          heading: "Stock backfill helper",
          entries: [
            { name: "`scripts/backfill-watchlist-stocks.js`", description: "is a utility script related to watchlist stock backfill and repair work." },
          ],
        },
      ],
    },
    {
      heading: "6. Documentation tooling",
      intro: [
        "These scripts keep repo documentation aligned with real source-of-truth data instead of relying on hand-maintained docs alone.",
      ],
      groups: [
        {
          heading: "Schema reference generator",
          entries: [
            { name: "`scripts/generate-schema-reference.js`", description: "generates the schema reference from the field catalog and writes it to `docs/schema-reference.md`." },
          ],
          closingParagraphs: [
            "This is useful because it keeps documentation aligned with the actual schema source of truth and makes the stock document shape easier to browse. It summarizes field paths, source types, endpoint mappings, and category visibility.",
          ],
        },
        {
          heading: "Beginner architecture doc generator",
          entries: [
            { name: "`scripts/architecture-doc-source.js`", description: "is the structured source-of-truth module for the beginner architecture doc. When a major architecture change happens, this is the file developers edit." },
            { name: "`scripts/generate-beginner-architecture-doc.js`", description: "generates `docs/beginner-architecture-diagram.md` from that structured source module." },
            { name: "`npm run docs:architecture`", description: "is the local regeneration command for the architecture doc." },
            { name: "`npm run test:docs:architecture`", description: "runs the focused architecture-doc generator test." },
            { name: "`npm run test:docs`", description: "now runs both generated-doc checks: the schema reference generator test and the beginner architecture generator test." },
          ],
          closingParagraphs: [
            "This tooling is useful because it keeps the architecture diagram aligned with the app's current layers, flows, routes, and key file map while still giving beginners a readable high-level document.",
          ],
        },
        {
          heading: "Test and script overview doc generator",
          entries: [
            { name: "`scripts/test-and-script-overview-source.js`", description: "is the structured source-of-truth module for this document. If tests, scripts, or generated-doc workflows change in a meaningful way, this is the file to update." },
            { name: "`scripts/generate-test-and-script-overview.js`", description: "generates `docs/test-and-script-overview.md` from that structured source module." },
            { name: "`npm run docs:test-overview`", description: "is the local regeneration command for this overview doc." },
            { name: "`npm run test:docs:test-overview`", description: "runs the focused stale-output and anchor test for this overview doc." },
          ],
          closingParagraphs: [
            "This workflow is useful because the overview itself changes whenever the repo gains or removes important tests, scripts, or generated-doc tooling. The generator keeps the checked-in markdown deterministic, while the test makes sure the committed file stays aligned with the source module.",
          ],
        },
      ],
    },
  ],
};

module.exports = {
  TEST_AND_SCRIPT_OVERVIEW_SOURCE,
};
