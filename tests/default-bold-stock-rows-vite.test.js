const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

async function withViteServer(runAssertions) {
  const { createServer, loadConfigFromFile, mergeConfig } = await import("vite");
  const repoRoot = path.resolve(__dirname, "..");
  const configFile = path.join(repoRoot, "vite.config.mjs");
  const loadedConfig = await loadConfigFromFile(
    { command: "serve", mode: "test" },
    configFile,
  );
  const viteServer = await createServer(mergeConfig(loadedConfig?.config || {}, {
    configFile,
    root: repoRoot,
    server: {
      middlewareMode: true,
    },
    appType: "custom",
  }));

  try {
    await runAssertions(viteServer);
  } finally {
    await viteServer.close();
  }
}

test("the browser-facing default-bold wrapper stays ESM-safe when Vite transforms it for /stocks", async () => {
  await withViteServer(async (viteServer) => {
    // This regression happened only in the browser-facing Vite path:
    // `/stocks` imported the ESM wrapper, which then imported a CommonJS helper.
    // We inspect the transformed module text directly so the test fails before
    // that mistake can reach a real browser again.
    const esmWrapper = await viteServer.transformRequest("/shared/defaultBoldStockRows.mjs");

    assert.ok(esmWrapper);
    assert.doesNotMatch(esmWrapper.code, /module\.exports/);
    assert.doesNotMatch(esmWrapper.code, /defaultBoldStockRowsCore/);
    assert.match(esmWrapper.code, /defaultBoldStockRowsJson/);
    assert.match(esmWrapper.code, /new Set/);
  });
});
