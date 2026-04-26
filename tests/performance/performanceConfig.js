const path = require("node:path");

// These sizes are large enough to surface scaling problems without pretending
// one magic number proves every future performance question.
const DEFAULT_DATASET_SIZES = [100, 500, 1000, 2000, 5000];
const DEFAULT_ALLOWED_REGRESSION_PCT = 25;
const DEFAULT_LEGACY_PERCENTAGE = 0.05;
const DEFAULT_ANNUAL_HISTORY_SIZE = 5;
const DEFAULT_PRICE_HISTORY_MONTHS = 60;
const DEFAULT_SEED_CHUNK_SIZE = 100;
const DEFAULT_BACKEND_REPEATS = 3;
const DEFAULT_BROWSER_SCROLL_STEPS = 8;

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PERFORMANCE_RESULTS_DIR = path.join(REPO_ROOT, "performance-results");
const BASELINES_DIR = path.join(__dirname, "baselines");
const BACKEND_BASELINE_FILE = path.join(BASELINES_DIR, "backend-baseline.json");
const BROWSER_BASELINE_FILE = path.join(BASELINES_DIR, "browser-baseline.json");

function parseDatasetSizes(rawValue, fallback = DEFAULT_DATASET_SIZES) {
  if (!rawValue) {
    return [...fallback];
  }

  const parsedSizes = String(rawValue)
    .split(",")
    .map((token) => Number(token.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return parsedSizes.length ? parsedSizes : [...fallback];
}

function parsePositiveInteger(rawValue, fallback) {
  const parsedValue = Number(rawValue);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function parseFraction(rawValue, fallback) {
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue >= 0 && parsedValue <= 1
    ? parsedValue
    : fallback;
}

function getTimestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

module.exports = {
  BACKEND_BASELINE_FILE,
  BASELINES_DIR,
  BROWSER_BASELINE_FILE,
  DEFAULT_ALLOWED_REGRESSION_PCT,
  DEFAULT_ANNUAL_HISTORY_SIZE,
  DEFAULT_BACKEND_REPEATS,
  DEFAULT_BROWSER_SCROLL_STEPS,
  DEFAULT_DATASET_SIZES,
  DEFAULT_LEGACY_PERCENTAGE,
  DEFAULT_PRICE_HISTORY_MONTHS,
  DEFAULT_SEED_CHUNK_SIZE,
  PERFORMANCE_RESULTS_DIR,
  REPO_ROOT,
  getTimestampSlug,
  parseDatasetSizes,
  parseFraction,
  parsePositiveInteger,
};
