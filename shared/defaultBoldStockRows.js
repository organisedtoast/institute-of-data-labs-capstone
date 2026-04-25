const defaultBoldStockRows = require("./defaultBoldStockRows.json");
const buildDefaultBoldStockRowsHelper = require("./defaultBoldStockRowsCore");

// The backend can safely reuse the CommonJS helper because Node loads both
// files in the same module format. The browser-facing `.mjs` wrapper keeps its
// own tiny ESM derivation so Vite dev never has to bridge into CommonJS.
module.exports = buildDefaultBoldStockRowsHelper(defaultBoldStockRows);
