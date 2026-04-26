require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const express = require("express");
const { chromium } = require("playwright");

const { buildPerformanceMongoUri } = require("./buildPerformanceMongoUri");
const {
  compareScenarioMetrics,
  ensureDirectoryExists,
  readJsonFile,
  writeJsonFile,
} = require("./baselineUtils");
const {
  BROWSER_BASELINE_FILE,
  DEFAULT_ANNUAL_HISTORY_SIZE,
  DEFAULT_BROWSER_SCROLL_STEPS,
  DEFAULT_DATASET_SIZES,
  DEFAULT_LEGACY_PERCENTAGE,
  DEFAULT_PRICE_HISTORY_MONTHS,
  DEFAULT_SEED_CHUNK_SIZE,
  PERFORMANCE_RESULTS_DIR,
  REPO_ROOT,
  getTimestampSlug,
} = require("./performanceConfig");
const {
  clearPerformanceCollections,
  installPerformanceRoicStubs,
  seedLargeWatchlistDataset,
} = require("./largeWatchlistDataset");
const { installDefaultBoldRowsShim } = require("./installDefaultBoldRowsShim");
const { installServerStartupShim } = require("./installServerStartupShim");

const BROWSER_BENCHMARK_STATUS = Object.freeze({
  PASSED: "passed",
  BENCHMARK_FAILED: "benchmark_failed",
  SETUP_BLOCKED: "setup_blocked",
});

function buildResultEnvelope(overrides = {}) {
  return {
    generatedAt: new Date().toISOString(),
    harness: "browser",
    regressionsDetected: false,
    scenarios: [],
    status: BROWSER_BENCHMARK_STATUS.PASSED,
    ...overrides,
  };
}

function writeBrowserResultFiles(resultDirectory, result, prefix = "browser-benchmark") {
  ensureDirectoryExists(resultDirectory);
  const outputFile = path.join(resultDirectory, `${prefix}-${getTimestampSlug()}.json`);
  writeJsonFile(outputFile, result);
  writeJsonFile(path.join(resultDirectory, `${prefix}-latest.json`), result);
  return outputFile;
}

function getHeadlessBenchmarkFlag(env = process.env) {
  return env.PERF_BROWSER_HEADLESS === "1";
}

function getConfiguredAndSystemCandidates(env = process.env) {
  return [
    {
      label: "configured browser path",
      path: env.PERF_BROWSER_EXECUTABLE_PATH || null,
      source: "configured",
    },
    {
      label: "system Chrome (Program Files)",
      path: path.join(
        env.ProgramFiles || "",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      source: "system",
    },
    {
      label: "system Chrome (Program Files x86)",
      path: path.join(
        env["ProgramFiles(x86)"] || "",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      source: "system",
    },
  ].filter((candidate) => candidate.path);
}

function detectBrowserAvailability(rawOptions = {}) {
  const env = rawOptions.env || process.env;
  const pathExists = rawOptions.pathExists || fs.existsSync;
  const chromiumModule = rawOptions.chromiumModule || chromium;
  const discoveredCandidates = [];
  const launchCandidates = [];
  const seenPaths = new Set();

  for (const candidate of getConfiguredAndSystemCandidates(env)) {
    if (seenPaths.has(candidate.path)) {
      continue;
    }
    seenPaths.add(candidate.path);
    const exists = pathExists(candidate.path);
    const candidateRecord = {
      ...candidate,
      exists,
      useExecutablePath: true,
    };
    discoveredCandidates.push(candidateRecord);
    if (exists) {
      launchCandidates.push(candidateRecord);
    }
  }

  let bundledChromiumPath = null;
  let bundledChromiumFound = false;
  let bundledChromiumError = null;

  try {
    bundledChromiumPath = chromiumModule.executablePath();
    bundledChromiumFound = Boolean(bundledChromiumPath) && pathExists(bundledChromiumPath);
  } catch (error) {
    bundledChromiumError = error.message;
  }

  if (bundledChromiumPath) {
    discoveredCandidates.push({
      exists: bundledChromiumFound,
      label: "Playwright bundled Chromium",
      path: bundledChromiumPath,
      source: "bundled",
      useExecutablePath: false,
    });
  }

  if (bundledChromiumFound) {
    launchCandidates.push({
      exists: true,
      label: "Playwright bundled Chromium",
      path: bundledChromiumPath,
      source: "bundled",
      useExecutablePath: false,
    });
  }

  const configuredPath = env.PERF_BROWSER_EXECUTABLE_PATH || null;
  const configuredBrowserFound = Boolean(
    configuredPath && discoveredCandidates.some(
      (candidate) => candidate.source === "configured" && candidate.exists,
    ),
  );
  const systemBrowserFound = discoveredCandidates.some(
    (candidate) => candidate.source === "system" && candidate.exists,
  );
  const chosenCandidate = launchCandidates[0] || null;

  return {
    bundledChromiumError,
    bundledChromiumFound,
    bundledChromiumPath,
    chosenCandidate,
    configuredBrowserFound,
    configuredPathMissing: Boolean(configuredPath) && !configuredBrowserFound,
    configuredPathProvided: Boolean(configuredPath),
    discoveredCandidates,
    launchCandidates,
    preferredExecutablePath: configuredPath,
    systemBrowserFound,
  };
}

async function launchBrowserCandidate(candidate, rawOptions = {}) {
  const chromiumModule = rawOptions.chromiumModule || chromium;
  const headless = rawOptions.headless ?? getHeadlessBenchmarkFlag(rawOptions.env);

  if (!candidate) {
    throw new Error("No browser launch candidate was provided.");
  }

  if (candidate.useExecutablePath) {
    return chromiumModule.launch({
      executablePath: candidate.path,
      headless,
    });
  }

  return chromiumModule.launch({ headless });
}

function classifyBrowserLaunchError(error) {
  const message = error?.message || String(error);
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("spawn eperm")) {
    return {
      launchBlockedReason: "permission_blocked",
      launchErrorText: message,
    };
  }

  if (
    normalizedMessage.includes("enoent")
    || normalizedMessage.includes("executable doesn't exist")
    || normalizedMessage.includes("failed to launch")
  ) {
    return {
      launchBlockedReason: "missing_executable",
      launchErrorText: message,
    };
  }

  return {
    launchBlockedReason: "unknown_launch_failure",
    launchErrorText: message,
  };
}

async function runBrowserLaunchSmokeTest(rawOptions = {}) {
  const candidate = rawOptions.candidate || null;
  const launchBrowser = rawOptions.launchBrowser || ((launchOptions) => launchBrowserCandidate(candidate, launchOptions));
  let browser = null;

  if (!candidate) {
    return {
      chosenCandidate: null,
      launchBlockedReason: "no_browser_candidate",
      launchErrorText: "No browser executable could be found for the Playwright benchmark setup check.",
      status: BROWSER_BENCHMARK_STATUS.SETUP_BLOCKED,
    };
  }

  try {
    browser = await launchBrowser({
      chromiumModule: rawOptions.chromiumModule,
      env: rawOptions.env,
      headless: rawOptions.headless,
    });
    return {
      chosenCandidate: candidate,
      launchBlockedReason: null,
      launchErrorText: null,
      status: BROWSER_BENCHMARK_STATUS.PASSED,
    };
  } catch (error) {
    const launchFailure = classifyBrowserLaunchError(error);
    return {
      chosenCandidate: candidate,
      launchBlockedReason: launchFailure.launchBlockedReason,
      launchErrorText: launchFailure.launchErrorText,
      status: BROWSER_BENCHMARK_STATUS.SETUP_BLOCKED,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function performBrowserSetupCheck(rawOptions = {}) {
  const availability = detectBrowserAvailability({
    chromiumModule: rawOptions.chromiumModule,
    env: rawOptions.env,
    pathExists: rawOptions.pathExists,
  });
  let smokeTest = {
    chosenCandidate: availability.chosenCandidate,
    launchBlockedReason: availability.chosenCandidate ? null : "no_browser_candidate",
    launchErrorText: availability.chosenCandidate
      ? null
      : "No installed browser candidate could be found for the Playwright benchmark.",
    status: availability.chosenCandidate
      ? BROWSER_BENCHMARK_STATUS.PASSED
      : BROWSER_BENCHMARK_STATUS.SETUP_BLOCKED,
  };

  // Browser install and browser launch are different checks. A browser file can
  // exist on disk and still fail to start because the local environment blocks
  // opening child browser processes.
  if (!rawOptions.skipLaunchProbe && availability.chosenCandidate) {
    smokeTest = await runBrowserLaunchSmokeTest({
      candidate: availability.chosenCandidate,
      chromiumModule: rawOptions.chromiumModule,
      env: rawOptions.env,
      headless: rawOptions.headless,
      launchBrowser: rawOptions.launchBrowser,
    });
  }

  const setupDiagnostics = {
    bundledChromiumFound: availability.bundledChromiumFound,
    bundledChromiumPath: availability.bundledChromiumPath,
    bundledChromiumError: availability.bundledChromiumError,
    chosenCandidate: smokeTest.chosenCandidate || availability.chosenCandidate,
    configuredBrowserFound: availability.configuredBrowserFound,
    configuredPathMissing: availability.configuredPathMissing,
    configuredPathProvided: availability.configuredPathProvided,
    discoveredCandidates: availability.discoveredCandidates,
    launchCandidates: availability.launchCandidates,
    launchErrorText: smokeTest.launchErrorText,
    launchProbeStatus: smokeTest.status,
    launchProbeSkipped: Boolean(rawOptions.skipLaunchProbe),
    launchBlockedReason: smokeTest.launchBlockedReason,
    preferredExecutablePath: availability.preferredExecutablePath,
    setupStatus: smokeTest.status,
    systemBrowserFound: availability.systemBrowserFound,
  };

  return {
    setupDiagnostics,
    status: smokeTest.status,
  };
}

function ensureFrontendBuild() {
  const distPath = path.join(REPO_ROOT, "dist", "index.html");
  if (fs.existsSync(distPath)) {
    return;
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const buildResult = spawnSync(npmCommand, ["run", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });

  if (buildResult.status !== 0) {
    throw new Error("Unable to build the frontend before running the browser benchmark.");
  }
}

function createProxyServer({ backendBaseUrl, frontendPort }) {
  const app = express();
  const distPath = path.join(REPO_ROOT, "dist");

  // The raw body keeps proxying simple because the benchmark only needs to
  // forward requests exactly as the browser sent them.
  app.use("/api", express.raw({ type: "*/*", limit: "10mb" }));
  app.use("/api", async (req, res) => {
    const upstreamResponse = await fetch(`${backendBaseUrl}${req.originalUrl}`, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(([headerName]) => headerName.toLowerCase() !== "host"),
      ),
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    });

    res.status(upstreamResponse.status);
    upstreamResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-length") {
        return;
      }
      res.setHeader(key, value);
    });

    const upstreamBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    res.send(upstreamBuffer);
  });

  app.use(express.static(distPath));
  app.use((_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(frontendPort, () => resolve(server));
    server.on("error", reject);
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function buildBrowserScenarioResult({ baseline, datasetSize, metrics, metadata = {}, scenarioName }) {
  const comparison = compareScenarioMetrics(metrics, baseline?.scenarios?.[scenarioName] || {});
  return {
    datasetSize,
    metadata,
    metrics,
    passed:
      comparison.passed
      && metadata.progressiveActivationWorked !== false
      && metadata.firstPaintBeatRefresh !== false,
    regressionBudgetPct: comparison.allowedRegressionPct,
    scenarioName,
    comparisons: comparison.comparisons,
  };
}

async function runBrowserBenchmarkSetupCheck(rawOptions = {}) {
  const resultDirectory = rawOptions.resultDirectory || path.join(PERFORMANCE_RESULTS_DIR, "browser");
  const setupCheck = await performBrowserSetupCheck(rawOptions);
  const result = buildResultEnvelope({
    message:
      setupCheck.status === BROWSER_BENCHMARK_STATUS.PASSED
        ? "Browser benchmark setup check passed."
        : "Browser benchmark setup is blocked before the real app benchmark can start.",
    setupDiagnostics: setupCheck.setupDiagnostics,
    status: setupCheck.status,
  });
  const outputFile = writeBrowserResultFiles(resultDirectory, result, "browser-benchmark-setup-check");

  return {
    outputFile,
    result,
  };
}

async function runBrowserBenchmark(rawOptions = {}) {
  if (rawOptions.preflightOnly) {
    return runBrowserBenchmarkSetupCheck(rawOptions);
  }

  const datasetSizes = Array.isArray(rawOptions.datasetSizes) && rawOptions.datasetSizes.length
    ? rawOptions.datasetSizes
    : [...DEFAULT_DATASET_SIZES];
  const legacyPercentage = Number.isFinite(rawOptions.legacyPercentage)
    ? rawOptions.legacyPercentage
    : DEFAULT_LEGACY_PERCENTAGE;
  const annualHistorySize = Number.isInteger(rawOptions.annualHistorySize)
    ? rawOptions.annualHistorySize
    : DEFAULT_ANNUAL_HISTORY_SIZE;
  const chunkSize = Number.isInteger(rawOptions.chunkSize) && rawOptions.chunkSize > 0
    ? rawOptions.chunkSize
    : DEFAULT_SEED_CHUNK_SIZE;
  const priceHistoryMonths = Number.isInteger(rawOptions.priceHistoryMonths)
    ? rawOptions.priceHistoryMonths
    : DEFAULT_PRICE_HISTORY_MONTHS;
  const scrollSteps = Number.isInteger(rawOptions.scrollSteps) && rawOptions.scrollSteps > 0
    ? rawOptions.scrollSteps
    : DEFAULT_BROWSER_SCROLL_STEPS;
  const browserPort = rawOptions.frontendPort || 4174;
  const backendPort = rawOptions.backendPort || 3330;
  const baselineFile = rawOptions.baselineFile || BROWSER_BASELINE_FILE;
  const resultDirectory = rawOptions.resultDirectory || path.join(PERFORMANCE_RESULTS_DIR, "browser");
  const setupCheck = await performBrowserSetupCheck(rawOptions);

  if (setupCheck.status === BROWSER_BENCHMARK_STATUS.SETUP_BLOCKED) {
    const blockedResult = buildResultEnvelope({
      message: [
        "Browser benchmark setup is blocked before the real app benchmark can start.",
        "This means the issue is with browser discovery or browser launch permissions, not with the Stocks page itself.",
      ].join(" "),
      setupDiagnostics: setupCheck.setupDiagnostics,
      status: BROWSER_BENCHMARK_STATUS.SETUP_BLOCKED,
    });
    const outputFile = writeBrowserResultFiles(resultDirectory, blockedResult);
    return {
      outputFile,
      result: blockedResult,
    };
  }

  if (!process.env.MONGO_URI) {
    const failedResult = buildResultEnvelope({
      message: "MONGO_URI is required before running the browser benchmark.",
      setupDiagnostics: setupCheck.setupDiagnostics,
      status: BROWSER_BENCHMARK_STATUS.BENCHMARK_FAILED,
    });
    const outputFile = writeBrowserResultFiles(resultDirectory, failedResult);
    return {
      outputFile,
      result: failedResult,
    };
  }

  process.env.MONGO_URI = buildPerformanceMongoUri(
    process.env.MONGO_URI,
    rawOptions.databaseName || "stockgossipmonitor_browser_performance",
  );
  process.env.PORT = String(backendPort);

  ensureFrontendBuild();

  const baseline = readJsonFile(baselineFile, {
    harness: "browser",
    version: 1,
    generatedAt: null,
    scenarios: {},
  });
  const roicService = require("../../services/roicService");
  const restoreRoicService = installPerformanceRoicStubs(roicService);
  installDefaultBoldRowsShim();
  installServerStartupShim();
  const { startServer, stopServer } = require("../../server");
  const backendBaseUrl = `http://127.0.0.1:${backendPort}`;
  const scenarioResults = [];
  let browserServer = null;
  let browser = null;

  try {
    await startServer();

    browserServer = await createProxyServer({
      backendBaseUrl,
      frontendPort: browserPort,
    });

    browser = await launchBrowserCandidate(setupCheck.setupDiagnostics.chosenCandidate, rawOptions);

    for (const datasetSize of datasetSizes) {
      // The benchmark should spend its effort on the app routes and rendering
      // work, not on exploding during fixture setup, so the seeder now streams
      // data in bounded chunks before each scenario.
      const seedSummary = await seedLargeWatchlistDataset({
        annualHistorySize,
        chunkSize,
        clearFirst: true,
        legacyPercentage,
        priceHistoryMonths,
        stockCount: datasetSize,
      });

      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      let firstRefreshCompletedMs = null;
      const startedAt = Date.now();

      page.on("response", (response) => {
        if (
          firstRefreshCompletedMs == null &&
          response.request().method() === "POST" &&
          response.url().includes("/api/watchlist/") &&
          response.url().endsWith("/refresh")
        ) {
          firstRefreshCompletedMs = Date.now() - startedAt;
        }
      });

      const routeNavigationStartedAt = performance.now();
      await page.goto(`http://127.0.0.1:${browserPort}/stocks`, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });
      const routeLoadMs = Number((performance.now() - routeNavigationStartedAt).toFixed(2));

      const firstVisibleStartedAt = performance.now();
      await page.waitForSelector('[data-testid="share-price-dashboard-scroll-region"]', {
        state: "visible",
        timeout: 120000,
      });
      const firstVisibleCardMs = Number((performance.now() - firstVisibleStartedAt).toFixed(2));

      const heapBefore = await page.evaluate(() => (
        typeof performance.memory?.usedJSHeapSize === "number"
          ? performance.memory.usedJSHeapSize
          : null
      ));

      const firstToggle = page.locator('[data-testid="share-price-dashboard-metrics-toggle"]').first();
      const interactionStartedAt = performance.now();
      await firstToggle.waitFor({ state: "visible", timeout: 120000 });
      const firstUsableInteractionMs = Number((performance.now() - interactionStartedAt).toFixed(2));

      const initialActivatedCount = await page.locator('[data-testid="share-price-dashboard-scroll-region"]').count();
      const scrollActivationStartedAt = performance.now();
      for (let step = 0; step < scrollSteps; step += 1) {
        await page.mouse.wheel(0, 1200);
        await wait(150);
      }
      await wait(500);
      const activatedAfterScrollCount = await page.locator('[data-testid="share-price-dashboard-scroll-region"]').count();
      const activationScrollMs = Number((performance.now() - scrollActivationStartedAt).toFixed(2));

      await firstToggle.click();
      await page.waitForSelector('[data-testid="share-price-dashboard-detail-metrics-header"]', {
        state: "visible",
        timeout: 120000,
      });

      const heapAfter = await page.evaluate(() => (
        typeof performance.memory?.usedJSHeapSize === "number"
          ? performance.memory.usedJSHeapSize
          : null
      ));
      const browserHeapGrowthBytes =
        Number.isFinite(heapBefore) && Number.isFinite(heapAfter)
          ? heapAfter - heapBefore
          : null;

      const metrics = {
        activationScrollMs,
        browserHeapGrowthBytes,
        firstUsableInteractionMs,
        firstVisibleCardMs,
        routeLoadMs,
      };
      const scenarioName = `stocks-page-${datasetSize}`;
      scenarioResults.push(buildBrowserScenarioResult({
        baseline,
        datasetSize,
        metrics,
        metadata: {
          activatedAfterScrollCount,
          chunkSize: seedSummary.chunkSize,
          firstLegacyRefreshCompletedMs: firstRefreshCompletedMs,
          firstTicker: seedSummary.firstTicker,
          initialActivatedCount,
          legacyStockCount: seedSummary.legacyStockCount,
          progressiveActivationWorked: activatedAfterScrollCount > initialActivatedCount,
          firstPaintBeatRefresh:
            firstRefreshCompletedMs == null ? true : firstVisibleCardMs < firstRefreshCompletedMs,
        },
        scenarioName,
      }));

      await context.close();
    }

    const result = buildResultEnvelope({
      regressionsDetected: scenarioResults.some((scenario) => !scenario.passed),
      scenarios: scenarioResults,
      setupDiagnostics: setupCheck.setupDiagnostics,
      status: scenarioResults.some((scenario) => !scenario.passed)
        ? BROWSER_BENCHMARK_STATUS.BENCHMARK_FAILED
        : BROWSER_BENCHMARK_STATUS.PASSED,
    });
    const outputFile = writeBrowserResultFiles(resultDirectory, result);

    return {
      outputFile,
      result,
    };
  } catch (error) {
    const failedResult = buildResultEnvelope({
      message: error.stack || error.message,
      regressionsDetected: true,
      scenarios: scenarioResults,
      setupDiagnostics: setupCheck.setupDiagnostics,
      status: BROWSER_BENCHMARK_STATUS.BENCHMARK_FAILED,
    });
    const outputFile = writeBrowserResultFiles(resultDirectory, failedResult);

    return {
      outputFile,
      result: failedResult,
    };
  } finally {
    try {
      await clearPerformanceCollections();
    } finally {
      if (browser) {
        await browser.close();
      }
      if (browserServer) {
        await new Promise((resolve, reject) => {
          browserServer.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }
      restoreRoicService();
      await stopServer();
    }
  }
}

module.exports = {
  BROWSER_BENCHMARK_STATUS,
  classifyBrowserLaunchError,
  detectBrowserAvailability,
  performBrowserSetupCheck,
  runBrowserBenchmark,
  runBrowserBenchmarkSetupCheck,
  runBrowserLaunchSmokeTest,
};
