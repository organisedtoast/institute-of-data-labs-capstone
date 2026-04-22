// Purpose of this test file:
// This tiny regression test protects server startup by proving the watchlist
// model can be required without throwing during module initialization.
// The recent startup bug happened before Express or MongoDB work even began,
// so loading the model directly is the smallest reliable safety check.

const assert = require("node:assert/strict");
const test = require("node:test");

test("WatchlistStock model loads without initialization-order errors", async () => {
  // Clear the module cache for this one file so the test truly exercises the
  // file's top-level declaration order instead of reusing an already-loaded copy.
  const modelPath = require.resolve("../models/WatchlistStock");
  delete require.cache[modelPath];

  let loadedModel = null;

  assert.doesNotThrow(() => {
    loadedModel = require("../models/WatchlistStock");
  });

  // A successful require should return the real Mongoose model constructor.
  assert.equal(typeof loadedModel?.modelName, "string");
  assert.equal(loadedModel.modelName, "WatchlistStock");
});
