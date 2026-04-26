const path = require("node:path");

function installServerStartupShim() {
  const migrationServicePath = path.resolve(
    __dirname,
    "..",
    "..",
    "services",
    "investmentCategoryMigrationService.js",
  );

  require.cache[migrationServicePath] = {
    id: migrationServicePath,
    filename: migrationServicePath,
    loaded: true,
    exports: {
      async migrateInvestmentCategoryNames() {
        // The performance harness only needs the current runtime routes. It
        // does not need to benchmark historical one-off migration work.
      },
    },
  };
}

module.exports = {
  installServerStartupShim,
};
