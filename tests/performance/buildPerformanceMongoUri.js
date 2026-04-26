function sanitizeDatabaseName(name) {
  return String(name || "stockgossipmonitor_performance")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function buildPerformanceMongoUri(baseUri, databaseName) {
  if (!baseUri || typeof baseUri !== "string") {
    throw new Error("A base MONGO_URI is required for performance tooling.");
  }

  const safeDatabaseName = sanitizeDatabaseName(databaseName);

  try {
    const parsedUri = new URL(baseUri);
    parsedUri.pathname = `/${safeDatabaseName}`;
    return parsedUri.toString();
  } catch {
    // Some MongoDB connection strings use forms that the WHATWG URL parser
    // does not like. This fallback still gives beginners one predictable
    // database-name swap instead of failing mysteriously.
    if (baseUri.includes("?")) {
      const [prefix, queryString] = baseUri.split("?");
      return `${prefix.replace(/\/[^/]*$/, `/${safeDatabaseName}`)}?${queryString}`;
    }

    return baseUri.replace(/\/[^/]*$/, `/${safeDatabaseName}`);
  }
}

module.exports = {
  buildPerformanceMongoUri,
};
