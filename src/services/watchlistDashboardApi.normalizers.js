import {
  isDefaultBoldMainTableRowKey,
  isDefaultBoldMetricsFieldPath,
} from '../../shared/defaultBoldStockRows.mjs';
import normalizeTickerIdentifier from '../utils/normalizeTickerIdentifier';

const ANNUAL_HISTORY_FETCH_VERSION = 3;
const CURRENT_STOCK_DATA_VERSION = 1;

function getEffectiveValue(metricField) {
  if (!metricField || typeof metricField !== 'object') {
    return metricField ?? null;
  }

  if ('effectiveValue' in metricField) {
    return metricField.effectiveValue ?? null;
  }

  return metricField;
}

function isDirectlyOverrideableMetricField(metricField) {
  const nonUserSource =
    typeof metricField?.baseSourceOfTruth === 'string' && metricField.baseSourceOfTruth !== 'user'
      ? metricField.baseSourceOfTruth
      : typeof metricField?.sourceOfTruth === 'string' && metricField.sourceOfTruth !== 'user'
        ? metricField.sourceOfTruth
        : 'system';

  // This raw-document fallback does not have the richer backend payload yet, so
  // it uses the stored source metadata to keep derived fields read-only too.
  return nonUserSource !== 'derived';
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
  'priceCurrency',
  'sharePrice',
  'sharesOnIssue',
  'marketCap',
];
const MAIN_TABLE_FIELD_CONFIG = {
  fiscalYearEndDate: {
    rowKey: 'main::annualData[].fiscalYearEndDate',
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.fiscalYearEndDate ?? null,
  },
  fiscalYear: {
    rowKey: 'main::annualData[].fiscalYear',
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.fiscalYear ?? null,
  },
  earningsReleaseDate: {
    rowKey: 'main::annualData[].earningsReleaseDate',
    payloadPath: null,
    resolveField: (annualRow) => annualRow?.earningsReleaseDate ?? null,
  },
  priceCurrency: {
    rowKey: 'main::priceCurrency',
    payloadPath: null,
    resolveField: (stockDocument) => stockDocument?.priceCurrency || null,
  },
  sharePrice: {
    rowKey: 'main::annualData[].base.sharePrice',
    payloadPath: 'base.sharePrice',
    resolveField: (_stockDocument, annualRow) => annualRow?.base?.sharePrice ?? null,
  },
  sharesOnIssue: {
    rowKey: 'main::annualData[].base.sharesOnIssue',
    payloadPath: 'base.sharesOnIssue',
    resolveField: (_stockDocument, annualRow) => annualRow?.base?.sharesOnIssue ?? null,
  },
  marketCap: {
    rowKey: 'main::annualData[].base.marketCap',
    payloadPath: 'base.marketCap',
    resolveField: (_stockDocument, annualRow) => annualRow?.base?.marketCap ?? null,
  },
};

function normalizeAnnualMainTableCell(cell, fallbackFiscalYear, fieldKey) {
  const fieldConfig = MAIN_TABLE_FIELD_CONFIG[fieldKey];
  const normalizedRowKey = typeof cell?.rowKey === 'string' && cell.rowKey
    ? cell.rowKey
    : fieldConfig?.rowKey || '';

  return {
    columnKey:
      typeof cell?.columnKey === 'string' && cell.columnKey
        ? cell.columnKey
        : Number.isInteger(fallbackFiscalYear)
          ? `annual-${fallbackFiscalYear}`
          : '',
    rowKey: normalizedRowKey,
    value: cell?.value ?? null,
    sourceOfTruth: typeof cell?.sourceOfTruth === 'string' ? cell.sourceOfTruth : 'system',
    isOverridden: cell?.isOverridden === true,
    isBold:
      typeof cell?.isBold === 'boolean'
        ? cell.isBold
        : isDefaultBoldMainTableRowKey(normalizedRowKey),
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

function createAnnualMainTableCellFromStockDocument(
  fieldKey,
  annualRow,
  fiscalYear,
  stockDocument = null,
) {
  const fieldConfig = MAIN_TABLE_FIELD_CONFIG[fieldKey];
  const rawField = fieldConfig?.resolveField?.(stockDocument, annualRow);
  const hasMetricMetadata = rawField && typeof rawField === 'object' && 'sourceOfTruth' in rawField;
  const normalizedRowKey = fieldConfig?.rowKey || '';
  const isDirectlyOverrideable =
    Boolean(fieldConfig?.payloadPath && Number.isInteger(fiscalYear) && hasMetricMetadata)
    && isDirectlyOverrideableMetricField(rawField);

  return {
    columnKey: Number.isInteger(fiscalYear) ? `annual-${fiscalYear}` : '',
    rowKey: normalizedRowKey,
    value: getEffectiveValue(rawField),
    sourceOfTruth: hasMetricMetadata && typeof rawField.sourceOfTruth === 'string'
      ? rawField.sourceOfTruth
      : 'system',
    isOverridden: hasMetricMetadata && rawField.sourceOfTruth === 'user',
    isBold: isDefaultBoldMainTableRowKey(normalizedRowKey),
    isOverrideable: isDirectlyOverrideable,
    overrideTarget: isDirectlyOverrideable
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
            createAnnualMainTableCellFromStockDocument(
              fieldKey,
              annualRow,
              normalizedFiscalYear,
              stockDocument,
            ),
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
    isBold:
      typeof row?.isBold === 'boolean'
        ? row.isBold
        : isDefaultBoldMetricsFieldPath(row?.fieldPath),
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

function normalizeMainTableRowPreferences(metricsPayload) {
  const rowPreferences = Array.isArray(metricsPayload?.mainTableRowPreferences)
    ? metricsPayload.mainTableRowPreferences
    : [];

  return rowPreferences.map((rowPreference) => ({
    rowKey: String(rowPreference?.rowKey || ''),
    fieldPath: String(rowPreference?.fieldPath || ''),
    label: String(rowPreference?.label || ''),
    isBold:
      typeof rowPreference?.isBold === 'boolean'
        ? rowPreference.isBold
        : isDefaultBoldMainTableRowKey(rowPreference?.rowKey),
  }));
}

function applyMainTableRowPreferences(annualMainTableRows, mainTableRowPreferences = []) {
  if (
    !Array.isArray(annualMainTableRows) ||
    !annualMainTableRows.length ||
    !Array.isArray(mainTableRowPreferences)
  ) {
    return annualMainTableRows;
  }

  const preferenceByRowKey = new Map(
    mainTableRowPreferences.map((rowPreference) => [rowPreference.rowKey, rowPreference]),
  );

  if (!preferenceByRowKey.size) {
    return annualMainTableRows;
  }

  return annualMainTableRows.map((annualRow) => ({
    ...annualRow,
    cells: Object.fromEntries(
      Object.entries(annualRow?.cells || {}).map(([fieldKey, cell]) => {
        const rowPreference = preferenceByRowKey.get(cell?.rowKey);

        return [
          fieldKey,
          rowPreference
            ? {
                ...cell,
                isBold: rowPreference.isBold === true,
              }
            : cell,
        ];
      }),
    ),
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
  const stockDataVersion = Number(stockDocument?.sourceMeta?.stockDataVersion);
  const importRangeYears = stockDocument?.sourceMeta?.importRangeYears;
  const importRangeYearsExplicit = stockDocument?.sourceMeta?.importRangeYearsExplicit === true;
  const annualHistoryFetchVersion = Number(stockDocument?.sourceMeta?.annualHistoryFetchVersion);
  const annualRowCount = Array.isArray(stockDocument?.annualData) ? stockDocument.annualData.length : 0;
  const needsStockDataUpgrade =
    !Number.isInteger(stockDataVersion) ||
    stockDataVersion < CURRENT_STOCK_DATA_VERSION;
  const needsVersionUpgrade =
    !Number.isInteger(annualHistoryFetchVersion) ||
    annualHistoryFetchVersion < ANNUAL_HISTORY_FETCH_VERSION;
  const hasLegacyTruncatedUncappedHistory =
    importRangeYears == null && (annualRowCount === 10 || annualRowCount === 20);

  if (importRangeYearsExplicit) {
    return needsStockDataUpgrade;
  }

  return needsStockDataUpgrade || needsVersionUpgrade || (
    hasLegacyTruncatedUncappedHistory &&
    annualHistoryFetchVersion !== ANNUAL_HISTORY_FETCH_VERSION
  );
}

function buildDashboardPayload(
  stockDocument,
  pricePayload,
  identifier,
  metricsPayload = null,
  options = {},
) {
  const normalizedIdentifier = normalizeTickerIdentifier(identifier);
  const rawCompanyName =
    stockDocument?.companyName?.effectiveValue ||
    stockDocument?.companyName?.userValue ||
    stockDocument?.companyName?.roicValue ||
    normalizedIdentifier;
  const companyName =
    typeof rawCompanyName === 'string' && rawCompanyName.trim()
      ? rawCompanyName.trim()
      : normalizedIdentifier;

  const mainTableRowPreferences = normalizeMainTableRowPreferences(metricsPayload);
  const annualMainTableRows = Array.isArray(stockDocument?.annualMainTableRows)
    ? normalizeAnnualMainTableRowsPayload(stockDocument.annualMainTableRows)
    : normalizeAnnualMainTableRows(stockDocument);

  return {
    identifier: normalizedIdentifier,
    companyName,
    investmentCategory:
      typeof stockDocument?.investmentCategory === 'string'
        ? stockDocument.investmentCategory.trim()
        : '',
    priceCurrency: stockDocument?.priceCurrency || 'USD',
    reportingCurrency: stockDocument?.reportingCurrency || null,
    prices: normalizePriceRows(pricePayload),
    annualMetrics: normalizeAnnualMetrics(stockDocument),
    annualMainTableRows: applyMainTableRowPreferences(annualMainTableRows, mainTableRowPreferences),
    metricsColumns: normalizeMetricsColumns(metricsPayload),
    metricsRows: normalizeMetricsRows(metricsPayload),
    mainTableRowPreferences,
    hasLoadedMetricsView: hasMetricsView(metricsPayload),
    needsBackgroundRefresh: options.needsBackgroundRefresh === true,
    loadError: typeof options.loadError === 'string' ? options.loadError : '',
  };
}

function normalizeDashboardBootstrapPayload(rawPayload) {
  const normalizedIdentifier = normalizeTickerIdentifier(rawPayload?.identifier);
  const normalizedAnnualMainTableRows = normalizeAnnualMainTableRowsPayload(rawPayload?.annualMainTableRows);
  const mainTableRowPreferences = normalizeMainTableRowPreferences(rawPayload);

  return {
    identifier: normalizedIdentifier,
    companyName:
      typeof rawPayload?.companyName === 'string' && rawPayload.companyName.trim()
        ? rawPayload.companyName.trim()
        : normalizedIdentifier,
    investmentCategory:
      typeof rawPayload?.investmentCategory === 'string'
        ? rawPayload.investmentCategory.trim()
        : '',
    priceCurrency: rawPayload?.priceCurrency || 'USD',
    reportingCurrency: rawPayload?.reportingCurrency || null,
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
    annualMainTableRows: applyMainTableRowPreferences(normalizedAnnualMainTableRows, mainTableRowPreferences),
    metricsColumns: normalizeMetricsColumns(rawPayload),
    metricsRows: normalizeMetricsRows(rawPayload),
    mainTableRowPreferences,
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
      .map(normalizeTickerIdentifier)
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

export {
  buildDashboardBootstrapRequestOptions,
  buildDashboardPayload,
  buildNestedPatchPayload,
  buildRequestOptions,
  normalizeDashboardBootstrapPayload,
  normalizeMainTableRowPreferences,
  normalizeMetricsColumns,
  normalizeMetricsRows,
  shouldUpgradeLegacyAnnualHistory,
};
