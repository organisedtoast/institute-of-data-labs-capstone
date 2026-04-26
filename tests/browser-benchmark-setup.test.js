const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BROWSER_BENCHMARK_STATUS,
  detectBrowserAvailability,
  performBrowserSetupCheck,
  runBrowserLaunchSmokeTest,
} = require("./performance/browserBenchmark");

test("detectBrowserAvailability prefers the configured browser when it exists", () => {
  const availability = detectBrowserAvailability({
    chromiumModule: {
      executablePath() {
        return "C:\\playwright\\chromium.exe";
      },
    },
    env: {
      PERF_BROWSER_EXECUTABLE_PATH: "C:\\custom\\chrome.exe",
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
    },
    pathExists(candidatePath) {
      return candidatePath === "C:\\custom\\chrome.exe" || candidatePath === "C:\\playwright\\chromium.exe";
    },
  });

  assert.equal(availability.configuredBrowserFound, true);
  assert.equal(availability.bundledChromiumFound, true);
  assert.equal(availability.chosenCandidate.path, "C:\\custom\\chrome.exe");
  assert.equal(availability.chosenCandidate.source, "configured");
});

test("detectBrowserAvailability reports when the configured path is missing", () => {
  const availability = detectBrowserAvailability({
    chromiumModule: {
      executablePath() {
        return "C:\\playwright\\chromium.exe";
      },
    },
    env: {
      PERF_BROWSER_EXECUTABLE_PATH: "C:\\missing\\chrome.exe",
      ProgramFiles: "",
      "ProgramFiles(x86)": "",
    },
    pathExists(candidatePath) {
      return candidatePath === "C:\\playwright\\chromium.exe";
    },
  });

  assert.equal(availability.configuredPathProvided, true);
  assert.equal(availability.configuredPathMissing, true);
  assert.equal(availability.chosenCandidate.source, "bundled");
});

test("runBrowserLaunchSmokeTest turns spawn EPERM into setup_blocked", async () => {
  const result = await runBrowserLaunchSmokeTest({
    candidate: {
      label: "Playwright bundled Chromium",
      path: "C:\\playwright\\chromium.exe",
      source: "bundled",
      useExecutablePath: false,
    },
    launchBrowser: async () => {
      throw new Error("spawn EPERM");
    },
  });

  assert.equal(result.status, BROWSER_BENCHMARK_STATUS.SETUP_BLOCKED);
  assert.equal(result.launchBlockedReason, "permission_blocked");
  assert.match(result.launchErrorText, /spawn EPERM/);
});

test("performBrowserSetupCheck returns passed when the smoke test succeeds", async () => {
  const setupCheck = await performBrowserSetupCheck({
    chromiumModule: {
      executablePath() {
        return "C:\\playwright\\chromium.exe";
      },
    },
    env: {
      ProgramFiles: "",
      "ProgramFiles(x86)": "",
    },
    launchBrowser: async () => ({
      async close() {},
    }),
    pathExists(candidatePath) {
      return candidatePath === "C:\\playwright\\chromium.exe";
    },
  });

  assert.equal(setupCheck.status, BROWSER_BENCHMARK_STATUS.PASSED);
  assert.equal(setupCheck.setupDiagnostics.setupStatus, BROWSER_BENCHMARK_STATUS.PASSED);
  assert.equal(setupCheck.setupDiagnostics.chosenCandidate.source, "bundled");
});
