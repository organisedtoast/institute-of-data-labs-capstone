// These validators keep the request contract readable and friendly.
// We validate the easy shape checks here and leave database lookups, such as
// checking whether a lens exists, to controllers/services.

function getTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasNonEmptyTrimmedString(value) {
  return getTrimmedString(value) !== "";
}

function getMonthRangeValidationMessage(
  startValue,
  endValue,
  isValidMonthString,
  options = {},
) {
  const {
    startLabel = "startMonth",
    endLabel = "endMonth",
  } = options;
  const startMonth = getTrimmedString(startValue);
  const endMonth = getTrimmedString(endValue);

  if ((startMonth && !isValidMonthString(startMonth)) || (endMonth && !isValidMonthString(endMonth))) {
    return `${startLabel} and ${endLabel} must use the YYYY-MM format.`;
  }

  if (startMonth && endMonth && startMonth > endMonth) {
    return `${startLabel} must be earlier than or equal to ${endLabel}.`;
  }

  return "";
}

function validateTicker(req, res, next) {
  const ticker = req.params.ticker || req.body.tickerSymbol;
  if (!hasNonEmptyTrimmedString(ticker)) {
    return res.status(400).json({ error: "Ticker symbol is required." });
  }

  next();
}

function validateCreateStock(req, res, next) {
  const { tickerSymbol, investmentCategory } = req.body;

  if (!hasNonEmptyTrimmedString(tickerSymbol)) {
    return res.status(400).json({ error: "tickerSymbol is required and must be a non-empty string." });
  }

  if (!hasNonEmptyTrimmedString(investmentCategory)) {
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
    && !hasNonEmptyTrimmedString(req.body.investmentCategory)
  ) {
    return res.status(400).json({ error: "investmentCategory must be a non-empty string." });
  }

  if (
    req.body.companyName !== undefined
    && !hasNonEmptyTrimmedString(req.body.companyName)
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
  getMonthRangeValidationMessage,
  getTrimmedString,
  hasNonEmptyTrimmedString,
  validateCreateStock,
  validateFiscalYear,
  validateTicker,
  validateUpdateStock,
};
