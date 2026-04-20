const roicService = require("./roicService");

const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const MAX_SEARCH_RESULTS = 10;
const MIN_PREFIX_RESULTS_BEFORE_BROADEN = 10;
const MIN_FUZZY_QUERY_LENGTH = 3;
const EXCLUDED_BROAD_RESULT_NAME_PATTERN = /\b(warrant|warrants|right|rights|unit|units)\b/i;
// Verified against ROIC.ai quote/catalog pages on 2026-04-16.
// Note: ROIC's Taiwan labeling is inconsistent across quote pages. The `.TW`
// suffix is commented based on how ROIC currently labels `.TW` quote pages.
//
// These ranking constants let the service rank search results in layers.
// We first prefer stronger search branches, and only then use price lookups
// to break ties between otherwise similar candidates.
const LATEST_PRICE_LOOKUP_OPTIONS = {
  order: "DESC",
  limit: 1,
};
const SEARCH_RESULT_TIERS = {
  exact: 1,
  variant: 2,
  tickerStrongName: 3,
  tickerLooseName: 4,
};
const DEFAULT_SEARCH_TIER_PRIORITY = Number.MAX_SAFE_INTEGER;
const COMMON_TICKER_SUFFIXES = [
  ".AX",
  ".AS",
  ".L",
  ".TO",
  ".NZ",
  ".HK",
  ".T",
  ".KS",
  ".V",
  ".NE",
  ".NS",
  ".BO",
  ".SZ",
  ".SS",
  ".TW",
  ".SI",
  ".SA",
  ".JO",
  ".PA",
  ".BR",
  ".DE",
  ".F",
  ".SW",
  ".ST",
  ".HE",
  ".CO",
  ".OL",
  ".MC",
  ".MI",
  ".WA",
];

// A "ticker-like" query looks like a stock symbol such as `AAPL`, `BHP.AX`,
// or `0700.HK`. We use this to decide whether we should search like a symbol,
// a company name, or both.
function isTickerLikeQuery(searchQuery) {
  return typeof searchQuery === "string" && TICKER_PATTERN.test(searchQuery.toUpperCase());
}

// We treat all-uppercase symbol-shaped input as "ticker first".
// Example: `BHP` should prioritize symbol matching, while `Bhp` or `BHP Ltd`
// should behave more like a name search.
function isTickerFirstQuery(searchQuery) {
  const query = String(searchQuery || "").trim();
  if (!query) {
    return false;
  }

  return query === query.toUpperCase() && isTickerLikeQuery(query);
}

// ROIC responses are not guaranteed to have the same field names everywhere,
// so we normalize them into one shape used by the rest of this file.
function buildSearchResult(searchResult = {}, metadata = {}) {
  return {
    identifier: searchResult.symbol || searchResult.identifier || "",
    name: searchResult.name || searchResult.company_name || searchResult.symbol || searchResult.identifier || "",
    exchange: searchResult.exchange || searchResult.exchange_short_name || "",
    exchangeName: searchResult.exchange_name || searchResult.exchangeName || searchResult.exchange || "",
    type: searchResult.type || "stock",
    nameSource: metadata.nameSource || "company-search",
    isFallbackName: Boolean(metadata.isFallbackName),
    searchTier: metadata.searchTier ?? searchResult.searchTier,
  };
}

function normalizeCompanySearchResults(searchResults = []) {
  return searchResults.map((searchResult) =>
    buildSearchResult(searchResult, {
      nameSource: "company-search",
      isFallbackName: false,
    }),
  );
}

// These helpers build extra "nearby" word variants for name searches.
// Example: `industries` may also try `industry`, and `holding` may also try
// `hold`. This gives us a second chance when ROIC returns too few strong hits.
function normalizeWordQuery(rawQuery) {
  return String(rawQuery || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function addFallbackQueryVariant(variants, query) {
  const normalizedQuery = normalizeWordQuery(query);
  if (normalizedQuery.length >= MIN_FUZZY_QUERY_LENGTH) {
    variants.add(normalizedQuery);
  }
}

function buildWordSearchFallbackQueries(rawQuery) {
  const normalizedQuery = normalizeWordQuery(rawQuery);
  if (!normalizedQuery || normalizedQuery.includes(" ")) {
    return [];
  }

  const variants = new Set();

  if (normalizedQuery.endsWith("ies") && normalizedQuery.length > 4) {
    addFallbackQueryVariant(variants, `${normalizedQuery.slice(0, -3)}y`);
  } else if (normalizedQuery.endsWith("y") && normalizedQuery.length > 2) {
    addFallbackQueryVariant(variants, `${normalizedQuery.slice(0, -1)}ies`);
  }

  if (normalizedQuery.endsWith("s") && !normalizedQuery.endsWith("ss") && normalizedQuery.length > 3) {
    addFallbackQueryVariant(variants, normalizedQuery.slice(0, -1));
  } else {
    addFallbackQueryVariant(variants, `${normalizedQuery}s`);
  }

  if (normalizedQuery.endsWith("ing") && normalizedQuery.length > 5) {
    addFallbackQueryVariant(variants, normalizedQuery.slice(0, -3));
  }

  if (normalizedQuery.endsWith("ed") && normalizedQuery.length > 4) {
    addFallbackQueryVariant(variants, normalizedQuery.slice(0, -2));
  }

  if (normalizedQuery.endsWith("es") && normalizedQuery.length > 4) {
    addFallbackQueryVariant(variants, normalizedQuery.slice(0, -2));
  }

  if (normalizedQuery.length > 3) {
    addFallbackQueryVariant(variants, normalizedQuery.slice(0, -1));
  }

  if (normalizedQuery.length > 5) {
    addFallbackQueryVariant(variants, normalizedQuery.slice(0, -2));
  }

  variants.delete(normalizedQuery);

  return [...variants];
}

// Higher scores float the best ticker/name matches to the top after we merge
// results from multiple search strategies.
function getTickerMatchScore(rawQuery, normalizedResult) {
  const query = String(rawQuery || "").trim().toUpperCase();
  const identifier = String(normalizedResult.identifier || "").trim().toUpperCase();
  const name = String(normalizedResult.name || "").trim().toUpperCase();

  if (!query || !identifier) {
    return 0;
  }

  if (identifier === query) {
    return 500;
  }

  if (name === query) {
    return 450;
  }

  if (name.startsWith(query)) {
    return 320;
  }

  if (identifier.startsWith(`${query}.`)) {
    return 300;
  }

  if (identifier.startsWith(query)) {
    return 250;
  }

  if (name.includes(query)) {
    return 100;
  }

  return 0;
}

// Some names are better than others. If we can get the company name from the
// company profile, that is usually stronger than a search-result fallback.
function getNameSourcePriority(result = {}) {
  const source = result.nameSource || "";

  if (source === "profile") {
    return 3;
  }

  if (source === "company-search") {
    return 2;
  }

  if (source === "ticker-fallback") {
    return 1;
  }

  return 0;
}

// The same ticker can arrive from several ROIC branches. We keep one row per
// identifier, but we still allow later rows to improve the stored name or tier
// when they are clearly better than what we already have.
function choosePreferredResult(currentResult, candidateResult) {
  const currentPriority = getNameSourcePriority(currentResult);
  const candidatePriority = getNameSourcePriority(candidateResult);
  const currentTier = Number.isFinite(currentResult.searchTier) ? currentResult.searchTier : Number.POSITIVE_INFINITY;
  const candidateTier = Number.isFinite(candidateResult.searchTier) ? candidateResult.searchTier : Number.POSITIVE_INFINITY;
  const preferredTier = Math.min(currentTier, candidateTier);

  if (candidatePriority > currentPriority) {
    const preferredResult = {
      ...currentResult,
      ...candidateResult,
    };

    if (currentResult.sources !== undefined) {
      preferredResult.sources = currentResult.sources;
    }

    if (Number.isFinite(preferredTier)) {
      preferredResult.searchTier = preferredTier;
    }

    return preferredResult;
  }

  if (Number.isFinite(preferredTier) && preferredTier < currentTier) {
    return {
      ...currentResult,
      searchTier: preferredTier,
    };
  }

  return currentResult;
}

// We can get the same stock from several search paths. This merge step removes
// duplicates, keeps the preferred name data, sorts by relevance, and limits the
// final list to the top results we want to show users.
function mergeTickerSearchResults(rawQuery, ...searchResultLists) {
  return mergeSearchResults(rawQuery, searchResultLists);
}

// Same merge as above, but keeps a `sources` array so diagnostic endpoints can
// explain where each result came from (`name`, `exact`, `variant`, etc.).
function mergeTickerSearchResultsWithSources(rawQuery, searchResultGroups = []) {
  return mergeSearchResults(rawQuery, searchResultGroups, {
    includeSources: true,
  });
}

function mergeSearchResults(rawQuery, searchResultLists = [], options = {}) {
  const {
    includeSources = false,
    maxResults = MAX_SEARCH_RESULTS,
  } = options;
  const mergedResultsMap = new Map();

  if (includeSources) {
    searchResultLists.forEach(({ source, results = [] }) => {
      results.forEach((searchResult) => {
        const normalizedResult = buildSearchResult(searchResult, {
          nameSource: searchResult.nameSource,
          isFallbackName: searchResult.isFallbackName,
        });
        if (!normalizedResult.identifier) {
          return;
        }

        if (!mergedResultsMap.has(normalizedResult.identifier)) {
          mergedResultsMap.set(normalizedResult.identifier, {
            ...normalizedResult,
            sources: [source],
          });
          return;
        }

        const existingResult = mergedResultsMap.get(normalizedResult.identifier);
        if (!existingResult.sources.includes(source)) {
          existingResult.sources.push(source);
        }

        mergedResultsMap.set(
          normalizedResult.identifier,
          choosePreferredResult(existingResult, normalizedResult),
        );
      });
    });
  } else {
    searchResultLists.flat().forEach((searchResult) => {
      const normalizedResult = buildSearchResult(searchResult, {
        nameSource: searchResult.nameSource,
        isFallbackName: searchResult.isFallbackName,
      });
      if (!normalizedResult.identifier) {
        return;
      }

      if (!mergedResultsMap.has(normalizedResult.identifier)) {
        mergedResultsMap.set(normalizedResult.identifier, normalizedResult);
        return;
      }

      mergedResultsMap.set(
        normalizedResult.identifier,
        choosePreferredResult(mergedResultsMap.get(normalizedResult.identifier), normalizedResult),
      );
    });
  }

  const mergedResults = [...mergedResultsMap.values()]
    .sort((left, right) => {
      const scoreDifference = getTickerMatchScore(rawQuery, right) - getTickerMatchScore(rawQuery, left);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return left.identifier.localeCompare(right.identifier);
    });

  const limitedResults =
    Number.isFinite(maxResults) ? mergedResults.slice(0, maxResults) : mergedResults;

  if (!includeSources) {
    return limitedResults;
  }

  return limitedResults.map((result) => ({
    ...result,
    sources: [...result.sources].sort(),
  }));
}

function buildTickerVariantCandidates(rawQuery) {
  const uppercaseQuery = String(rawQuery || "").trim().toUpperCase();

  if (!uppercaseQuery || uppercaseQuery.includes(".")) {
    return [];
  }

  return COMMON_TICKER_SUFFIXES.map((suffix) => `${uppercaseQuery}${suffix}`);
}

// ROIC company profile responses can be sparse, so we keep the extraction
// logic tiny and explicit.
function getProfileCompanyName(profile = {}) {
  const companyName = typeof profile.company_name === "string" ? profile.company_name.trim() : "";
  return companyName;
}

// A ticker is considered "confirmed" only if ROIC can return at least one
// price row for it. That helps us avoid showing made-up symbol variants.
async function buildTickerConfirmedSearchResult(tickerSymbol) {
  const priceRows = await roicService.fetchStockPrices(tickerSymbol, LATEST_PRICE_LOOKUP_OPTIONS);

  if (priceRows.length === 0) {
    return null;
  }

  try {
    const profile = await roicService.fetchCompanyProfile(tickerSymbol);
    const companyName = getProfileCompanyName(profile);

    if (companyName) {
      return buildSearchResult(
        {
          identifier: tickerSymbol,
          name: companyName,
          exchange: profile.exchange_short_name || "",
          exchangeName: profile.exchange || "",
          type: "stock",
        },
        {
          nameSource: "profile",
          isFallbackName: false,
        },
      );
    }
  } catch {
    // A valid ticker without a profile name is still worth showing.
  }

  return buildSearchResult(
    {
      identifier: tickerSymbol,
      name: tickerSymbol,
      exchange: "",
      exchangeName: "",
      type: "stock",
    },
    {
      nameSource: "ticker-fallback",
      isFallbackName: true,
    },
  );
}

async function searchRoicByExactTicker(tickerSymbol) {
  const result = await buildTickerConfirmedSearchResult(tickerSymbol);
  return result ? [result] : [];
}

// We try many exchange-specific versions of the same ticker in parallel and
// keep only the ones ROIC successfully confirms.
async function searchRoicByTickerVariants(rawQuery) {
  const candidateSymbols = buildTickerVariantCandidates(rawQuery);

  if (candidateSymbols.length === 0) {
    return [];
  }

  const settledResults = await Promise.allSettled(
    candidateSymbols.map((candidateSymbol) => buildTickerConfirmedSearchResult(candidateSymbol)),
  );

  return settledResults
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
}

// In ticker-first mode we are intentionally strict. If someone typed `BHP`,
// we mostly want matches that clearly start with that ticker, not loose name
// matches buried deep inside a company title.
function isStrongTickerLikeCompanyMatch(rawQuery, normalizedResult) {
  const query = String(rawQuery || "").trim().toUpperCase();
  const identifier = String(normalizedResult.identifier || "").trim().toUpperCase();
  const name = String(normalizedResult.name || "").trim().toUpperCase();

  if (!query || !identifier) {
    return false;
  }

  return (
    identifier === query ||
    identifier.startsWith(`${query}.`) ||
    identifier.startsWith(query) ||
    name === query ||
    name.startsWith(query)
  );
}

function isPrefixCompanyMatch(rawQuery, normalizedResult) {
  const query = String(rawQuery || "").trim().toUpperCase();
  const identifier = String(normalizedResult.identifier || "").trim().toUpperCase();
  const name = String(normalizedResult.name || "").trim().toUpperCase();

  if (!query || (!identifier && !name)) {
    return false;
  }

  return (
    identifier === query ||
    identifier.startsWith(`${query}.`) ||
    identifier.startsWith(query) ||
    name === query ||
    name.startsWith(query)
  );
}

function isContainsCompanyMatch(rawQuery, normalizedResult) {
  const query = String(rawQuery || "").trim().toUpperCase();
  const identifier = String(normalizedResult.identifier || "").trim().toUpperCase();
  const name = String(normalizedResult.name || "").trim().toUpperCase();

  if (!query || (!identifier && !name)) {
    return false;
  }

  return identifier.includes(query) || name.includes(query);
}

function tokenizeSearchText(value) {
  return String(value || "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

// When the original name search is too narrow, we try fallback word variants
// and accept a result if any token starts with one of those fallback words.
function isFallbackTokenPrefixMatch(fallbackQueries = [], normalizedResult = {}) {
  if (fallbackQueries.length === 0) {
    return false;
  }

  const resultTokens = [
    ...tokenizeSearchText(normalizedResult.identifier),
    ...tokenizeSearchText(normalizedResult.name),
  ];

  return fallbackQueries.some((fallbackQuery) => {
    const uppercaseFallbackQuery = String(fallbackQuery || "").trim().toUpperCase();
    if (!uppercaseFallbackQuery) {
      return false;
    }

    return resultTokens.some((token) => token.startsWith(uppercaseFallbackQuery));
  });
}

function isPreferredBroadResultType(result = {}) {
  const resultType = String(result.type || "").trim().toLowerCase();
  const resultName = String(result.name || "");

  if (resultType === "fund") {
    return true;
  }

  if (resultType !== "stock") {
    return false;
  }

  return !EXCLUDED_BROAD_RESULT_NAME_PATTERN.test(resultName);
}

function countPreferredBroadResults(results = []) {
  return results.filter((result) => isPreferredBroadResultType(result)).length;
}

// Search tiers are the first ranking rule we apply.
// Lower numbers are stronger:
// 1. exact ticker hits
// 2. confirmed suffix variants
// 3. strong ticker-like company-name matches
// 4. loose company-name fill matches
function applySearchTier(results = [], searchTier) {
  if (!Number.isFinite(searchTier)) {
    return results;
  }

  return results.map((result) => ({
    ...result,
    searchTier,
  }));
}

// Loose ticker-first matches are still useful, but only as backup suggestions
// after stronger exact and prefix-style matches have been considered.
function isTickerLooseCompanyMatch(rawQuery, normalizedResult) {
  const query = String(rawQuery || "").trim().toUpperCase();
  const resultTokens = [
    ...tokenizeSearchText(normalizedResult.identifier),
    ...tokenizeSearchText(normalizedResult.name),
  ];

  if (!query || resultTokens.length === 0) {
    return false;
  }

  return resultTokens.some((token) => token.startsWith(query));
}

function getPriceStatusPriority(result = {}) {
  return result.priceStatus === "ok" ? 1 : 0;
}

function getSearchTierPriority(result = {}) {
  return Number.isFinite(result.searchTier) ? result.searchTier : DEFAULT_SEARCH_TIER_PRIORITY;
}

// This sort order is intentional: a weak fill match must never jump ahead of a
// stronger ticker hit just because the weak result happened to have price data.
function sortResultsWithPricePreference(rawQuery, results = []) {
  return [...results].sort((left, right) => {
    const tierDifference = getSearchTierPriority(left) - getSearchTierPriority(right);
    if (tierDifference !== 0) {
      return tierDifference;
    }

    const scoreDifference = getTickerMatchScore(rawQuery, right) - getTickerMatchScore(rawQuery, left);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    const pricePriorityDifference = getPriceStatusPriority(right) - getPriceStatusPriority(left);
    if (pricePriorityDifference !== 0) {
      return pricePriorityDifference;
    }

    return String(left.identifier || "").localeCompare(String(right.identifier || ""));
  });
}

function countUsablePricedResults(results = []) {
  return results.filter((result) => result.priceStatus === "ok").length;
}

function buildResultOrderMap(results = []) {
  return new Map(results.map((result, index) => [result.identifier, index]));
}

// The internal search pipeline uses temporary metadata such as latest-price
// lookups and search tiers. We strip that helper-only data before returning
// the normal search response shape.
function stripPriceMetadata(result = {}) {
  const {
    latestPrice,
    priceStatus,
    priceError,
    searchTier,
    ...searchResult
  } = result;

  return searchResult;
}

// This helper adds the latest known close to already-selected results without
// changing the caller's order. That makes it safe for diagnostics and the CLI,
// where we want extra visibility without changing the base search contract.
async function fetchLatestPriceDataForResults(results = []) {
  const settledResults = await Promise.allSettled(
    results.map(async (result) => {
      const priceRows = await roicService.fetchStockPrices(result.identifier, LATEST_PRICE_LOOKUP_OPTIONS);
      const latestPrice = priceRows[0] || null;

      return {
        ...result,
        latestPrice: latestPrice
          ? {
              date: latestPrice.date || "",
              close: latestPrice.close ?? null,
            }
          : null,
        priceStatus: latestPrice ? "ok" : "not-found",
      };
    }),
  );

  return settledResults.map((settledResult, index) => {
    if (settledResult.status === "fulfilled") {
      return settledResult.value;
    }

    return {
      ...results[index],
      latestPrice: null,
      priceStatus: "error",
      priceError:
        settledResult.reason?.response?.data?.message ||
        settledResult.reason?.message ||
        "Price lookup failed.",
    };
  });
}

// The same ROIC company-name endpoint is filtered differently depending on the
// user's intent. Ticker-first searches stay strict, while name-first searches
// can broaden into contains and fallback matches when the first pass is sparse.
function filterCompanySearchResults(rawQuery, companySearchResults = [], options = {}) {
  const {
    mode = "name-first",
    minimumPrefixResultsBeforeBroaden = MIN_PREFIX_RESULTS_BEFORE_BROADEN,
    fallbackQueries = [],
  } = options;

  if (mode === "ticker-first") {
    const { strongMatches, looseMatches } = splitTickerFirstCompanySearchResults(rawQuery, companySearchResults);
    return [...strongMatches, ...looseMatches];
  }

  const prefixMatches = companySearchResults.filter((result) => isPrefixCompanyMatch(rawQuery, result));
  if (prefixMatches.length >= minimumPrefixResultsBeforeBroaden) {
    return prefixMatches;
  }

  const usedIdentifiers = new Set(prefixMatches.map((result) => result.identifier));
  const containsMatches = companySearchResults.filter((result) => {
    if (usedIdentifiers.has(result.identifier)) {
      return false;
    }

    return isContainsCompanyMatch(rawQuery, result) || isFallbackTokenPrefixMatch(fallbackQueries, result);
  });

  return [...prefixMatches, ...containsMatches];
}

// Ticker-first searches deliberately split strong and loose matches so the main
// ranking pipeline can keep exact-style hits above broader "mentions the text"
// results that are only useful as backup suggestions.
function splitTickerFirstCompanySearchResults(rawQuery, companySearchResults = []) {
  const strongMatches = companySearchResults.filter((result) => isStrongTickerLikeCompanyMatch(rawQuery, result));
  const usedIdentifiers = new Set(strongMatches.map((result) => result.identifier));
  const looseMatches = companySearchResults.filter((result) => {
    if (usedIdentifiers.has(result.identifier)) {
      return false;
    }

    return isTickerLooseCompanyMatch(rawQuery, result);
  });

  return {
    strongMatches,
    looseMatches,
  };
}

// Name-search normalization reuses the same filter helper in two modes.
// Ticker-first mode is strict, while name-first mode is allowed to broaden.
function normalizeNameSearchResultList(rawQuery, searchResults, tickerFirstQuery, options = {}) {
  const normalizedResults = normalizeCompanySearchResults(searchResults);

  return filterCompanySearchResults(rawQuery, normalizedResults, {
    mode: tickerFirstQuery ? "ticker-first" : "name-first",
    fallbackQueries: options.fallbackQueries || [],
  });
}

// In ticker-first mode we store strong and loose company-name matches as
// separate groups so the final ranking stage can give them different priority.
function normalizeTickerFirstNameSearchResultGroups(rawQuery, searchResults) {
  const normalizedResults = normalizeCompanySearchResults(searchResults);
  const { strongMatches, looseMatches } = splitTickerFirstCompanySearchResults(rawQuery, normalizedResults);

  return [
    {
      source: "name",
      results: applySearchTier(strongMatches, SEARCH_RESULT_TIERS.tickerStrongName),
    },
    {
      source: "name-loose",
      results: applySearchTier(looseMatches, SEARCH_RESULT_TIERS.tickerLooseName),
    },
  ].filter((group) => group.results.length > 0);
}

// Main search flow:
// 1. Classify the query as ticker-first or name-first.
// 2. Ask ROIC for company-name matches and exact ticker confirmation.
// 3. If the query looks like a ticker, also probe exchange-suffixed variants.
// 4. Normalize every branch into the same result shape.
// 5. Merge duplicates while keeping the strongest name source and tier.
// 6. Enrich the merged rows with latest-price status so ranking can prefer
//    usable rows when text relevance is otherwise tied.
// 7. For sparse name-first searches, broaden using fallback word variants.
// 8. Return a plain result list and a diagnostic list with source provenance.
async function runSearch(rawQuery) {
  const uppercaseQuery = rawQuery.toUpperCase();
  const tickerFirstQuery = isTickerFirstQuery(rawQuery);
  const companyNameSearchQuery = tickerFirstQuery ? uppercaseQuery : rawQuery;
  const searchTasks = [
    {
      source: "name",
      promise: roicService.searchRoicByCompanyName(companyNameSearchQuery),
    },
    {
      source: "exact",
      promise: searchRoicByExactTicker(uppercaseQuery),
    },
  ];

  if (tickerFirstQuery) {
    searchTasks.push({
      source: "variant",
      promise: searchRoicByTickerVariants(uppercaseQuery),
    });
  }

  const settledSearchResults = await Promise.allSettled(
    searchTasks.map((searchTask) => searchTask.promise),
  );

  const successfulResultLists = settledSearchResults
    .map((searchResult, index) => ({ searchResult, searchTask: searchTasks[index] }))
    .filter(({ searchResult }) => searchResult.status === "fulfilled")
    .flatMap(({ searchResult, searchTask }) => {
      if (searchTask.source === "name") {
        if (tickerFirstQuery) {
          return normalizeTickerFirstNameSearchResultGroups(rawQuery, searchResult.value);
        }

        return {
          source: searchTask.source,
          results: normalizeNameSearchResultList(rawQuery, searchResult.value, tickerFirstQuery),
        };
      }

      const searchTier =
        searchTask.source === "exact"
          ? SEARCH_RESULT_TIERS.exact
          : searchTask.source === "variant"
            ? SEARCH_RESULT_TIERS.variant
            : undefined;

      return {
        source: searchTask.source,
        results: applySearchTier(searchResult.value, searchTier),
      };
    });

  const rejectedResults = settledSearchResults
    .map((searchResult, index) => ({ searchResult, searchTask: searchTasks[index] }))
    .filter(({ searchResult }) => searchResult.status === "rejected");

  let mergedResults = mergeSearchResults(
    rawQuery,
    successfulResultLists.map((resultList) => resultList.results),
    {
      maxResults: Number.POSITIVE_INFINITY,
    },
  );
  let diagnosticResults = mergeSearchResults(rawQuery, successfulResultLists, {
    includeSources: true,
    maxResults: Number.POSITIVE_INFINITY,
  });
  let rankedMergedResults = await fetchLatestPriceDataForResults(mergedResults);

  if (!tickerFirstQuery && countUsablePricedResults(rankedMergedResults) < MIN_PREFIX_RESULTS_BEFORE_BROADEN) {
    const fallbackQueries = buildWordSearchFallbackQueries(rawQuery);

    if (fallbackQueries.length > 0) {
      const fallbackSearchResults = await Promise.allSettled(
        fallbackQueries.map((fallbackQuery) => roicService.searchRoicByCompanyName(fallbackQuery)),
      );

      fallbackSearchResults.forEach((fallbackSearchResult) => {
        if (fallbackSearchResult.status === "fulfilled") {
          successfulResultLists.push({
            source: "name-fallback",
            results: normalizeNameSearchResultList(rawQuery, fallbackSearchResult.value, false, {
              fallbackQueries,
            }),
          });
          return;
        }

        rejectedResults.push({
          searchResult: fallbackSearchResult,
          searchTask: {
            source: "name-fallback",
          },
        });
      });

      mergedResults = mergeSearchResults(
        rawQuery,
        successfulResultLists.map((resultList) => resultList.results),
        {
          maxResults: Number.POSITIVE_INFINITY,
        },
      );
      diagnosticResults = mergeSearchResults(rawQuery, successfulResultLists, {
        includeSources: true,
        maxResults: Number.POSITIVE_INFINITY,
      });
      rankedMergedResults = await fetchLatestPriceDataForResults(mergedResults);
    }
  }

  if (rankedMergedResults.length === 0) {
    const hasAnySuccessfulRows = successfulResultLists.some((resultList) => resultList.results.length > 0);
    if (!hasAnySuccessfulRows && rejectedResults.length > 0) {
      const firstError = rejectedResults[0]?.searchResult?.reason;
      const error = new Error(`Unable to search stocks for "${rawQuery}".`);
      error.statusCode = firstError?.response?.status || 502;
      error.details = firstError?.response?.data || firstError?.message || "ROIC search request failed.";
      throw error;
    }
  }

  const rankedResults = sortResultsWithPricePreference(rawQuery, rankedMergedResults)
    .slice(0, MAX_SEARCH_RESULTS)
    .map(stripPriceMetadata);
  const rankedResultOrder = buildResultOrderMap(rankedResults);
  const rankedDiagnosticResults = [...diagnosticResults]
    .sort((left, right) => {
      const leftOrder = rankedResultOrder.get(left.identifier);
      const rightOrder = rankedResultOrder.get(right.identifier);

      if (leftOrder !== undefined || rightOrder !== undefined) {
        if (leftOrder === undefined) {
          return 1;
        }

        if (rightOrder === undefined) {
          return -1;
        }

        return leftOrder - rightOrder;
      }

      return String(left.identifier || "").localeCompare(String(right.identifier || ""));
    })
    .slice(0, MAX_SEARCH_RESULTS)
    .map(stripPriceMetadata);

  return {
    query: rawQuery,
    queryType: tickerFirstQuery ? "ticker-or-name" : "name",
    results: rankedResults,
    diagnosticResults: rankedDiagnosticResults,
  };
}

// Public endpoint shape for normal app use.
async function searchStocks(rawQuery) {
  const searchSummary = await runSearch(rawQuery);

  return {
    query: searchSummary.query,
    queryType: searchSummary.queryType,
    results: searchSummary.results,
  };
}

// Diagnostic version of the same search. This returns the same stocks, but
// includes source-tracing data so we can inspect how each result was found.
async function searchStocksWithDiagnostics(rawQuery) {
  const searchSummary = await runSearch(rawQuery);

  return {
    query: searchSummary.query,
    queryType: searchSummary.queryType,
    results: searchSummary.diagnosticResults,
  };
}

// This public helper exists for the CLI and debugging tools. It adds price
// metadata, but it deliberately keeps the caller's input order unchanged.
async function enrichResultsWithLatestPrices(results = []) {
  return fetchLatestPriceDataForResults(results);
}

module.exports = {
  COMMON_TICKER_SUFFIXES,
  buildTickerVariantCandidates,
  buildTickerConfirmedSearchResult,
  buildWordSearchFallbackQueries,
  countPreferredBroadResults,
  countUsablePricedResults,
  enrichResultsWithLatestPrices,
  filterCompanySearchResults,
  fetchLatestPriceDataForResults,
  isPreferredBroadResultType,
  isTickerLooseCompanyMatch,
  isStrongTickerLikeCompanyMatch,
  isTickerFirstQuery,
  isTickerLikeQuery,
  isPrefixCompanyMatch,
  isContainsCompanyMatch,
  mergeTickerSearchResults,
  mergeTickerSearchResultsWithSources,
  searchStocks,
  searchStocksWithDiagnostics,
  searchRoicByExactTicker,
  searchRoicByTickerVariants,
  splitTickerFirstCompanySearchResults,
  sortResultsWithPricePreference,
};
