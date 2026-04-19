// This CLI script helps a beginner inspect what a category or stock would see
// without booting a frontend. It prints the seeded lens name plus ordered card
// and detail field lists.

require("dotenv").config();

const { connectDB, disconnectDB } = require("../config/db");
const WatchlistStock = require("../models/WatchlistStock");
const { ensureDefaultLenses, resolveVisibleFieldsForCategory, resolveVisibleFieldsForStock } = require("../services/lensService");

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function printFields(title, fields) {
  console.log(title);
  for (const field of fields) {
    console.log(`- [${field.section}] ${field.label} -> ${field.fieldPath}`);
  }
}

async function main() {
  const category = readArg("--category");
  const ticker = readArg("--ticker");

  if (!category && !ticker) {
    console.error("Usage: node scripts/inspect-lens-fields.js --category \"Profitable Hi Growth\" OR --ticker AAPL");
    process.exit(1);
  }

  await connectDB();
  await ensureDefaultLenses();

  try {
    let resolved;
    if (ticker) {
      const stock = await WatchlistStock.findOne({ tickerSymbol: ticker.toUpperCase() });
      if (!stock) {
        throw new Error(`Stock not found for ticker: ${ticker}`);
      }

      resolved = await resolveVisibleFieldsForStock(stock);
    } else {
      resolved = await resolveVisibleFieldsForCategory(category);
    }

    console.log(`Lens: ${resolved.lens.name}`);
    printFields("Card Fields", resolved.cardFields);
    printFields("Detail Fields", resolved.detailFields);
  } finally {
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
