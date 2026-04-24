function buildIsolatedMongoUri(baseMongoUri, databaseName) {
  const normalizedUri = String(baseMongoUri || "").trim();
  const normalizedDatabaseName = String(databaseName || "").trim();

  if (!normalizedUri) {
    throw new Error("MONGO_URI is required to build an isolated test database URI.");
  }

  if (!normalizedDatabaseName) {
    throw new Error("databaseName is required to build an isolated test database URI.");
  }

  const queryIndex = normalizedUri.indexOf("?");
  const uriWithoutQuery = queryIndex === -1 ? normalizedUri : normalizedUri.slice(0, queryIndex);
  const uriQuery = queryIndex === -1 ? "" : normalizedUri.slice(queryIndex);
  const databaseSlashIndex = uriWithoutQuery.lastIndexOf("/");

  if (databaseSlashIndex === -1) {
    throw new Error(`Unable to derive a database path from MONGO_URI: ${normalizedUri}`);
  }

  return `${uriWithoutQuery.slice(0, databaseSlashIndex + 1)}${normalizedDatabaseName}${uriQuery}`;
}

module.exports = {
  buildIsolatedMongoUri,
};
