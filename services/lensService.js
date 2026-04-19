const Lens = require("../models/Lens");
const { DEFAULT_LENSES, normalizeCategoryName } = require("../catalog/fieldCatalog");

// The workbook-defined lenses are treated like starter data. We seed them on
// startup so an empty local database is immediately usable in Compass, tests,
// and CLI scripts without a manual preparation step.
async function ensureDefaultLenses() {
  for (const lens of DEFAULT_LENSES) {
    await Lens.findOneAndUpdate(
      { key: lens.key },
      lens,
      { upsert: true, returnDocument: "after", runValidators: true }
    );
  }
}

async function findActiveLensByName(name) {
  return Lens.findOne({
    normalizedName: normalizeCategoryName(name),
    isActive: true,
  });
}

async function assertActiveLensName(name) {
  const lens = await findActiveLensByName(name);
  if (!lens) {
    const error = new Error(`Unknown investmentCategory: ${name}`);
    error.statusCode = 400;
    throw error;
  }

  return lens;
}

async function resolveVisibleFieldsForCategory(name) {
  const lens = await assertActiveLensName(name);
  const sortedFieldConfigs = [...lens.fieldConfigs].sort((left, right) => left.order - right.order);

  return {
    lens,
    cardFields: sortedFieldConfigs.filter((field) => field.surface === "card"),
    detailFields: sortedFieldConfigs.filter((field) => field.surface === "detail"),
  };
}

async function resolveVisibleFieldsForStock(stock) {
  return resolveVisibleFieldsForCategory(stock.investmentCategory);
}

module.exports = {
  assertActiveLensName,
  ensureDefaultLenses,
  findActiveLensByName,
  resolveVisibleFieldsForCategory,
  resolveVisibleFieldsForStock,
};
