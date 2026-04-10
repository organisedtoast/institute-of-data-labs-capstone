// This middleware file validates common request parameters before they reach a controller.

// The validateTicker function checks if a ticker symbol is provided and is a non-empty string.
// The validateFiscalYear function checks if the fiscal year is a valid number within a reasonable range.
 
function validateTicker(req, res, next) {
  const ticker = req.params.ticker || req.body.tickerSymbol;
  if (!ticker || typeof ticker !== "string" || ticker.trim() === "") {
    return res.status(400).json({ error: "Ticker symbol is required." });
  }
  next(); // Passes control to the next middleware or controller
}

function validateCreateStock(req, res, next) {
  const { tickerSymbol, investmentCategory } = req.body;

  if (!tickerSymbol || typeof tickerSymbol !== "string" || tickerSymbol.trim() === "") {
    return res.status(400).json({ error: "tickerSymbol is required and must be a non-empty string." });
  }

  if (investmentCategory !== undefined && typeof investmentCategory !== "string") {
    return res.status(400).json({ error: "investmentCategory must be a string." });
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
    req.body.investmentCategory !== undefined &&
    typeof req.body.investmentCategory !== "string"
  ) {
    return res.status(400).json({ error: "investmentCategory must be a string." });
  }

  if (req.body.companyName !== undefined) {
    if (typeof req.body.companyName !== "string" || req.body.companyName.trim() === "") {
      return res.status(400).json({ error: "companyName must be a non-empty string." });
    }
  }

  next();
}
 
function validateFiscalYear(req, res, next) {
  const year = parseInt(req.params.fiscalYear);
  if (isNaN(year) || year < 1900 || year > 2100) {
    return res.status(400).json({ error: "Invalid fiscal year." });
  }
  next();
}
 
module.exports = {
  validateTicker,
  validateCreateStock,
  validateUpdateStock,
  validateFiscalYear,
};
