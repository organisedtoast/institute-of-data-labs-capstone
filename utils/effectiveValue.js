// This file keeps a small compatibility wrapper around the shared metric-field
// helpers so older controller imports still read cleanly for a beginner.

const { resolveEffectiveValue } = require("./metricField");

module.exports = { resolveEffectiveValue };
