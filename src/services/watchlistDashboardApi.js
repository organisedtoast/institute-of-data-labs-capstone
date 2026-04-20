import axios from 'axios';

const ANNUAL_HISTORY_FETCH_VERSION = 2;

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

export function buildDashboardPayload(stockDocument, pricePayload, identifier) {
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
    priceCurrency: stockDocument?.priceCurrency || 'USD',
    prices: normalizePriceRows(pricePayload),
    annualMetrics: normalizeAnnualMetrics(stockDocument),
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

  return buildDashboardPayload(stockDocument, priceResponse.data, normalizedIdentifier);
}
