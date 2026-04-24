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

const MAIN_TABLE_FIELD_KEYS = [
  'fiscalYearEndDate',
  'fiscalYear',
  'earningsReleaseDate',
  'sharePrice',
  'sharesOnIssue',
  'marketCap',
];
const MAIN_TABLE_FIELD_CONFIG = {
  fiscalYearEndDate: {
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.fiscalYearEndDate ?? null,
  },
  fiscalYear: {
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.fiscalYear ?? null,
  },
  earningsReleaseDate: {
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.earningsReleaseDate ?? null,
  },
  sharePrice: {
    payloadPath: 'base.sharePrice',
    resolveField: (annualRow) => annualRow?.base?.sharePrice ?? null,
  },
  sharesOnIssue: {
    payloadPath: 'base.sharesOnIssue',
    resolveField: (annualRow) => annualRow?.base?.sharesOnIssue ?? null,
  },
  marketCap: {
    payloadPath: 'base.marketCap',
    resolveField: (annualRow) => annualRow?.base?.marketCap ?? null,
  },
};

function normalizeAnnualMainTableCell(cell, fallbackFiscalYear, fieldKey) {
  return {
    columnKey:
      typeof cell?.columnKey === 'string' && cell.columnKey
        ? cell.columnKey
        : Number.isInteger(fallbackFiscalYear)
          ? `annual-${fallbackFiscalYear}`
          : '',
    value: cell?.value ?? null,
    sourceOfTruth: typeof cell?.sourceOfTruth === 'string' ? cell.sourceOfTruth : 'system',
    isOverridden: cell?.isOverridden === true,
    // The base table now needs the same rich cell metadata as detail metrics.
    // That keeps one editor flow for both surfaces and only makes truly
    // overrideable cells interactive.
    isOverrideable: cell?.isOverrideable === true,
    overrideTarget: cell?.overrideTarget || null,
    fieldKey,
  };
}

function normalizeAnnualMainTableRowsPayload(rawRows) {
  return Array.isArray(rawRows)
    ? rawRows
        .map((annualRow) => {
          const fiscalYear = Number.isInteger(Number(annualRow?.fiscalYear))
            ? Number(annualRow.fiscalYear)
            : null;
          const rawCells = annualRow?.cells && typeof annualRow.cells === 'object'
            ? annualRow.cells
            : {};

          return {
            fiscalYear,
            fiscalYearEndDate:
              typeof annualRow?.fiscalYearEndDate === 'string' ? annualRow.fiscalYearEndDate : null,
            cells: Object.fromEntries(
              MAIN_TABLE_FIELD_KEYS.map((fieldKey) => [
                fieldKey,
                normalizeAnnualMainTableCell(rawCells[fieldKey], fiscalYear, fieldKey),
              ]),
            ),
          };
        })
        .sort((left, right) => {
          const leftDate = left.fiscalYearEndDate || '';
          const rightDate = right.fiscalYearEndDate || '';

          return leftDate.localeCompare(rightDate);
        })
    : [];
}

function createAnnualMainTableCellFromStockDocument(fieldKey, annualRow, fiscalYear) {
  const fieldConfig = MAIN_TABLE_FIELD_CONFIG[fieldKey];
  const rawField = fieldConfig?.resolveField?.(annualRow);
  const hasMetricMetadata = rawField && typeof rawField === 'object' && 'sourceOfTruth' in rawField;

  return {
    columnKey: Number.isInteger(fiscalYear) ? `annual-${fiscalYear}` : '',
    value: getEffectiveValue(rawField),
    sourceOfTruth: hasMetricMetadata && typeof rawField.sourceOfTruth === 'string'
      ? rawField.sourceOfTruth
      : 'system',
    isOverridden: hasMetricMetadata && rawField.sourceOfTruth === 'user',
    isOverrideable: Boolean(fieldConfig?.payloadPath && Number.isInteger(fiscalYear) && hasMetricMetadata),
    overrideTarget: fieldConfig?.payloadPath && Number.isInteger(fiscalYear) && hasMetricMetadata
      ? {
          kind: 'annual',
          fiscalYear,
          payloadPath: fieldConfig.payloadPath,
        }
      : null,
    fieldKey,
  };
}

function normalizeAnnualMainTableRows(stockDocument) {
  const annualRows = Array.isArray(stockDocument?.annualData) ? stockDocument.annualData : [];

  return annualRows
    .map((annualRow) => {
      const fiscalYear = Number(annualRow?.fiscalYear);
      const normalizedFiscalYear = Number.isInteger(fiscalYear) ? fiscalYear : null;

      return {
        fiscalYear: normalizedFiscalYear,
        fiscalYearEndDate:
          typeof annualRow?.fiscalYearEndDate === 'string' ? annualRow.fiscalYearEndDate : null,
        cells: Object.fromEntries(
          MAIN_TABLE_FIELD_KEYS.map((fieldKey) => [
            fieldKey,
            createAnnualMainTableCellFromStockDocument(fieldKey, annualRow, normalizedFiscalYear),
          ]),
        ),
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

function hasMetricsView(metricsPayload) {
  return Array.isArray(metricsPayload?.columns) && Array.isArray(metricsPayload?.rows);
}

function buildRequestOptions(options = {}) {
  return options.signal ? { signal: options.signal } : undefined;
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

export function buildDashboardPayload(
  stockDocument,
  pricePayload,
  identifier,
  metricsPayload = null,
  options = {},
) {
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
    annualMainTableRows: Array.isArray(stockDocument?.annualMainTableRows)
      ? normalizeAnnualMainTableRowsPayload(stockDocument.annualMainTableRows)
      : normalizeAnnualMainTableRows(stockDocument),
    metricsColumns: normalizeMetricsColumns(metricsPayload),
    metricsRows: normalizeMetricsRows(metricsPayload),
    hasLoadedMetricsView: hasMetricsView(metricsPayload),
    needsBackgroundRefresh: options.needsBackgroundRefresh === true,
    loadError: typeof options.loadError === 'string' ? options.loadError : '',
  };
}

function normalizeDashboardBootstrapPayload(rawPayload) {
  return {
    identifier: String(rawPayload?.identifier || '').trim().toUpperCase(),
    companyName:
      typeof rawPayload?.companyName === 'string' && rawPayload.companyName.trim()
        ? rawPayload.companyName.trim()
        : String(rawPayload?.identifier || '').trim().toUpperCase(),
    investmentCategory:
      typeof rawPayload?.investmentCategory === 'string'
        ? rawPayload.investmentCategory.trim()
        : '',
    priceCurrency: rawPayload?.priceCurrency || 'USD',
    prices: normalizePriceRows(rawPayload),
    annualMetrics: Array.isArray(rawPayload?.annualMetrics)
      ? rawPayload.annualMetrics
          .map((annualRow) => ({
            fiscalYear: Number.isInteger(Number(annualRow?.fiscalYear))
              ? Number(annualRow.fiscalYear)
              : null,
            fiscalYearEndDate:
              typeof annualRow?.fiscalYearEndDate === 'string' ? annualRow.fiscalYearEndDate : null,
            earningsReleaseDate:
              typeof annualRow?.earningsReleaseDate === 'string' ? annualRow.earningsReleaseDate : null,
            sharePrice: annualRow?.sharePrice ?? null,
            sharesOnIssue: annualRow?.sharesOnIssue ?? null,
            marketCap: annualRow?.marketCap ?? null,
          }))
          .sort((left, right) => {
            const leftDate = left.fiscalYearEndDate || '';
            const rightDate = right.fiscalYearEndDate || '';

            return leftDate.localeCompare(rightDate);
          })
      : [],
    annualMainTableRows: normalizeAnnualMainTableRowsPayload(rawPayload?.annualMainTableRows),
    metricsColumns: normalizeMetricsColumns(rawPayload),
    metricsRows: normalizeMetricsRows(rawPayload),
    hasLoadedMetricsView: rawPayload?.hasLoadedMetricsView === true,
    needsBackgroundRefresh: rawPayload?.needsBackgroundRefresh === true,
    loadError: typeof rawPayload?.loadError === 'string' ? rawPayload.loadError : '',
  };
}

function buildDashboardBootstrapRequestOptions(options = {}) {
  const requestOptions = buildRequestOptions(options);
  const params = {};

  if (Array.isArray(options.tickers) && options.tickers.length > 0) {
    params.tickers = options.tickers
      .map((ticker) => String(ticker || '').trim().toUpperCase())
      .filter(Boolean)
      .join(',');
  }

  if (!Object.keys(params).length) {
    return requestOptions;
  }

  return {
    ...(requestOptions || {}),
    params,
  };
}

export async function fetchWatchlistDashboardBootstraps(options = {}) {
  const response = await axios.get(
    '/api/watchlist/dashboards',
    buildDashboardBootstrapRequestOptions(options),
  );

  return Array.isArray(response.data?.dashboards)
    ? response.data.dashboards.map(normalizeDashboardBootstrapPayload)
    : [];
}

export async function fetchDashboardMetricsView(identifier, options = {}) {
  const normalizedIdentifier = String(identifier || '').trim().toUpperCase();
  const response = await axios.get(
    `/api/watchlist/${normalizedIdentifier}/metrics-view`,
    buildRequestOptions(options),
  );

  return {
    identifier: normalizedIdentifier,
    metricsColumns: normalizeMetricsColumns(response.data),
    metricsRows: normalizeMetricsRows(response.data),
    hasLoadedMetricsView: true,
  };
}

export async function refreshWatchlistDashboardBootstrap(identifier, options = {}) {
  const normalizedIdentifier = String(identifier || '').trim().toUpperCase();
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
