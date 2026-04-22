// Every editable or backend-managed metric uses the same internal shape.
// That shared shape lets imported values, user overrides, and derived/system
// defaults all follow one predictable rule set.

function getBaseSourceOfTruth(field, fallbackSource = "system") {
  if (field?.baseSourceOfTruth && field.baseSourceOfTruth !== "user") {
    return field.baseSourceOfTruth;
  }

  if (fallbackSource && fallbackSource !== "user") {
    return fallbackSource;
  }

  if (field?.sourceOfTruth && field.sourceOfTruth !== "user") {
    return field.sourceOfTruth;
  }

  // Older documents were created before we stored the last non-user source
  // separately. If a user override was later cleared, those legacy documents
  // could still be stuck saying `"user"`. We infer a safe fallback here so
  // the backend can recover without a manual migration.
  if (field?.roicValue !== null && field?.roicValue !== undefined) {
    return "roic";
  }

  return fallbackSource === "user" ? "system" : fallbackSource;
}

function createMetricField(value = null, sourceOfTruth = "system") {
  const baseSourceOfTruth = getBaseSourceOfTruth(
    { roicValue: value, sourceOfTruth },
    sourceOfTruth,
  );

  return {
    roicValue: value,
    userValue: null,
    effectiveValue: value,
    sourceOfTruth,
    baseSourceOfTruth,
    lastOverriddenAt: null,
  };
}

function hasUserOverride(field) {
  return field && field.userValue !== null && field.userValue !== undefined;
}

function resolveEffectiveValue(field, nonUserSource = "roic") {
  const baseSourceOfTruth = getBaseSourceOfTruth(field, nonUserSource);

  if (hasUserOverride(field)) {
    return {
      ...field,
      baseSourceOfTruth,
      effectiveValue: field.userValue,
      sourceOfTruth: "user",
    };
  }

  return {
    ...field,
    baseSourceOfTruth,
    effectiveValue: field?.roicValue ?? null,
    sourceOfTruth: baseSourceOfTruth,
  };
}

// Backend calculations and ROIC imports both write into `roicValue`.
// The original field name stays for compatibility, even when the default value
// actually came from a formula or from a system placeholder instead of ROIC.
function assignMetricValue(field, value, sourceOfTruth) {
  field.roicValue = value;
  // Explicit non-user writes should become the new fallback source. This lets
  // ROIC imports and derived calculations overwrite the placeholder `"system"`
  // default that empty fields start with.
  field.baseSourceOfTruth = sourceOfTruth && sourceOfTruth !== "user"
    ? sourceOfTruth
    : getBaseSourceOfTruth(field, sourceOfTruth);
  const resolved = resolveEffectiveValue(field, field.baseSourceOfTruth);
  field.baseSourceOfTruth = resolved.baseSourceOfTruth;
  field.effectiveValue = resolved.effectiveValue;
  field.sourceOfTruth = resolved.sourceOfTruth;
  return field;
}

module.exports = {
  assignMetricValue,
  createMetricField,
  getBaseSourceOfTruth,
  hasUserOverride,
  resolveEffectiveValue,
};
