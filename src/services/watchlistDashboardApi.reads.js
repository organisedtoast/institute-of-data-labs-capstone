import axios from 'axios';

import {
  buildDashboardBootstrapRequestOptions,
  buildDashboardPayload,
  buildRequestOptions,
  normalizeDashboardBootstrapPayload,
  normalizeMainTableRowPreferences,
  normalizeMetricsColumns,
  normalizeMetricsRows,
  shouldUpgradeLegacyAnnualHistory,
} from './watchlistDashboardApi.normalizers';
import normalizeTickerIdentifier from '../utils/normalizeTickerIdentifier';

async function fetchWatchlistDashboardBootstraps(options = {}) {
  const response = await axios.get(
    '/api/watchlist/dashboards',
    buildDashboardBootstrapRequestOptions(options),
  );

  return Array.isArray(response.data?.dashboards)
    ? response.data.dashboards.map(normalizeDashboardBootstrapPayload)
    : [];
}

async function fetchDashboardMetricsView(identifier, options = {}) {
  const normalizedIdentifier = normalizeTickerIdentifier(identifier);
  const response = await axios.get(
    `/api/watchlist/${normalizedIdentifier}/metrics-view`,
    buildRequestOptions(options),
  );

  return {
    identifier: normalizedIdentifier,
    metricsColumns: normalizeMetricsColumns(response.data),
    metricsRows: normalizeMetricsRows(response.data),
    mainTableRowPreferences: normalizeMainTableRowPreferences(response.data),
    hasLoadedMetricsView: true,
  };
}

async function refreshWatchlistDashboardBootstrap(identifier, options = {}) {
  const normalizedIdentifier = normalizeTickerIdentifier(identifier);
  const requestOptions = buildRequestOptions(options);

  await axios.post(
    `/api/watchlist/${normalizedIdentifier}/refresh`,
    {},
    requestOptions,
  );

  const refreshedDashboards = await fetchWatchlistDashboardBootstraps({
    signal: options.signal,
    tickers: [normalizedIdentifier],
  });

  return refreshedDashboards[0] || null;
}

async function fetchDashboardData(identifier, options = {}) {
  const normalizedIdentifier = normalizeTickerIdentifier(identifier);
  const requestOptions = buildRequestOptions(options);

  const [stockResponse, priceResponse] = await Promise.all([
    axios.get(`/api/watchlist/${normalizedIdentifier}`, requestOptions),
    axios.get(`/api/stock-prices/${normalizedIdentifier}`, requestOptions),
  ]);
  let stockDocument = stockResponse.data;

  if (shouldUpgradeLegacyAnnualHistory(stockDocument)) {
    const refreshResponse = await axios.post(
      `/api/watchlist/${normalizedIdentifier}/refresh`,
      {},
      requestOptions,
    );
    stockDocument = refreshResponse.data;
  }

  const metricsResponse = await axios.get(
    `/api/watchlist/${normalizedIdentifier}/metrics-view`,
    requestOptions,
  );

  return buildDashboardPayload(
    stockDocument,
    priceResponse.data,
    normalizedIdentifier,
    metricsResponse.data,
  );
}

export {
  fetchDashboardData,
  fetchDashboardMetricsView,
  fetchWatchlistDashboardBootstraps,
  refreshWatchlistDashboardBootstrap,
};
