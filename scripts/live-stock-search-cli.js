require("dotenv").config();

const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const stockSearchService = require("../services/stockSearchService");

function formatSources(sources = []) {
  if (sources.length === 0) {
    return "unknown";
  }

  return sources.join(", ");
}

function formatLatestPrice(latestPrice) {
  if (!latestPrice) {
    return "";
  }

  return `${latestPrice.date || "unknown"} | ${latestPrice.close ?? "n/a"}`;
}

function buildTableRows(results) {
  return results.map((result, index) => ({
    "#": index + 1,
    Ticker: result.identifier,
    Company: result.isFallbackName ? `${result.name} (fallback)` : result.name,
    Sources: formatSources(result.sources),
    "Name Source": result.nameSource || "unknown",
    "Price Date + Close": formatLatestPrice(result.latestPrice),
    Status: result.priceStatus === "error" ? `price lookup failed: ${result.priceError}` : result.priceStatus,
  }));
}

async function runQuery(rawQuery) {
  const searchResponse = await stockSearchService.searchStocksWithDiagnostics(rawQuery);

  console.log("");
  console.log(`Query: ${searchResponse.query}`);
  console.log(`Query type: ${searchResponse.queryType}`);

  if (searchResponse.results.length === 0) {
    console.log("No matching stocks were found.");
    console.log("");
    return;
  }

  const resultsWithPrices = await stockSearchService.enrichResultsWithLatestPrices(searchResponse.results);
  console.table(buildTableRows(resultsWithPrices));
  console.log("");
}

async function main() {
  if (!process.env.ROIC_API_KEY) {
    console.error("Missing ROIC_API_KEY in your environment. Add it to .env before running the live search CLI.");
    process.exitCode = 1;
    return;
  }

  const terminal = readline.createInterface({
    input: stdin,
    output: stdout,
  });

  console.log("Live stock search CLI");
  console.log('Type a ticker or company name, then press Enter. Type "exit" or "quit" to leave.');

  try {
    while (true) {
      const rawInput = await terminal.question("> ");
      const query = rawInput.trim();

      if (!query) {
        console.log("Please type a ticker or company name.");
        continue;
      }

      if (query.toLowerCase() === "exit" || query.toLowerCase() === "quit") {
        break;
      }

      try {
        await runQuery(query);
      } catch (error) {
        console.log("");
        console.error(`Search failed for "${query}".`);
        if (error.statusCode) {
          console.error(`Status: ${error.statusCode}`);
        }
        console.error(`Details: ${JSON.stringify(error.details || error.message, null, 2)}`);
        console.log("");
      }
    }
  } finally {
    terminal.close();
  }
}

main().catch((error) => {
  console.error(`CLI startup failed: ${error.message}`);
  process.exit(1);
});
