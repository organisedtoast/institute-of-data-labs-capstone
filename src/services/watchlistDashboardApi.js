// This file stays the public import surface for dashboard data helpers even
// though the implementation now lives in smaller focused modules.
// Keeping one stable import path means callers do not need to care about the
// internal split, and the browser still reaches the ESM-safe shared helpers.
export { buildDashboardPayload } from './watchlistDashboardApi.normalizers';
export {
  fetchDashboardData,
  fetchDashboardMetricsView,
  fetchWatchlistDashboardBootstraps,
  refreshWatchlistDashboardBootstrap,
} from './watchlistDashboardApi.reads';
export {
  updateDashboardInvestmentCategory,
  updateDashboardMetricOverride,
  updateDashboardRowPreference,
} from './watchlistDashboardApi.mutations';
