function parseRequestedImportRangeYears(requestedYears) {
  if (requestedYears === undefined || requestedYears === null) {
    return {
      years: null,
      importRangeYearsExplicit: false,
    };
  }

  const parsedYears = Number(requestedYears);
  if (!Number.isInteger(parsedYears) || parsedYears <= 0) {
    const error = new Error("years must be a positive integer when provided.");
    error.statusCode = 400;
    throw error;
  }

  return {
    years: parsedYears,
    importRangeYearsExplicit: true,
  };
}

function resolveStoredImportRange(sourceMeta = {}) {
  const storedYears = Number(sourceMeta?.importRangeYears);
  const isExplicit = sourceMeta?.importRangeYearsExplicit === true;

  if (isExplicit && Number.isInteger(storedYears) && storedYears > 0) {
    return {
      years: storedYears,
      importRangeYearsExplicit: true,
    };
  }

  return {
    years: null,
    importRangeYearsExplicit: false,
  };
}

module.exports = {
  parseRequestedImportRangeYears,
  resolveStoredImportRange,
};
