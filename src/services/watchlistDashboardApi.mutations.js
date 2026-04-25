import axios from 'axios';

import {
  buildNestedPatchPayload,
  buildRequestOptions,
  normalizeMainTableRowPreferences,
  normalizeMetricsColumns,
  normalizeMetricsRows,
} from './watchlistDashboardApi.normalizers';
import normalizeTickerIdentifier from '../utils/normalizeTickerIdentifier';

async function updateDashboardInvestmentCategory(identifier, investmentCategory, options = {}) {
  const normalizedIdentifier = normalizeTickerIdentifier(identifier);
  const requestOptions = buildRequestOptions(options);
  const response = await axios.patch(
    `/api/watchlist/${normalizedIdentifier}`,
    {
      investmentCategory,
    },
    requestOptions,
  );

  return {
    identifier: normalizedIdentifier,
    investmentCategory:
      typeof response.data?.investmentCategory === 'string'
        ? response.data.investmentCategory.trim()
        : '',
  };
}

async function updateDashboardMetricOverride(identifier, overrideTarget, nextValue, options = {}) {
  const normalizedIdentifier = normalizeTickerIdentifier(identifier);
  const requestOptions = buildRequestOptions(options);

  if (!overrideTarget || typeof overrideTarget !== 'object') {
    throw new Error('overrideTarget is required');
  }

  if (overrideTarget.kind === 'annual') {
    const payload = buildNestedPatchPayload(overrideTarget.payloadPath, nextValue);
    const response = await axios.patch(
      `/api/watchlist/${normalizedIdentifier}/annual/${overrideTarget.fiscalYear}/overrides`,
      payload,
      requestOptions,
    );
    return response.data;
  }

  if (overrideTarget.kind === 'forecast') {
    const payload = buildNestedPatchPayload(overrideTarget.payloadPath, nextValue);
    const response = await axios.patch(
      `/api/watchlist/${normalizedIdentifier}/forecast/${overrideTarget.bucket}/overrides`,
      payload,
      requestOptions,
    );
    return response.data;
  }

  if (overrideTarget.kind === 'topLevel') {
    const payload = buildNestedPatchPayload(overrideTarget.payloadPath, nextValue);
    const response = await axios.patch(
      `/api/watchlist/${normalizedIdentifier}/metrics/overrides`,
      payload,
      requestOptions,
    );
    return response.data;
  }

  throw new Error(`Unsupported override target kind: ${overrideTarget.kind}`);
}

async function updateDashboardRowPreference(identifier, rowKey, nextPreference, options = {}) {
  const normalizedIdentifier = normalizeTickerIdentifier(identifier);
  const requestOptions = buildRequestOptions(options);
  const normalizedPreference = typeof nextPreference === 'boolean'
    ? { isEnabled: nextPreference }
    : (nextPreference && typeof nextPreference === 'object' ? nextPreference : {});
  const requestPayload = {
    rowKey,
  };

  // Both table surfaces now share one row-preference endpoint. Sending only
  // the changed fields keeps one update from wiping the other saved choice.
  if (typeof normalizedPreference.isEnabled === 'boolean') {
    requestPayload.isEnabled = normalizedPreference.isEnabled;
  }

  if (typeof normalizedPreference.isBold === 'boolean') {
    requestPayload.isBold = normalizedPreference.isBold;
  }

  const response = await axios.patch(
    `/api/watchlist/${normalizedIdentifier}/metrics-row-preferences`,
    requestPayload,
    requestOptions,
  );

  return {
    identifier: normalizedIdentifier,
    metricsColumns: normalizeMetricsColumns(response.data),
    metricsRows: normalizeMetricsRows(response.data),
    mainTableRowPreferences: normalizeMainTableRowPreferences(response.data),
  };
}

export {
  updateDashboardInvestmentCategory,
  updateDashboardMetricOverride,
  updateDashboardRowPreference,
};
