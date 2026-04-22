import axios from 'axios';

const ANNUAL_HISTORY_FETCH_VERSION = 3;

function getEffectiveValue(metricField) {
  if (!metricField || typeof metricField !== 'object') {
    return metricField ?? null;
  }

  if ('effectiveValue' in metricField) {
    return metricField.effectiveValue ?? null;
  }

  return metricField;
}

function normalizePriceRows(pricePayload) {
  const priceRows = Array.isArray(pricePayload?.prices) ? pricePayload.prices : [];

  return priceRows
    .map((priceRow) => {
      const closeValue = Number(priceRow?.close);

      if (typeof priceRow?.date !== 'string' || !Number.isFinite(closeValue)) {
        return null;
      }

      return {
        date: priceRow.date,
        close: closeValue,
      };
    })
    .filter(Boolean);
}

function normalizeAnnualMetrics(stockDocument) {
  const annualRows = Array.isArray(stockDocument?.annualData) ? stockDocument.annualData : [];

  return annualRows
    .map((annualRow) => {
      const fiscalYear = Number(annualRow?.fiscalYear);

      return {
        fiscalYear: Number.isInteger(fiscalYear) ? fiscalYear : null,
        fiscalYearEndDate:
          typeof annualRow?.fiscalYearEndDate === 'string' ? annualRow.fiscalYearEndDate : null,
        earningsReleaseDate: getEffectiveValue(annualRow?.earningsReleaseDate),
        sharePrice: getEffectiveValue(annualRow?.base?.sharePrice),
        sharesOnIssue: getEffectiveValue(annualRow?.base?.sharesOnIssue),
        marketCap: getEffectiveValue(annualRow?.base?.marketCap),
      };
    })
    .sort((left, right) => {
      const leftDate = left.fiscalYearEndDate || '';
      const rightDate = right.fiscalYearEndDate || '';

      return leftDate.localeCompare(rightDate);
    });
}

function normalizeMetricsColumns(metricsPayload) {
  const columns = Array.isArray(metricsPayload?.columns) ? metricsPayload.columns : [];

  return columns.map((column) => ({
    key: String(column?.key || ''),
    kind: String(column?.kind || ''),
    label: String(column?.label || ''),
    shortLabel: String(column?.shortLabel || column?.label || ''),
    fiscalYear: Number.isInteger(column?.fiscalYear) ? column.fiscalYear : null,
    fiscalYearEndDate:
      typeof column?.fiscalYearEndDate === 'string' ? column.fiscalYearEndDate : null,
    earningsReleaseDate:
      typeof column?.earningsReleaseDate === 'string' ? column.earningsReleaseDate : null,
    bucket: typeof column?.bucket === 'string' ? column.bucket : null,
  }));
}

function normalizeMetricsRows(metricsPayload) {
  const rows = Array.isArray(metricsPayload?.rows) ? metricsPayload.rows : [];

  return rows.map((row) => ({
    rowKey: String(row?.rowKey || ''),
    fieldPath: String(row?.fieldPath || ''),
    label: String(row?.label || ''),
    shortLabel: String(row?.shortLabel || row?.label || ''),
    section: String(row?.section || ''),
    shortSection: String(row?.shortSection || row?.section || ''),
    order: Number.isFinite(Number(row?.order)) ? Number(row.order) : 0,
    surface: String(row?.surface || ''),
    isEnabled: row?.isEnabled !== false,
    cells: Array.isArray(row?.cells)
      ? row.cells.map((cell) => ({
          columnKey: String(cell?.columnKey || ''),
          value: cell?.value ?? null,
          sourceOfTruth: typeof cell?.sourceOfTruth === 'string' ? cell.sourceOfTruth : 'system',
          isOverridden: cell?.isOverridden === true,
          isOverrideable: cell?.isOverrideable === true,
          overrideTarget: cell?.overrideTarget || null,
        }))
      : [],
  }));
}

function buildNestedPatchPayload(path, value) {
  const parts = String(path || '').split('.').filter(Boolean);

  if (!parts.length) {
    return {};
  }

  const payload = {};
  let currentLevel = payload;

  for (let index = 0; index < parts.length - 1; index += 1) {
    currentLevel[parts[index]] = {};
    currentLevel = currentLevel[parts[index]];
  }

  currentLevel[parts[parts.length - 1]] = value;
  return payload;
}

function shouldUpgradeLegacyAnnualHistory(stockDocument) {
  const importRangeYears = stockDocument?.sourceMeta?.importRangeYears;
  const importRangeYearsExplicit = stockDocument?.sourceMeta?.importRangeYearsExplicit === true;
  const annualHistoryFetchVersion = Number(stockDocument?.sourceMeta?.annualHistoryFetchVersion);
  const annualRowCount = Array.isArray(stockDocument?.annualData) ? stockDocument.annualData.length : 0;
  const needsVersionUpgrade =
    !Number.isInteger(annualHistoryFetchVersion) ||
    annualHistoryFetchVersion < ANNUAL_HISTORY_FETCH_VERSION;
  const hasLegacyTruncatedUncappedHistory =
    importRangeYears == null && (annualRowCount === 10 || annualRowCount === 20);

  if (importRangeYearsExplicit) {
    return false;
  }

  return needsVersionUpgrade || (
    hasLegacyTruncatedUncappedHistory &&
    annualHistoryFetchVersion !== ANNUAL_HISTORY_FETCH_VERSION
  );
}

export function buildDashboardPayload(stockDocument, pricePayload, identifier, metricsPayload = null) {
  const normalizedIdentifier = String(identifier || '').trim().toUpperCase();
  const rawCompanyName =
    stockDocument?.companyName?.effectiveValue ||
    stockDocument?.companyName?.userValue ||
    stockDocument?.companyName?.roicValue ||
    normalizedIdentifier;
  const companyName =
    typeof rawCompanyName === 'string' && rawCompanyName.trim()
      ? rawCompanyName.trim()
      : normalizedIdentifier;

  return {
    identifier: normalizedIdentifier,
    companyName,
    investmentCategory:
      typeof stockDocument?.investmentCategory === 'string'
        ? stockDocument.investmentCategory.trim()
        : '',
    priceCurrency: stockDocument?.priceCurrency || 'USD',
    prices: normalizePriceRows(pricePayload),
    annualMetrics: normalizeAnnualMetrics(stockDocument),
    metricsColumns: normalizeMetricsColumns(metricsPayload),
    metricsRows: normalizeMetricsRows(metricsPayload),
  };
}

export async function fetchDashboardData(identifier, options = {}) {
  const normalizedIdentifier = String(identifier || '').trim().toUpperCase();
  const requestOptions = options.signal ? { signal: options.signal } : undefined;

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

export async function updateDashboardInvestmentCategory(identifier, investmentCategory, options = {}) {
  const normalizedIdentifier = String(identifier || '').trim().toUpperCase();
  const requestOptions = options.signal ? { signal: options.signal } : undefined;
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

export async function updateDashboardMetricOverride(identifier, overrideTarget, nextValue, options = {}) {
  const normalizedIdentifier = String(identifier || '').trim().toUpperCase();
  const requestOptions = options.signal ? { signal: options.signal } : undefined;

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

export async function updateDashboardRowPreference(identifier, rowKey, isEnabled, options = {}) {
  const normalizedIdentifier = String(identifier || '').trim().toUpperCase();
  const requestOptions = options.signal ? { signal: options.signal } : undefined;
  const response = await axios.patch(
    `/api/watchlist/${normalizedIdentifier}/metrics-row-preferences`,
    {
      rowKey,
      isEnabled,
    },
    requestOptions,
  );

  return {
    identifier: normalizedIdentifier,
    metricsColumns: normalizeMetricsColumns(response.data),
    metricsRows: normalizeMetricsRows(response.data),
  };
}
