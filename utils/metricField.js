// Every editable or backend-managed metric uses the same internal shape.
// That shared shape lets imported values, user overrides, and derived/system
// defaults all follow one predictable rule set.

function createMetricField(value = null, sourceOfTruth = "system") {
  return {
    roicValue: value,
    userValue: null,
    effectiveValue: value,
    sourceOfTruth,
    lastOverriddenAt: null,
  };
}

function hasUserOverride(field) {
  return field && field.userValue !== null && field.userValue !== undefined;
}

function resolveEffectiveValue(field, nonUserSource = "roic") {
  if (hasUserOverride(field)) {
    return {
      ...field,
      effectiveValue: field.userValue,
      sourceOfTruth: "user",
    };
  }

  return {
    ...field,
    effectiveValue: field?.roicValue ?? null,
    sourceOfTruth: nonUserSource,
  };
}

// Backend calculations and ROIC imports both write into `roicValue`.
// The original field name stays for compatibility, even when the default value
// actually came from a formula or from a system placeholder instead of ROIC.
function assignMetricValue(field, value, sourceOfTruth) {
  field.roicValue = value;
  const resolved = resolveEffectiveValue(field, sourceOfTruth);
  field.effectiveValue = resolved.effectiveValue;
  field.sourceOfTruth = resolved.sourceOfTruth;
  return field;
}

module.exports = {
  assignMetricValue,
  createMetricField,
  hasUserOverride,
  resolveEffectiveValue,
};
