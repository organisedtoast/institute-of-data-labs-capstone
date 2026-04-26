#!/usr/bin/env node
require("dotenv").config();

const {
  BROWSER_BENCHMARK_STATUS,
  runBrowserBenchmarkSetupCheck,
} = require("../../tests/performance/browserBenchmark");

async function main() {
  const { outputFile, result } = await runBrowserBenchmarkSetupCheck({});

  const summary = {
    outputFile,
    status: result.status,
  };

  if (result.status === BROWSER_BENCHMARK_STATUS.PASSED) {
    summary.message = "Browser benchmark setup check passed.";
  } else {
    summary.message = "Browser benchmark setup is blocked before the real benchmark can start.";
    summary.launchBlockedReason = result.setupDiagnostics?.launchBlockedReason || null;
    summary.setupStatus = result.setupDiagnostics?.setupStatus || null;
  }

  console.log(JSON.stringify(summary, null, 2));

  if (result.status !== BROWSER_BENCHMARK_STATUS.PASSED) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
