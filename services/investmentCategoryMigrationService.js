const WatchlistStock = require("../models/WatchlistStock");
const Lens = require("../models/Lens");
const { normalizeCategoryName } = require("../catalog/fieldCatalog");

const CATEGORY_RENAMES = [
  { previousName: "Cyclicals", nextName: "Cyclical" },
  { previousName: "Lenders", nextName: "Lender" },
];

async function migrateWatchlistInvestmentCategories() {
  for (const { previousName, nextName } of CATEGORY_RENAMES) {
    await WatchlistStock.updateMany(
      { investmentCategory: previousName },
      { $set: { investmentCategory: nextName } }
    );
  }
}

async function migrateLensIdentifiers() {
  for (const { previousName, nextName } of CATEGORY_RENAMES) {
    const previousNormalizedName = normalizeCategoryName(previousName);
    const nextNormalizedName = normalizeCategoryName(nextName);
    const existingRenamedLens = await Lens.findOne({ key: nextNormalizedName });
    const legacyLens = await Lens.findOne({ key: previousNormalizedName });

    if (legacyLens && !existingRenamedLens) {
      legacyLens.key = nextNormalizedName;
      legacyLens.name = nextName;
      legacyLens.normalizedName = nextNormalizedName;
      await legacyLens.save();
      continue;
    }

    if (legacyLens && existingRenamedLens) {
      await Lens.deleteOne({ _id: legacyLens._id });
    }
  }
}

async function migrateInvestmentCategoryNames() {
  await migrateWatchlistInvestmentCategories();
  await migrateLensIdentifiers();
}

module.exports = {
  CATEGORY_RENAMES,
  migrateInvestmentCategoryNames,
};
