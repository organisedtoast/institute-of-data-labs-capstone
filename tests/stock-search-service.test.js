require("dotenv").config();

const assert = require("node:assert/strict");
const test = require("node:test");

const roicService = require("../services/roicService");
const stockSearchService = require("../services/stockSearchService");

// This file tests the backend stock-search service in isolation.
// The goal is to prove that stockSearchService can:
// - classify a search as ticker-first or name-first
// - confirm exact tickers and exchange-suffixed ticker variants
// - merge and rank search results from several ROIC lookup branches
// - broaden sparse company-name searches with fallback word variants
// - tolerate partial upstream failures without losing all results
// - enrich already-chosen results with the latest price for diagnostics
//
// IMPORTANT:
// We do NOT call the real ROIC API in these tests. Instead, each test replaces
// roicService functions with tiny fake responses so we can focus on one rule at
// a time and keep the tests deterministic.
//
// Ticker guide used in this file:
// - Exact + suffix confirmation: FLT, FLT.AX, GNC.AX, ABC, ABC.V, 9888.HK
// - Ticker-first ranking and loose fills: 9988.HK, BABA, GNC.AX, GNCP, AGNC
// - Name-first searches and broadening: GOOGL, AAA-AAJ, ALPHX, FROG, FROG.NS, BFRG, LFAC, LFACW, UHN, 6018.T, 6022.T, XTRM
// - Price enrichment / diagnostics: AAPL, MSFT
// - Error / partial-failure scenarios: NVDA and synthetic rows such as AAA, BBB, CCC, DDD, XYZ, XZZ, BNKA, BNKZ
// - Large suffix candidate generation example: WTC plus many exchange variants such as WTC.AX and WTC.TO

const originalMethods = {
  fetchCompanyProfile: roicService.fetchCompanyProfile,
  fetchStockPrices: roicService.fetchStockPrices,
  searchRoicByCompanyName: roicService.searchRoicByCompanyName,
};

test.afterEach(() => {
  Object.assign(roicService, originalMethods);
});

// These first tests cover the "ticker confirmation" side of the service:
// exact ticker hits, exchange-suffixed variants, and what to do when profile
// naming is missing or weaker than another ROIC source.
test("searchStocks uses ROIC profile names for exact and suffix ticker matches", async () => {
  roicService.fetchStockPrices = async (ticker, options) => {
    assert.deepEqual(options, {
      order: "DESC",
      limit: 1,
    });

    if (ticker === "FLT" || ticker === "FLT.AX") {
      return [{ date: "2024-04-16", close: 298.73 }];
    }

    return [];
  };

  roicService.fetchCompanyProfile = async (ticker) => {
    if (ticker === "FLT") {
      return {
        company_name: "FLEETCOR Technologies, Inc.",
        exchange_short_name: "NYSE",
        exchange: "New York Stock Exchange",
      };
    }

    if (ticker === "FLT.AX") {
      return {
        company_name: "Flight Centre Travel Group Limited",
        exchange_short_name: "ASX",
        exchange: "Australian Securities Exchange",
      };
    }

    throw new Error(`Unexpected profile lookup for ${ticker}`);
  };

  roicService.searchRoicByCompanyName = async () => {
    return [];
  };

  const response = await stockSearchService.searchStocks("FLT");

  assert.equal(response.queryType, "ticker-or-name");
  assert.deepEqual(response.results, [
    {
      identifier: "FLT",
      name: "FLEETCOR Technologies, Inc.",
      exchange: "NYSE",
      exchangeName: "New York Stock Exchange",
      type: "stock",
      nameSource: "profile",
      isFallbackName: false,
    },
    {
      identifier: "FLT.AX",
      name: "Flight Centre Travel Group Limited",
      exchange: "ASX",
      exchangeName: "Australian Securities Exchange",
      type: "stock",
      nameSource: "profile",
      isFallbackName: false,
    },
  ]);
});

test("searchStocks keeps a valid ticker as a visible fallback when profile naming fails", async () => {
  roicService.fetchStockPrices = async (ticker) => {
    if (ticker === "GNC.AX") {
      return [{ date: "2026-04-14", close: 6.56 }];
    }

    return [];
  };

  roicService.fetchCompanyProfile = async () => {
    const error = new Error("profile unavailable");
    error.response = {
      status: 503,
      data: { message: "profile unavailable" },
    };
    throw error;
  };

  roicService.searchRoicByCompanyName = async () => {
    return [];
  };

  const response = await stockSearchService.searchStocks("GNC");

  assert.deepEqual(response.results, [
    {
      identifier: "GNC.AX",
      name: "GNC.AX",
      exchange: "",
      exchangeName: "",
      type: "stock",
      nameSource: "ticker-fallback",
      isFallbackName: true,
    },
  ]);
});

test("searchStocks prefers stronger ROIC naming sources over ticker fallback duplicates", async () => {
  roicService.fetchStockPrices = async (ticker) => {
    if (ticker === "FLT") {
      return [{ date: "2024-04-16", close: 298.73 }];
    }

    return [];
  };

  roicService.fetchCompanyProfile = async () => {
    const error = new Error("profile unavailable");
    error.response = {
      status: 503,
      data: { message: "profile unavailable" },
    };
    throw error;
  };

  roicService.searchRoicByCompanyName = async () => {
    return [
      {
        symbol: "FLT",
        name: "FLEETCOR Technologies, Inc.",
        exchange: "NYSE",
        exchange_name: "New York Stock Exchange",
        type: "stock",
      },
    ];
  };

  const response = await stockSearchService.searchStocks("FLT");

  assert.deepEqual(response.results[0], {
    identifier: "FLT",
    name: "FLEETCOR Technologies, Inc.",
    exchange: "NYSE",
    exchangeName: "New York Stock Exchange",
    type: "stock",
    nameSource: "company-search",
    isFallbackName: false,
  });
});

test("ticker-like queries drop weak incidental company-name matches but keep strong prefix and dotted matches", async () => {
  const filteredResults = stockSearchService.filterCompanySearchResults(
    "GNC",
    [
      {
        identifier: "AGNC",
        name: "AGNC Investment Corp.",
        exchange: "NASDAQ",
        exchangeName: "NASDAQ",
        type: "stock",
        nameSource: "company-search",
        isFallbackName: false,
      },
      {
        identifier: "GNC.AX",
        name: "GrainCorp Limited",
        exchange: "ASX",
        exchangeName: "Australian Securities Exchange",
        type: "stock",
        nameSource: "company-search",
        isFallbackName: false,
      },
      {
        identifier: "GNCP",
        name: "GNCC Capital, Inc.",
        exchange: "OTC",
        exchangeName: "Other OTC",
        type: "stock",
        nameSource: "company-search",
        isFallbackName: false,
      },
    ],
    {
      mode: "ticker-first",
    },
  );

  assert.deepEqual(filteredResults, [
    {
      identifier: "GNC.AX",
      name: "GrainCorp Limited",
      exchange: "ASX",
      exchangeName: "Australian Securities Exchange",
      type: "stock",
      nameSource: "company-search",
      isFallbackName: false,
    },
    {
      identifier: "GNCP",
      name: "GNCC Capital, Inc.",
      exchange: "OTC",
      exchangeName: "Other OTC",
      type: "stock",
      nameSource: "company-search",
      isFallbackName: false,
    },
  ]);
});

test("ticker-first splitting keeps strong matches separate from looser company-name fill matches", () => {
  const { strongMatches, looseMatches } = stockSearchService.splitTickerFirstCompanySearchResults(
    "9988",
    [
      {
        identifier: "9988.HK",
        name: "Alibaba Group Holding Limited",
      },
      {
        identifier: "BABA",
        name: "Alibaba 9988 Tracking Basket",
      },
      {
        identifier: "XYZ",
        name: "Unrelated Company",
      },
    ],
  );

  assert.deepEqual(
    strongMatches.map((result) => result.identifier),
    ["9988.HK"],
  );
  assert.deepEqual(
    looseMatches.map((result) => result.identifier),
    ["BABA"],
  );
});

test("query classification uses ticker-first only for clearly all-caps ticker input", () => {
  assert.equal(stockSearchService.isTickerFirstQuery("AAPL"), true);
  assert.equal(stockSearchService.isTickerFirstQuery("9888"), true);
  assert.equal(stockSearchService.isTickerFirstQuery("Alpha"), false);
  assert.equal(stockSearchService.isTickerFirstQuery("Oil"), false);
  assert.equal(stockSearchService.isTickerFirstQuery(""), false);
});

// This section checks ticker-first behavior:
// when a query looks like a symbol, the service should probe common exchange
// suffixes and keep strong ticker-style matches above looser company-name fills.
test("buildTickerVariantCandidates includes the expanded deterministic suffix set", () => {
  assert.deepEqual(stockSearchService.buildTickerVariantCandidates("WTC"), [
    "WTC.AX",
    "WTC.AS",
    "WTC.L",
    "WTC.TO",
    "WTC.NZ",
    "WTC.HK",
    "WTC.T",
    "WTC.KS",
    "WTC.V",
    "WTC.NE",
    "WTC.NS",
    "WTC.BO",
    "WTC.SZ",
    "WTC.SS",
    "WTC.TW",
    "WTC.SI",
    "WTC.SA",
    "WTC.JO",
    "WTC.PA",
    "WTC.BR",
    "WTC.DE",
    "WTC.F",
    "WTC.SW",
    "WTC.ST",
    "WTC.HE",
    "WTC.CO",
    "WTC.OL",
    "WTC.MC",
    "WTC.MI",
    "WTC.WA",
  ]);
});

test("buildWordSearchFallbackQueries creates deterministic stem and fuzzy variants for sparse word queries", () => {
  assert.deepEqual(stockSearchService.buildWordSearchFallbackQueries("diesel"), [
    "diesels",
    "diese",
    "dies",
  ]);
  assert.deepEqual(stockSearchService.buildWordSearchFallbackQueries("frog"), [
    "frogs",
    "fro",
  ]);
});

test("searchStocks uses suffix variant probing for ticker-first queries", async () => {
  const priceLookupTickers = [];

  roicService.fetchStockPrices = async (ticker) => {
    priceLookupTickers.push(ticker);

    if (ticker === "ABC" || ticker === "ABC.V") {
      return [{ date: "2026-04-14", close: 12.34 }];
    }

    return [];
  };

  roicService.fetchCompanyProfile = async (ticker) => {
    if (ticker === "ABC") {
      return {
        company_name: "ABC Holdings",
        exchange_short_name: "NYSE",
        exchange: "New York Stock Exchange",
      };
    }

    if (ticker === "ABC.V") {
      return {
        company_name: "ABC Venture Corp",
        exchange_short_name: "TSXV",
        exchange: "TSX Venture Exchange",
      };
    }

    throw new Error(`Unexpected profile lookup for ${ticker}`);
  };

  roicService.searchRoicByCompanyName = async () => [];

  const response = await stockSearchService.searchStocks("ABC");

  assert.equal(response.queryType, "ticker-or-name");
  assert.equal(priceLookupTickers.includes("ABC.V"), true);
  assert.equal(
    response.results.some((result) => result.identifier === "ABC.V" && result.name === "ABC Venture Corp"),
    true,
  );
});

test("searchStocks uses suffix variant probing for numeric ticker queries", async () => {
  const priceLookupTickers = [];

  roicService.fetchStockPrices = async (ticker) => {
    priceLookupTickers.push(ticker);

    if (ticker === "9888.HK") {
      return [{ date: "2026-04-14", close: 103.5 }];
    }

    return [];
  };

  roicService.fetchCompanyProfile = async (ticker) => {
    if (ticker === "9888.HK") {
      return {
        company_name: "Baidu, Inc.",
        exchange_short_name: "HKEX",
        exchange: "Hong Kong Exchange",
      };
    }

    throw new Error(`Unexpected profile lookup for ${ticker}`);
  };

  roicService.searchRoicByCompanyName = async () => [];

  const response = await stockSearchService.searchStocks("9888");

  assert.equal(response.queryType, "ticker-or-name");
  assert.equal(priceLookupTickers.includes("9888.HK"), true);
  assert.equal(
    response.results.some((result) => result.identifier === "9888.HK" && result.name === "Baidu, Inc."),
    true,
  );
});

test("searchStocks fills spare ticker-first slots with looser company-name results while keeping the ticker hit first", async () => {
  roicService.fetchStockPrices = async (ticker) => {
    if (ticker === "9988.HK" || ticker === "BABA") {
      return [{ date: "2026-04-15", close: 100 }];
    }

    return [];
  };

  roicService.fetchCompanyProfile = async (ticker) => {
    if (ticker === "9988.HK") {
      return {
        company_name: "Alibaba Group Holding Limited",
        exchange_short_name: "HKEX",
        exchange: "Hong Kong Exchange",
      };
    }

    throw new Error(`Unexpected profile lookup for ${ticker}`);
  };

  roicService.searchRoicByCompanyName = async () => [
    {
      symbol: "9988.HK",
      name: "Alibaba Group Holding Limited",
      exchange: "HKEX",
      exchange_name: "Hong Kong Exchange",
      type: "stock",
    },
    {
      symbol: "BABA",
      name: "Alibaba 9988 ADR",
      exchange: "NYSE",
      exchange_name: "New York Stock Exchange",
      type: "stock",
    },
  ];

  const response = await stockSearchService.searchStocks("9988");

  assert.deepEqual(
    response.results.map((result) => result.identifier),
    ["9988.HK", "BABA"],
  );
});

test("looser ticker-first fill results do not outrank exact or suffix-confirmed hits even with strong price data", async () => {
  const response = stockSearchService.sortResultsWithPricePreference("9988", [
    {
      identifier: "BABA",
      name: "Alibaba 9988 ADR",
      priceStatus: "ok",
      searchTier: 4,
    },
    {
      identifier: "9988.HK",
      name: "Alibaba Group Holding Limited",
      priceStatus: "not-found",
      searchTier: 2,
    },
  ]);

  assert.deepEqual(
    response.map((result) => result.identifier),
    ["9988.HK", "BABA"],
  );
});

test("ticker-first searches deduplicate loose company-name fills against stronger ticker hits", async () => {
  roicService.fetchStockPrices = async (ticker) => {
    if (ticker === "9988.HK") {
      return [{ date: "2026-04-15", close: 100 }];
    }

    return [];
  };

  roicService.fetchCompanyProfile = async (ticker) => {
    if (ticker === "9988.HK") {
      return {
        company_name: "Alibaba Group Holding Limited",
        exchange_short_name: "HKEX",
        exchange: "Hong Kong Exchange",
      };
    }

    throw new Error(`Unexpected profile lookup for ${ticker}`);
  };

  roicService.searchRoicByCompanyName = async () => [
    {
      symbol: "9988.HK",
      name: "Alibaba 9988 ADR",
      exchange: "HKEX",
      exchange_name: "Hong Kong Exchange",
      type: "stock",
    },
  ];

  const response = await stockSearchService.searchStocks("9988");

  assert.deepEqual(
    response.results.map((result) => result.identifier),
    ["9988.HK"],
  );
});

test("searchStocks skips suffix variant probing for name-first queries", async () => {
  const priceLookupTickers = [];

  roicService.fetchStockPrices = async (ticker) => {
    priceLookupTickers.push(ticker);
    return [];
  };

  roicService.searchRoicByCompanyName = async () => [
    {
      symbol: "GOOGL",
      name: "Alphabet Inc.",
      exchange: "NASDAQ",
      exchange_name: "NASDAQ",
      type: "stock",
    },
  ];

  const response = await stockSearchService.searchStocks("Alpha");

  assert.equal(response.queryType, "name");
  assert.equal(priceLookupTickers[0], "ALPHA");
  assert.equal(priceLookupTickers.filter((ticker) => ticker === "GOOGL").length >= 1, true);
  assert.deepEqual(response.results, [
    {
      identifier: "GOOGL",
      name: "Alphabet Inc.",
      exchange: "NASDAQ",
      exchangeName: "NASDAQ",
      type: "stock",
      nameSource: "company-search",
      isFallbackName: false,
    },
  ]);
});

test("searchStocks normalizes lowercase dotted tickers through the exact ticker branch", async () => {
  const priceLookupTickers = [];

  roicService.fetchStockPrices = async (ticker) => {
    priceLookupTickers.push(ticker);

    if (ticker === "BHP.AX") {
      return [{ date: "2026-04-15", close: 42.5 }];
    }

    return [];
  };

  roicService.fetchCompanyProfile = async (ticker) => {
    if (ticker === "BHP.AX") {
      return {
        company_name: "BHP Group Limited",
        exchange_short_name: "ASX",
        exchange: "Australian Securities Exchange",
      };
    }

    throw new Error(`Unexpected profile lookup for ${ticker}`);
  };

  roicService.searchRoicByCompanyName = async () => [];

  const response = await stockSearchService.searchStocks("bhp.ax");

  assert.equal(priceLookupTickers[0], "BHP.AX");
  assert.deepEqual(response.results, [
    {
      identifier: "BHP.AX",
      name: "BHP Group Limited",
      exchange: "ASX",
      exchangeName: "Australian Securities Exchange",
      type: "stock",
      nameSource: "profile",
      isFallbackName: false,
    },
  ]);
});

test("countPreferredBroadResults counts stocks and funds but excludes warrants and units from the fill threshold", () => {
  assert.equal(
    stockSearchService.countPreferredBroadResults([
      { identifier: "AAA", name: "Alpha Corp", type: "stock" },
      { identifier: "BBB", name: "Beta Income Fund", type: "fund" },
      { identifier: "CCC", name: "Gamma Holdings Warrants", type: "stock" },
      { identifier: "DDD", name: "Delta Acquisition Units", type: "stock" },
    ]),
    2,
  );
});

// These tests cover name-first search broadening.
// If a normal company-name search is too sparse, the service tries nearby word
// variants like plurals or stems so users can still find likely matches.
test("searchStocks broadens sparse word queries with fallback ROIC searches", async () => {
  const capturedQueries = [];

  roicService.fetchStockPrices = async () => [];
  roicService.searchRoicByCompanyName = async (query) => {
    capturedQueries.push(query);

    if (query === "frog") {
      return [
        {
          symbol: "FROG",
          name: "JFrog Ltd.",
          exchange: "NASDAQ",
          exchange_name: "NASDAQ",
          type: "stock",
        },
        {
          symbol: "FROG.NS",
          name: "Frog Innovations Ltd.",
          exchange: "NSE",
          exchange_name: "National Stock Exchange of India",
          type: "fund",
        },
      ];
    }

    if (query === "fro") {
      return [
        {
          symbol: "BFRG",
          name: "Bullfrog AI Holdings, Inc. Common Stock",
          exchange: "NASDAQ",
          exchange_name: "NASDAQ",
          type: "stock",
        },
        {
          symbol: "LFAC",
          name: "Leapfrog Acquisition Corporation",
          exchange: "NASDAQ",
          exchange_name: "NASDAQ",
          type: "stock",
        },
        {
          symbol: "LFACW",
          name: "Leapfrog Acquisition Corporation Warrants",
          exchange: "NASDAQ",
          exchange_name: "NASDAQ",
          type: "stock",
        },
      ];
    }

    return [];
  };

  const response = await stockSearchService.searchStocks("frog");

  assert.deepEqual(capturedQueries, ["frog", "frogs", "fro"]);
  assert.deepEqual(
    response.results.map((result) => result.identifier),
    ["FROG", "FROG.NS", "BFRG", "LFAC", "LFACW"],
  );
});

test("searchStocks does not broaden word queries once enough preferred results are already present", async () => {
  const capturedQueries = [];

  roicService.fetchStockPrices = async (ticker) => {
    if (ticker === "ALPHA") {
      return [];
    }

    return [{ date: "2026-04-15", close: 10 }];
  };
  roicService.searchRoicByCompanyName = async (query) => {
    capturedQueries.push(query);

    if (query !== "alpha") {
      return [];
    }

    return [
      { symbol: "AAA", name: "Alpha One", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      { symbol: "AAB", name: "Alpha Two", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      { symbol: "AAC", name: "Alpha Three", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      { symbol: "AAD", name: "Alpha Four", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      { symbol: "AAE", name: "Alpha Five", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      { symbol: "AAF", name: "Alpha Six", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      { symbol: "AAG", name: "Alpha Seven", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      { symbol: "AAH", name: "Alpha Eight", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      { symbol: "AAI", name: "Alpha Nine", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      { symbol: "AAJ", name: "Alpha Ten", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
    ];
  };

  const response = await stockSearchService.searchStocks("alpha");

  assert.deepEqual(capturedQueries, ["alpha"]);
  assert.equal(response.results.length, 10);
});

test("searchStocks broadens word queries when too few prefix matches have usable price data", async () => {
  const capturedQueries = [];

  roicService.fetchStockPrices = async (ticker) => {
    if (ticker === "ALPHA") {
      return [];
    }

    return [{ date: "2026-04-15", close: 10 }];
  };
  roicService.searchRoicByCompanyName = async (query) => {
    capturedQueries.push(query);

    if (query === "alpha") {
      return [
        { symbol: "AAA", name: "Alpha One", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
        { symbol: "AAB", name: "Alpha Two", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
        { symbol: "AAC", name: "Alpha Three", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
        { symbol: "AAD", name: "Alpha Four", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
        { symbol: "AAE", name: "Alpha Five", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
        { symbol: "AAF", name: "Alpha Six", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
        { symbol: "AAG", name: "Alpha Seven", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
        { symbol: "AAH", name: "Alpha Eight", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
        { symbol: "AAI", name: "Alpha Nine", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      ];
    }

    if (query === "alphas") {
      return [];
    }

    if (query === "alph") {
      return [
        { symbol: "ALPHX", name: "Alph Growth Holdings", exchange: "NYSE", exchange_name: "NYSE", type: "stock" },
      ];
    }

    return [];
  };

  const response = await stockSearchService.searchStocks("alpha");

  assert.deepEqual(capturedQueries, ["alpha", "alphas", "alph"]);
  assert.equal(
    response.results.some((result) => result.identifier === "ALPHX"),
    true,
  );
});

test("searchStocks can recover diesel-style plural and stem-adjacent matches from fallback name searches", async () => {
  const capturedQueries = [];

  roicService.fetchStockPrices = async () => [];
  roicService.searchRoicByCompanyName = async (query) => {
    capturedQueries.push(query);

    if (query === "diesel") {
      return [
        {
          symbol: "UHN",
          name: "United States Diesel-Heating Oil",
          exchange: "NYSE",
          exchange_name: "New York Stock Exchange",
          type: "fund",
        },
      ];
    }

    if (query === "diesels") {
      return [
        {
          symbol: "6022.T",
          name: "Akasaka Diesels Limited",
          exchange: "JPX",
          exchange_name: "Tokyo Stock Exchange",
          type: "stock",
        },
      ];
    }

    if (query === "diese") {
      return [
        {
          symbol: "6018.T",
          name: "The Hanshin Diesel Works, Ltd.",
          exchange: "JPX",
          exchange_name: "Tokyo Stock Exchange",
          type: "stock",
        },
        {
          symbol: "XTRM",
          name: "Extreme Biodiesel, Inc.",
          exchange: "OTC",
          exchange_name: "Other OTC",
          type: "stock",
        },
      ];
    }

    return [];
  };

  const response = await stockSearchService.searchStocks("diesel");

  assert.deepEqual(capturedQueries, ["diesel", "diesels", "diese", "dies"]);
  assert.deepEqual(
    response.results.map((result) => result.identifier),
    ["6018.T", "6022.T", "UHN", "XTRM"],
  );
});

test("countUsablePricedResults counts only successful latest-price lookups", () => {
  assert.equal(
    stockSearchService.countUsablePricedResults([
      { identifier: "AAA", priceStatus: "ok" },
      { identifier: "BBB", priceStatus: "not-found" },
      { identifier: "CCC", priceStatus: "error" },
      { identifier: "DDD", priceStatus: "ok" },
    ]),
    2,
  );
});

// These tests focus on the ranking helpers after raw search results already
// exist. The service combines text relevance, search tier, and price-status
// metadata to decide which rows should appear first.
test("name-first filtering uses prefix first and broadens to contains when fewer than 10 prefix matches", () => {
  const filteredResults = stockSearchService.filterCompanySearchResults(
    "Alpha",
    [
      {
        identifier: "GOOGL",
        name: "Alphabet Inc.",
        exchange: "NASDAQ",
        exchangeName: "NASDAQ",
        type: "stock",
        nameSource: "company-search",
        isFallbackName: false,
      },
      {
        identifier: "AAPX",
        name: "Alpha Apex Holdings",
        exchange: "NYSE",
        exchangeName: "New York Stock Exchange",
        type: "stock",
        nameSource: "company-search",
        isFallbackName: false,
      },
      {
        identifier: "XZZ",
        name: "Global Alpha Growth ETF",
        exchange: "NYSE",
        exchangeName: "New York Stock Exchange",
        type: "etf",
        nameSource: "company-search",
        isFallbackName: false,
      },
    ],
    {
      mode: "name-first",
      minimumPrefixResultsBeforeBroaden: 10,
    },
  );

  assert.deepEqual(filteredResults, [
    {
      identifier: "GOOGL",
      name: "Alphabet Inc.",
      exchange: "NASDAQ",
      exchangeName: "NASDAQ",
      type: "stock",
      nameSource: "company-search",
      isFallbackName: false,
    },
    {
      identifier: "AAPX",
      name: "Alpha Apex Holdings",
      exchange: "NYSE",
      exchangeName: "New York Stock Exchange",
      type: "stock",
      nameSource: "company-search",
      isFallbackName: false,
    },
    {
      identifier: "XZZ",
      name: "Global Alpha Growth ETF",
      exchange: "NYSE",
      exchangeName: "New York Stock Exchange",
      type: "etf",
      nameSource: "company-search",
      isFallbackName: false,
    },
  ]);
});

test("strong company-name matches can rank above suffix variants", async () => {
  const response = stockSearchService.mergeTickerSearchResults(
    "FLT",
    [
      {
        identifier: "FLT.AX",
        name: "Flight Centre Travel Group Limited",
        exchange: "ASX",
        exchangeName: "Australian Securities Exchange",
        type: "stock",
        nameSource: "profile",
        isFallbackName: false,
      },
    ],
    [
      {
        identifier: "TRIP",
        name: "FLT Travel Holdings",
        exchange: "NYSE",
        exchangeName: "New York Stock Exchange",
        type: "stock",
        nameSource: "company-search",
        isFallbackName: false,
      },
    ],
  );

  assert.equal(response[0].identifier, "TRIP");
  assert.equal(response[1].identifier, "FLT.AX");
});

test("sortResultsWithPricePreference prefers priced rows when text relevance is otherwise tied", () => {
  const response = stockSearchService.sortResultsWithPricePreference("bank", [
    {
      identifier: "BNKZ",
      name: "Bank Zebra Holdings",
      priceStatus: "not-found",
    },
    {
      identifier: "BNKA",
      name: "Bank Alpha Holdings",
      priceStatus: "ok",
    },
  ]);

  assert.equal(response[0].identifier, "BNKA");
  assert.equal(response[1].identifier, "BNKZ");
});

test("searchStocks tolerates partial failures when at least one branch succeeds", async () => {
  roicService.fetchStockPrices = async () => {
    throw new Error("ticker branch failed");
  };

  roicService.searchRoicByCompanyName = async () => {
    return [
      {
        symbol: "NVDA",
        name: "NVIDIA Corporation",
        exchange: "NASDAQ",
        exchange_name: "NASDAQ",
        type: "stock",
      },
    ];
  };

  const response = await stockSearchService.searchStocks("nvda");

  assert.deepEqual(response.results, [
    {
      identifier: "NVDA",
      name: "NVIDIA Corporation",
      exchange: "NASDAQ",
      exchangeName: "NASDAQ",
      type: "stock",
      nameSource: "company-search",
      isFallbackName: false,
    },
  ]);
});

test("searchStocks throws a formatted error only when every upstream branch fails", async () => {
  roicService.fetchStockPrices = async () => {
    const error = new Error("ticker failed");
    error.response = {
      status: 502,
      data: { message: "ticker search failed" },
    };
    throw error;
  };

  roicService.searchRoicByCompanyName = async () => {
    const error = new Error("name failed");
    error.response = {
      status: 504,
      data: { message: "name search failed" },
    };
    throw error;
  };

  await assert.rejects(
    stockSearchService.searchStocks("Tesla Inc"),
    (error) => {
      assert.equal(error.message, 'Unable to search stocks for "Tesla Inc".');
      assert.equal(error.statusCode, 504);
      assert.deepEqual(error.details, { message: "name search failed" });
      return true;
    },
  );
});

test("searchStocks returns an empty result set when every branch succeeds with no matches", async () => {
  roicService.fetchStockPrices = async () => [];
  roicService.searchRoicByCompanyName = async () => [];

  const response = await stockSearchService.searchStocks("NoMatchesHere");

  assert.equal(response.query, "NoMatchesHere");
  assert.equal(response.queryType, "name");
  assert.deepEqual(response.results, []);
});

test("searchStocksWithDiagnostics preserves branch provenance and naming metadata", async () => {
  roicService.fetchStockPrices = async (ticker) => {
    if (ticker === "FLT" || ticker === "FLT.AX") {
      return [{ date: "2024-01-31", close: 187.25 }];
    }

    return [];
  };

  roicService.fetchCompanyProfile = async (ticker) => {
    if (ticker === "FLT") {
      return {
        company_name: "FLEETCOR Technologies, Inc.",
        exchange_short_name: "NYSE",
        exchange: "New York Stock Exchange",
      };
    }

    if (ticker === "FLT.AX") {
      return {
        company_name: "Flight Centre Travel Group Limited",
        exchange_short_name: "ASX",
        exchange: "Australian Securities Exchange",
      };
    }

    throw new Error(`Unexpected profile lookup for ${ticker}`);
  };

  roicService.searchRoicByCompanyName = async () => {
    return [
      {
        symbol: "FLT",
        name: "FLEETCOR Technologies, Inc.",
        exchange: "NYSE",
        exchange_name: "New York Stock Exchange",
        type: "stock",
      },
      {
        symbol: "FLT.AX",
        name: "Flight Centre Travel Group Limited",
        exchange: "ASX",
        exchange_name: "Australian Securities Exchange",
        type: "stock",
      },
    ];
  };

  const response = await stockSearchService.searchStocksWithDiagnostics("FLT");

  assert.deepEqual(response.results, [
    {
      identifier: "FLT",
      name: "FLEETCOR Technologies, Inc.",
      exchange: "NYSE",
      exchangeName: "New York Stock Exchange",
      type: "stock",
      nameSource: "profile",
      isFallbackName: false,
      sources: ["exact", "name"],
    },
    {
      identifier: "FLT.AX",
      name: "Flight Centre Travel Group Limited",
      exchange: "ASX",
      exchangeName: "Australian Securities Exchange",
      type: "stock",
      nameSource: "profile",
      isFallbackName: false,
      sources: ["name", "variant"],
    },
  ]);
});

test("searchStocksWithDiagnostics keeps the same result order as the ranked main search output", async () => {
  roicService.fetchStockPrices = async (ticker) => {
    if (ticker === "9988.HK" || ticker === "BABA") {
      return [{ date: "2026-04-15", close: 100 }];
    }

    return [];
  };

  roicService.fetchCompanyProfile = async (ticker) => {
    if (ticker === "9988.HK") {
      return {
        company_name: "Alibaba Group Holding Limited",
        exchange_short_name: "HKEX",
        exchange: "Hong Kong Exchange",
      };
    }

    throw new Error(`Unexpected profile lookup for ${ticker}`);
  };

  roicService.searchRoicByCompanyName = async () => [
    {
      symbol: "9988.HK",
      name: "Alibaba Group Holding Limited",
      exchange: "HKEX",
      exchange_name: "Hong Kong Exchange",
      type: "stock",
    },
    {
      symbol: "BABA",
      name: "Alibaba 9988 ADR",
      exchange: "NYSE",
      exchange_name: "New York Stock Exchange",
      type: "stock",
    },
  ];

  const mainResponse = await stockSearchService.searchStocks("9988");
  const diagnosticResponse = await stockSearchService.searchStocksWithDiagnostics("9988");

  assert.deepEqual(
    diagnosticResponse.results.map((result) => result.identifier),
    mainResponse.results.map((result) => result.identifier),
  );
});

// Finally, the enrichment tests verify the helper used by the CLI and other
// debugging tools. It should add latest-price details without losing partial
// results when one ticker lookup fails.
test("enrichResultsWithLatestPrices returns latest date and close for successful lookups", async () => {
  roicService.fetchStockPrices = async (ticker, options) => {
    assert.deepEqual(options, {
      order: "DESC",
      limit: 1,
    });

    if (ticker === "AAPL") {
      return [{ date: "2024-02-29", close: 192.5 }];
    }

    return [];
  };

  const response = await stockSearchService.enrichResultsWithLatestPrices([
    { identifier: "AAPL", name: "Apple Inc.", sources: ["name"] },
    { identifier: "MSFT", name: "Microsoft Corporation", sources: ["name"] },
  ]);

  assert.deepEqual(response, [
    {
      identifier: "AAPL",
      name: "Apple Inc.",
      sources: ["name"],
      latestPrice: { date: "2024-02-29", close: 192.5 },
      priceStatus: "ok",
    },
    {
      identifier: "MSFT",
      name: "Microsoft Corporation",
      sources: ["name"],
      latestPrice: null,
      priceStatus: "not-found",
    },
  ]);
});

test("enrichResultsWithLatestPrices keeps partial results when one price lookup fails", async () => {
  roicService.fetchStockPrices = async (ticker) => {
    if (ticker === "AAPL") {
      return [{ date: "2024-02-29", close: 192.5 }];
    }

    const error = new Error("ROIC price lookup failed");
    error.response = {
      data: { message: "upstream unavailable" },
    };
    throw error;
  };

  const response = await stockSearchService.enrichResultsWithLatestPrices([
    { identifier: "AAPL", name: "Apple Inc.", sources: ["name"] },
    { identifier: "MSFT", name: "Microsoft Corporation", sources: ["name"] },
  ]);

  assert.deepEqual(response, [
    {
      identifier: "AAPL",
      name: "Apple Inc.",
      sources: ["name"],
      latestPrice: { date: "2024-02-29", close: 192.5 },
      priceStatus: "ok",
    },
    {
      identifier: "MSFT",
      name: "Microsoft Corporation",
      sources: ["name"],
      latestPrice: null,
      priceStatus: "error",
      priceError: "upstream unavailable",
    },
  ]);
});

test("enrichResultsWithLatestPrices preserves the caller's original result order", async () => {
  roicService.fetchStockPrices = async (ticker) => {
    if (ticker === "MSFT") {
      return [{ date: "2024-02-29", close: 410.2 }];
    }

    if (ticker === "AAPL") {
      return [{ date: "2024-02-29", close: 192.5 }];
    }

    return [];
  };

  const response = await stockSearchService.enrichResultsWithLatestPrices([
    { identifier: "MSFT", name: "Microsoft Corporation", sources: ["name"] },
    { identifier: "AAPL", name: "Apple Inc.", sources: ["name"] },
  ]);

  assert.deepEqual(
    response.map((result) => result.identifier),
    ["MSFT", "AAPL"],
  );
  assert.equal(response[0].priceStatus, "ok");
  assert.equal(response[1].priceStatus, "ok");
});
