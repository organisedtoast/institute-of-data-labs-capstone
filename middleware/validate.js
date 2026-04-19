// These validators keep the request contract readable and friendly.
// We validate the easy shape checks here and leave database lookups, such as
// checking whether a lens exists, to controllers/services.

function validateTicker(req, res, next) {
  const ticker = req.params.ticker || req.body.tickerSymbol;
  if (!ticker || typeof ticker !== "string" || ticker.trim() === "") {
    return res.status(400).json({ error: "Ticker symbol is required." });
  }

  next();
}

function validateCreateStock(req, res, next) {
  const { tickerSymbol, investmentCategory } = req.body;

  if (!tickerSymbol || typeof tickerSymbol !== "string" || tickerSymbol.trim() === "") {
    return res.status(400).json({ error: "tickerSymbol is required and must be a non-empty string." });
  }

  if (!investmentCategory || typeof investmentCategory !== "string" || investmentCategory.trim() === "") {
    return res.status(400).json({ error: "investmentCategory is required and must be a non-empty string." });
  }

  next();
}

function validateUpdateStock(req, res, next) {
  const allowed = ["investmentCategory", "companyName"];
  const providedKeys = Object.keys(req.body || {});
  const unsupportedKeys = providedKeys.filter((key) => !allowed.includes(key));

  if (providedKeys.length === 0) {
    return res.status(400).json({
      error: "At least one supported field is required.",
      allowedFields: allowed,
    });
  }

  if (unsupportedKeys.length > 0) {
    return res.status(400).json({
      error: "Unsupported update field(s).",
      allowedFields: allowed,
      unsupportedFields: unsupportedKeys,
    });
  }

  if (
    req.body.investmentCategory !== undefined
    && (typeof req.body.investmentCategory !== "string" || req.body.investmentCategory.trim() === "")
  ) {
    return res.status(400).json({ error: "investmentCategory must be a non-empty string." });
  }

  if (
    req.body.companyName !== undefined
    && (typeof req.body.companyName !== "string" || req.body.companyName.trim() === "")
  ) {
    return res.status(400).json({ error: "companyName must be a non-empty string." });
  }

  next();
}

function validateFiscalYear(req, res, next) {
  const year = parseInt(req.params.fiscalYear, 10);
  if (Number.isNaN(year) || year < 1900 || year > 2100) {
    return res.status(400).json({ error: "Invalid fiscal year." });
  }

  next();
}

module.exports = {
  validateCreateStock,
  validateFiscalYear,
  validateTicker,
  validateUpdateStock,
};
