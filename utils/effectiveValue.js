// This utility file resolves which value to use for any override-capable field.

// Rule: if userValue exists, it wins. Otherwise, use roicValue.
 
function resolveEffectiveValue(field) {
  if (field.userValue !== null && field.userValue !== undefined) {
    return {
      ...field,
      effectiveValue: field.userValue,
      sourceOfTruth: "user",
    };
  }
  return {
    ...field,
    effectiveValue: field.roicValue,
    sourceOfTruth: "roic",
  };
}
 
module.exports = { resolveEffectiveValue };
