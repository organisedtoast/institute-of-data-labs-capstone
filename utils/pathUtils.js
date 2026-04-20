// These tiny helpers let controllers and services work with nested grouped
// metric paths without depending on an external library like lodash.

function getNestedValue(target, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, part) => (value == null ? undefined : value[part]), target);
}

function setNestedValue(target, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (parts.length === 0) {
    return target;
  }

  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
  return target;
}

function flattenObjectPaths(value, prefix = "") {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [{ path: prefix, value }] : [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return flattenObjectPaths(nestedValue, nextPrefix);
  });
}

module.exports = {
  flattenObjectPaths,
  getNestedValue,
  setNestedValue,
};
