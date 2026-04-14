// This script implements a command-line interface (CLI) for 
// live stock searching.

// To run this script, use the command: npm run search:live


// Load environment variables from the .env file so we can access API keys and config
require("dotenv").config();

// readline/promises lets us read user input from the terminal asynchronously
const readline = require("node:readline/promises");
// stdin = standard input (keyboard), stdout = standard output (console)
const { stdin, stdout } = require("node:process");

// Import the stock search service, which handles the actual API calls
const stockSearchService = require("../services/stockSearchService");

/**
 * Formats an array of source names into a readable string.
 * Example: ["branchA", "branchB"] becomes "branchA, branchB"
 * If the array is empty, returns "unknown".
 *
 * @param {string[]} sources - List of source names
 * @returns {string} A comma-separated string of sources
 */
function formatSources(sources = []) {
  if (sources.length === 0) {
    return "unknown";
  }

  return sources.join(", ");
}

/**
 * Formats the latest price object into a readable string.
 * Example: { date: "2024-01-01", close: 150.25 } becomes "2024-01-01 | 150.25"
 * If no price data is provided, returns an empty string.
 *
 * @param {object|null} latestPrice - Object containing date and close (closing price)
 * @returns {string} Formatted price string or empty string
 */
function formatLatestPrice(latestPrice) {
  if (!latestPrice) {
    return "";
  }

  // The "||" operator provides a fallback if date is missing
  // The "??" operator (nullish coalescing) provides a fallback only for null/undefined
  return `${latestPrice.date || "unknown"} | ${latestPrice.close ?? "n/a"}`;
}

/**
 * Transforms the search results into an array of objects suitable for console.table().
 * Each object represents one row in the table with formatted, human-readable values.
 *
 * @param {Array} results - Array of raw search result objects from the service
 * @returns {Array} Array of objects ready for table display
 */
function buildTableRows(results) {
  return results.map((result, index) => ({
    "#": index + 1, // Row number for easy reading
    Ticker: result.identifier, // Stock ticker symbol (e.g., "AAPL")
    // If the company name came from a fallback source, mark it so the user knows
    Company: result.isFallbackName ? `${result.name} (fallback)` : result.name,
    Sources: formatSources(result.sources),
    "Name Source": result.nameSource || "unknown",
    "Price Date + Close": formatLatestPrice(result.latestPrice),
    // If the price lookup failed, show the error; otherwise show the status
    Status: result.priceStatus === "error" ? `price lookup failed: ${result.priceError}` : result.priceStatus,
  }));
}

/**
 * Executes a single search query: calls the search service, displays query metadata,
 * enriches results with price data, and prints a formatted table.
 *
 * @param {string} rawQuery - The ticker or company name the user typed
 */
async function runQuery(rawQuery) {
  // Call the service to search for stocks. This returns diagnostics about the query type
  const searchResponse = await stockSearchService.searchStocksWithDiagnostics(rawQuery);

  console.log(""); // Blank line for readability
  console.log(`Query: ${searchResponse.query}`); // Show what was searched
  console.log(`Query type: ${searchResponse.queryType}`); // e.g., "ticker" or "company name"

  // If no results were found, let the user know and stop early
  if (searchResponse.results.length === 0) {
    console.log("No matching stocks were found.");
    console.log("");
    return;
  }

  // Enrich each result with the latest closing price from the external API
  const resultsWithPrices = await stockSearchService.enrichResultsWithLatestPrices(searchResponse.results);
  // Display the results as a nicely formatted table in the console
  console.table(buildTableRows(resultsWithPrices));
  console.log(""); // Blank line for readability
}

/**
 * Main entry point for the CLI application.
 * Sets up the interactive prompt and runs a loop that reads user input,
 * executes searches, and handles errors until the user types "exit" or "quit".
 */
async function main() {
  // Check that the required API key is set before doing anything
  if (!process.env.ROIC_API_KEY) {
    console.error("Missing ROIC_API_KEY in your environment. Add it to .env before running the live search CLI.");
    process.exitCode = 1; // Exit with a non-zero code to signal failure
    return;
  }

  // Create a readline interface to handle interactive terminal input
  const terminal = readline.createInterface({
    input: stdin,  // Read from keyboard
    output: stdout, // Write to console
  });

  // Show welcome/instruction messages to the user
  console.log("Live stock search CLI");
  console.log('Type a ticker or company name, then press Enter. Type "exit" or "quit" to leave.');

  try {
    // Main loop: keep asking for input until the user quits
    while (true) {
      // Display the prompt symbol and wait for user input
      const rawInput = await terminal.question("> ");
      const query = rawInput.trim(); // Remove leading/trailing whitespace

      // If the user pressed Enter without typing anything, ask again
      if (!query) {
        console.log("Please type a ticker or company name.");
        continue;
      }

      // Allow the user to exit the loop (and the program) gracefully
      if (query.toLowerCase() === "exit" || query.toLowerCase() === "quit") {
        break;
      }

      // Try to run the search query; catch and display any errors
      try {
        await runQuery(query);
      } catch (error) {
        console.log("");
        console.error(`Search failed for "${query}".`);
        // If the error has an HTTP status code, show it
        if (error.statusCode) {
          console.error(`Status: ${error.statusCode}`);
        }
        // Show the detailed error details for debugging
        console.error(`Details: ${JSON.stringify(error.details || error.message, null, 2)}`);
        console.log("");
      }
    }
  } finally {
    // Always close the readline interface, even if an error occurred
    terminal.close();
  }
}

// Start the main function. If it throws an unhandled error, log it and exit the process
main().catch((error) => {
  console.error(`CLI startup failed: ${error.message}`);
  process.exit(1); // Force exit with a failure code
});
