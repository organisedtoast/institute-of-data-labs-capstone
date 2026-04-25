// Backend services all normalize stored ticker identifiers the same way so
// shared maps, queries, and payloads stay aligned across read paths.
function normalizeTickerSymbol(tickerSymbol) {
  return String(tickerSymbol || "").trim().toUpperCase();
}

module.exports = normalizeTickerSymbol;
