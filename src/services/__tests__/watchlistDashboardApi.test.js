import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isDefaultBoldMetricsFieldPath } from '../../../shared/defaultBoldStockRows.mjs';

import {
  buildDashboardPayload,
  fetchDashboardMetricsView,
  fetchWatchlistDashboardBootstraps,
  fetchDashboardData,
  refreshWatchlistDashboardBootstrap,
  updateDashboardRowPreference,
  updateDashboardInvestmentCategory,
} from '../watchlistDashboardApi';

function buildDefaultBoldMetricsPayload() {
  return {
    columns: [
      {
        key: 'annual-2024',
        kind: 'annual',
        label: 'FY 2024',
        shortLabel: '2024',
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
      },
      {
        key: 'annual-2025',
        kind: 'annual',
        label: 'FY 2025',
        shortLabel: '2025',
        fiscalYear: 2025,
        fiscalYearEndDate: '2025-12-31',
      },
    ],
    rows: [
      {
        rowKey: '670::annualData[].forecastData.fy1.marketCap',
        fieldPath: 'annualData[].forecastData.fy1.marketCap',
        label: 'Market cap FY+1',
        shortLabel: 'Market cap FY+1',
        section: 'Shares & Market Cap',
        shortSection: 'Shares',
        order: 670,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '680::annualData[].forecastData.fy2.marketCap',
        fieldPath: 'annualData[].forecastData.fy2.marketCap',
        label: 'Market cap FY+2',
        shortLabel: 'Market cap FY+2',
        section: 'Shares & Market Cap',
        shortSection: 'Shares',
        order: 680,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '690::annualData[].forecastData.fy3.marketCap',
        fieldPath: 'annualData[].forecastData.fy3.marketCap',
        label: 'Market cap FY+3',
        shortLabel: 'Market cap FY+3',
        section: 'Shares & Market Cap',
        shortSection: 'Shares',
        order: 690,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '810::annualData[].valuationMultiples.evSalesTrailing',
        fieldPath: 'annualData[].valuationMultiples.evSalesTrailing',
        label: 'EV/Sales trailing',
        shortLabel: 'EV/Sales trailing',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 810,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '820::annualData[].forecastData.fy1.evSales',
        fieldPath: 'annualData[].forecastData.fy1.evSales',
        label: 'EV/Sales FY+1',
        shortLabel: 'EV/Sales FY+1',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 820,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '830::annualData[].forecastData.fy2.evSales',
        fieldPath: 'annualData[].forecastData.fy2.evSales',
        label: 'EV/Sales FY+2',
        shortLabel: 'EV/Sales FY+2',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 830,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '940::annualData[].valuationMultiples.evEbitTrailing',
        fieldPath: 'annualData[].valuationMultiples.evEbitTrailing',
        label: 'EV/EBIT trailing',
        shortLabel: 'EV/EBIT trailing',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 940,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '950::annualData[].forecastData.fy1.evEbit',
        fieldPath: 'annualData[].forecastData.fy1.evEbit',
        label: 'EV/EBIT FY+1',
        shortLabel: 'EV/EBIT FY+1',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 950,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '980::annualData[].valuationMultiples.peTrailing',
        fieldPath: 'annualData[].valuationMultiples.peTrailing',
        label: 'PE trailing',
        shortLabel: 'PE trailing',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 980,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '990::annualData[].forecastData.fy1.pe',
        fieldPath: 'annualData[].forecastData.fy1.pe',
        label: 'PE FY+1',
        shortLabel: 'PE FY+1',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 990,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '960::annualData[].forecastData.fy2.evEbit',
        fieldPath: 'annualData[].forecastData.fy2.evEbit',
        label: 'EV/EBIT FY+2',
        shortLabel: 'EV/EBIT FY+2',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 960,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '970::annualData[].forecastData.fy3.evEbit',
        fieldPath: 'annualData[].forecastData.fy3.evEbit',
        label: 'EV/EBIT FY+3',
        shortLabel: 'EV/EBIT FY+3',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 970,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1000::annualData[].forecastData.fy2.pe',
        fieldPath: 'annualData[].forecastData.fy2.pe',
        label: 'PE FY+2',
        shortLabel: 'PE FY+2',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 1000,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1010::annualData[].forecastData.fy3.pe',
        fieldPath: 'annualData[].forecastData.fy3.pe',
        label: 'PE FY+3',
        shortLabel: 'PE FY+3',
        section: 'Valuation Multiples',
        shortSection: 'Value',
        order: 1010,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1410::annualData[].epsAndDividends.epsTrailing',
        fieldPath: 'annualData[].epsAndDividends.epsTrailing',
        label: 'EPS (trailing)',
        shortLabel: 'EPS (trailing)',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1410,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1420::annualData[].forecastData.fy1.eps',
        fieldPath: 'annualData[].forecastData.fy1.eps',
        label: 'EPS FY+1',
        shortLabel: 'EPS FY+1',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1420,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1430::annualData[].forecastData.fy2.eps',
        fieldPath: 'annualData[].forecastData.fy2.eps',
        label: 'EPS FY+2',
        shortLabel: 'EPS FY+2',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1430,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1440::annualData[].forecastData.fy3.eps',
        fieldPath: 'annualData[].forecastData.fy3.eps',
        label: 'EPS FY+3',
        shortLabel: 'EPS FY+3',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1440,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1450::annualData[].epsAndDividends.dyTrailing',
        fieldPath: 'annualData[].epsAndDividends.dyTrailing',
        label: 'DY trailing',
        shortLabel: 'DY trailing',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1450,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1460::annualData[].forecastData.fy1.dy',
        fieldPath: 'annualData[].forecastData.fy1.dy',
        label: 'DY FY+1',
        shortLabel: 'DY FY+1',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1460,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1470::annualData[].forecastData.fy2.dy',
        fieldPath: 'annualData[].forecastData.fy2.dy',
        label: 'DY FY+2',
        shortLabel: 'DY FY+2',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1470,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1480::annualData[].forecastData.fy3.dy',
        fieldPath: 'annualData[].forecastData.fy3.dy',
        label: 'DY FY+3',
        shortLabel: 'DY FY+3',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1480,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1490::annualData[].epsAndDividends.dpsTrailing',
        fieldPath: 'annualData[].epsAndDividends.dpsTrailing',
        label: 'DPS (trailing)',
        shortLabel: 'DPS (trailing)',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1490,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1500::annualData[].forecastData.fy1.dps',
        fieldPath: 'annualData[].forecastData.fy1.dps',
        label: 'DPS FY+1',
        shortLabel: 'DPS FY+1',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1500,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1510::annualData[].forecastData.fy2.dps',
        fieldPath: 'annualData[].forecastData.fy2.dps',
        label: 'DPS FY+2',
        shortLabel: 'DPS FY+2',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1510,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
      {
        rowKey: '1520::annualData[].forecastData.fy3.dps',
        fieldPath: 'annualData[].forecastData.fy3.dps',
        label: 'DPS FY+3',
        shortLabel: 'DPS FY+3',
        section: 'EPS & Dividends',
        shortSection: 'EPS & Dividends',
        order: 1520,
        surface: 'detail',
        isEnabled: true,
        cells: [],
      },
    ],
    mainTableRowPreferences: [],
  };
}

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

function buildWatchlistStock(overrides = {}) {
  return {
    tickerSymbol: 'AAPL',
    investmentCategory: 'Profitable Hi Growth',
    companyName: {
      effectiveValue: 'Apple Inc.',
    },
    priceCurrency: 'USD',
    reportingCurrency: 'GBP',
    sourceMeta: {
      importRangeYears: null,
      importRangeYearsExplicit: false,
      annualHistoryFetchVersion: 3,
      stockDataVersion: 1,
    },
    annualData: [
      {
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
        reportingCurrency: 'GBP',
        base: {
          sharePrice: { effectiveValue: 210.4, sourceOfTruth: 'roic' },
          sharesOnIssue: { effectiveValue: 15500000000, sourceOfTruth: 'roic' },
          marketCap: { effectiveValue: 3200000000000, sourceOfTruth: 'derived' },
        },
      },
      {
        fiscalYear: 2023,
        fiscalYearEndDate: '2023-12-31',
        reportingCurrency: 'GBP',
        base: {
          sharePrice: { effectiveValue: 189.6, sourceOfTruth: 'user' },
          sharesOnIssue: { effectiveValue: 15700000000, sourceOfTruth: 'roic' },
          marketCap: { effectiveValue: 2980000000000, sourceOfTruth: 'derived' },
        },
      },
    ],
    ...overrides,
  };
}

function buildMetricsViewPayload() {
  return {
    mainTableRowPreferences: [
      {
        rowKey: 'main::priceCurrency',
        fieldPath: 'priceCurrency',
        label: 'SP currency',
        isBold: false,
      },
      {
        rowKey: 'main::annualData[].base.sharePrice',
        fieldPath: 'annualData[].base.sharePrice',
        label: 'Share price',
        isBold: true,
      },
      {
        rowKey: 'main::annualData[].base.marketCap',
        fieldPath: 'annualData[].base.marketCap',
        label: 'Market cap',
        isBold: false,
      },
    ],
    columns: [
      {
        key: 'annual-2023',
        kind: 'annual',
        label: 'FY 2023',
        shortLabel: '2023',
        fiscalYear: 2023,
        fiscalYearEndDate: '2023-12-31',
      },
      {
        key: 'annual-2024',
        kind: 'annual',
        label: 'FY 2024',
        shortLabel: '2024',
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
      },
    ],
    rows: [
      {
        rowKey: '105::reportingCurrency',
        fieldPath: 'reportingCurrency',
        label: 'Reporting currency',
        shortLabel: 'Reporting currency',
        section: 'DETAIL METRICS',
        shortSection: 'DETAIL METRICS',
        order: 105,
        surface: 'detail',
        isEnabled: true,
        isBold: false,
        cells: [
          {
            columnKey: 'annual-2023',
            value: 'GBP',
            sourceOfTruth: 'roic',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
          {
            columnKey: 'annual-2024',
            value: 'GBP',
            sourceOfTruth: 'roic',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
        ],
      },
      {
        rowKey: '710::annualData[].forecastData.fy1.ebit',
        fieldPath: 'annualData[].forecastData.fy1.ebit',
        label: 'EBIT FY+1',
        shortLabel: 'EBIT FY+1',
        section: 'EBIT Forecast',
        shortSection: 'EBIT Forecast',
        order: 710,
        surface: 'detail',
        isEnabled: true,
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2023',
            value: null,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: {
              kind: 'annual',
              fiscalYear: 2023,
              payloadPath: 'forecastData.fy1.ebit',
            },
          },
          {
            columnKey: 'annual-2024',
            value: 42,
            sourceOfTruth: 'user',
            isOverridden: true,
            isOverrideable: true,
            overrideTarget: {
              kind: 'annual',
              fiscalYear: 2024,
              payloadPath: 'forecastData.fy1.ebit',
            },
          },
        ],
      },
    ],
  };
}

describe('watchlistDashboardApi', () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.patch.mockReset();
    axios.post.mockReset();
    // The dashboard can perform one extra read for the richer metrics payload.
    // Most tests here only care about the summary/bootstrap reads, so the third
    // GET gets a safe default unless a test needs to inspect it directly.
    axios.get.mockResolvedValue({ data: { columns: [], rows: [] } });
  });

  it('builds the dashboard payload from watchlist metrics and price rows', () => {
    const payload = buildDashboardPayload(
      buildWatchlistStock(),
      {
        prices: [
          { date: '2024-01-02', close: '185.64' },
          { date: '2024-01-03', close: 184.25 },
        ],
      },
      'aapl',
    );

    expect(payload.identifier).toBe('AAPL');
    expect(payload.companyName).toBe('Apple Inc.');
    expect(payload.investmentCategory).toBe('Profitable Hi Growth');
    expect(payload.priceCurrency).toBe('USD');
    expect(payload.reportingCurrency).toBe('GBP');
    expect(payload.prices).toEqual([
      { date: '2024-01-02', close: 185.64 },
      { date: '2024-01-03', close: 184.25 },
    ]);
    expect(payload.annualMetrics).toEqual([
      {
        fiscalYear: 2023,
        fiscalYearEndDate: '2023-12-31',
        earningsReleaseDate: null,
        sharePrice: 189.6,
        sharesOnIssue: 15700000000,
        marketCap: 2980000000000,
      },
      {
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
        earningsReleaseDate: null,
        sharePrice: 210.4,
        sharesOnIssue: 15500000000,
        marketCap: 3200000000000,
      },
    ]);
    expect(payload.annualMainTableRows[0].cells.sharePrice).toEqual({
      columnKey: 'annual-2023',
      rowKey: 'main::annualData[].base.sharePrice',
      value: 189.6,
      sourceOfTruth: 'user',
      isOverridden: true,
      isBold: true,
      isOverrideable: true,
      overrideTarget: {
        kind: 'annual',
        fiscalYear: 2023,
        payloadPath: 'base.sharePrice',
      },
      fieldKey: 'sharePrice',
    });
    expect(payload.annualMainTableRows[0].cells.priceCurrency).toEqual({
      columnKey: 'annual-2023',
      rowKey: 'main::priceCurrency',
      value: 'USD',
      sourceOfTruth: 'system',
      isOverridden: false,
      isBold: false,
      isOverrideable: false,
      overrideTarget: null,
      fieldKey: 'priceCurrency',
    });
    expect(payload.annualMainTableRows[1].cells.sharesOnIssue).toEqual({
      columnKey: 'annual-2024',
      rowKey: 'main::annualData[].base.sharesOnIssue',
      value: 15500000000,
      sourceOfTruth: 'roic',
      isOverridden: false,
      isBold: false,
      isOverrideable: true,
      overrideTarget: {
        kind: 'annual',
        fiscalYear: 2024,
        payloadPath: 'base.sharesOnIssue',
      },
      fieldKey: 'sharesOnIssue',
    });
    expect(payload.metricsColumns).toEqual([]);
    expect(payload.metricsRows).toEqual([]);
    expect(payload.annualMainTableRows[0].cells.marketCap.isBold).toBe(true);
    // Market cap still renders from the payload, but the derived-field policy
    // now keeps it read-only so the stock card no longer opens the editor there.
    expect(payload.annualMainTableRows[0].cells.marketCap.isOverrideable).toBe(false);
    expect(payload.annualMainTableRows[0].cells.marketCap.overrideTarget).toBeNull();
  });

  it('normalizes annual metrics-mode rows from the backend metrics-view payload', () => {
    const payload = buildDashboardPayload(
      buildWatchlistStock(),
      { prices: [] },
      'aapl',
      buildMetricsViewPayload(),
    );

    expect(payload.metricsColumns).toEqual([
      {
        key: 'annual-2023',
        kind: 'annual',
        label: 'FY 2023',
        shortLabel: '2023',
        fiscalYear: 2023,
        fiscalYearEndDate: '2023-12-31',
        earningsReleaseDate: null,
        bucket: null,
      },
      {
        key: 'annual-2024',
        kind: 'annual',
        label: 'FY 2024',
        shortLabel: '2024',
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
        earningsReleaseDate: null,
        bucket: null,
      },
    ]);
    expect(payload.metricsRows[0].fieldPath).toBe('reportingCurrency');
    expect(payload.metricsRows[0].cells[0].value).toBe('GBP');
    expect(payload.metricsRows[0].cells[0].isOverrideable).toBe(false);
    expect(payload.metricsRows[1].fieldPath).toBe('annualData[].forecastData.fy1.ebit');
    expect(payload.metricsRows[1].cells[1]).toEqual({
      columnKey: 'annual-2024',
      value: 42,
      sourceOfTruth: 'user',
      isOverridden: true,
      isOverrideable: true,
      overrideTarget: {
        kind: 'annual',
        fiscalYear: 2024,
        payloadPath: 'forecastData.fy1.ebit',
      },
    });
    expect(payload.metricsRows[1].isBold).toBe(true);
    expect(payload.mainTableRowPreferences[0]).toEqual({
      rowKey: 'main::priceCurrency',
      fieldPath: 'priceCurrency',
      label: 'SP currency',
      isBold: false,
    });
    expect(payload.annualMainTableRows[0].cells.sharePrice.isBold).toBe(true);
  });

  it('defaults the requested pricing, valuation, and dividend rows to bold when a payload omits explicit bold flags', () => {
    const payload = buildDashboardPayload(
      buildWatchlistStock(),
      { prices: [] },
      'aapl',
      buildDefaultBoldMetricsPayload(),
    );

    // These rows start bold even before a user saves anything, so the stock
    // card highlights the requested pricing, valuation, and dividend rows
    // consistently across old payloads too.
    expect(
      Object.fromEntries(payload.metricsRows.map((row) => [row.fieldPath, row.isBold])),
    ).toEqual({
      'annualData[].forecastData.fy1.marketCap': true,
      'annualData[].forecastData.fy2.marketCap': true,
      'annualData[].forecastData.fy3.marketCap': true,
      'annualData[].valuationMultiples.evSalesTrailing': true,
      'annualData[].forecastData.fy1.evSales': true,
      'annualData[].forecastData.fy2.evSales': true,
      'annualData[].valuationMultiples.evEbitTrailing': true,
      'annualData[].forecastData.fy1.evEbit': true,
      'annualData[].forecastData.fy2.evEbit': true,
      'annualData[].forecastData.fy3.evEbit': true,
      'annualData[].valuationMultiples.peTrailing': true,
      'annualData[].forecastData.fy1.pe': true,
      'annualData[].forecastData.fy2.pe': true,
      'annualData[].forecastData.fy3.pe': true,
      'annualData[].epsAndDividends.epsTrailing': true,
      'annualData[].forecastData.fy1.eps': true,
      'annualData[].forecastData.fy2.eps': true,
      'annualData[].forecastData.fy3.eps': true,
      'annualData[].epsAndDividends.dyTrailing': true,
      'annualData[].forecastData.fy1.dy': true,
      'annualData[].forecastData.fy2.dy': true,
      'annualData[].forecastData.fy3.dy': true,
      'annualData[].epsAndDividends.dpsTrailing': true,
      'annualData[].forecastData.fy1.dps': true,
      'annualData[].forecastData.fy2.dps': true,
      'annualData[].forecastData.fy3.dps': true,
    });
    expect(payload.annualMainTableRows[0].cells.sharePrice.isBold).toBe(true);
    expect(payload.annualMainTableRows[0].cells.marketCap.isBold).toBe(true);
  });

  it('uses the browser-safe shared helper for frontend default-bold lookups', () => {
    // This keeps the Edge import bug from coming back by proving the frontend
    // can load the ESM helper and still see the canonical default-bold rows.
    expect(isDefaultBoldMetricsFieldPath('annualData[].forecastData.fy3.dps')).toBe(true);
    expect(isDefaultBoldMetricsFieldPath('annualData[].base.sharesOnIssue')).toBe(false);
  });

  it('keeps an explicit saved false when a user unbolds one of the default rows', () => {
    const payload = buildDashboardPayload(
      buildWatchlistStock(),
      { prices: [] },
      'aapl',
      {
        ...buildDefaultBoldMetricsPayload(),
        rows: buildDefaultBoldMetricsPayload().rows.map((row) => {
          return row.rowKey === '1490::annualData[].epsAndDividends.dpsTrailing'
            ? { ...row, isBold: false }
            : row;
        }),
        mainTableRowPreferences: [
          {
            rowKey: 'main::annualData[].base.sharePrice',
            fieldPath: 'annualData[].base.sharePrice',
            label: 'Share price',
            isBold: false,
          },
        ],
      },
    );

    expect(
      payload.metricsRows.find((row) => row.rowKey === '1490::annualData[].epsAndDividends.dpsTrailing')?.isBold,
    ).toBe(false);
    expect(payload.annualMainTableRows[0].cells.sharePrice.isBold).toBe(false);
  });

  it('preserves the Mongo-backed fiscal year on each normalized annual metric row', () => {
    const payload = buildDashboardPayload(
      buildWatchlistStock(),
      { prices: [] },
      'aapl',
    );

    expect(payload.annualMetrics[0].fiscalYear).toBe(2023);
    expect(payload.annualMetrics[1].fiscalYear).toBe(2024);
  });

  it('preserves every annual metric row returned by the watchlist document', () => {
    const annualData = Array.from({ length: 16 }, (_, index) => {
      const fiscalYear = 2025 - index;

      return {
        fiscalYear,
        fiscalYearEndDate: `${fiscalYear}-12-31`,
        base: {
          sharePrice: { effectiveValue: 100 + index },
          sharesOnIssue: { effectiveValue: 1000000000 + index },
          marketCap: { effectiveValue: 100000000000 + index },
        },
      };
    });

    const payload = buildDashboardPayload(
      buildWatchlistStock({ annualData }),
      { prices: [] },
      'aapl',
    );

    expect(payload.annualMetrics).toHaveLength(16);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2010);
    expect(payload.annualMetrics[15].fiscalYear).toBe(2025);
  });

  it('fetches watchlist and price data through the canonical backend routes', async () => {
    const abortSignal = new AbortController().signal;

    axios.get
      .mockResolvedValueOnce({
        data: buildWatchlistStock(),
      })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      })
      .mockResolvedValueOnce({
        data: buildMetricsViewPayload(),
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.get).toHaveBeenNthCalledWith(1, '/api/watchlist/AAPL', { signal: abortSignal });
    expect(axios.get).toHaveBeenNthCalledWith(2, '/api/stock-prices/AAPL', { signal: abortSignal });
    expect(axios.get).toHaveBeenNthCalledWith(3, '/api/watchlist/AAPL/metrics-view', { signal: abortSignal });
    expect(payload.companyName).toBe('Apple Inc.');
    expect(payload.prices).toEqual([{ date: '2024-01-02', close: 185.64 }]);
    expect(payload.metricsRows[1].fieldPath).toBe('annualData[].forecastData.fy1.ebit');
  });

  it('loads batched dashboard bootstraps through the new watchlist dashboards route', async () => {
    const abortSignal = new AbortController().signal;

    axios.get.mockResolvedValueOnce({
      data: {
        dashboards: [
          {
            identifier: 'AAPL',
            companyName: 'Apple Inc.',
            investmentCategory: 'Profitable Hi Growth',
            priceCurrency: 'USD',
            reportingCurrency: 'GBP',
            prices: [{ date: '2024-01-02', close: 185.64 }],
            annualMetrics: [
              {
                fiscalYear: 2024,
                fiscalYearEndDate: '2024-12-31',
                earningsReleaseDate: '2025-02-15',
                sharePrice: 210.4,
                sharesOnIssue: 15500000000,
                marketCap: 3200000000000,
              },
            ],
            annualMainTableRows: [
              {
                fiscalYear: 2024,
                fiscalYearEndDate: '2024-12-31',
                cells: {
                  priceCurrency: {
                    columnKey: 'annual-2024',
                    rowKey: 'main::priceCurrency',
                    value: 'USD',
                    sourceOfTruth: 'system',
                    isOverridden: false,
                    isBold: false,
                    isOverrideable: false,
                    overrideTarget: null,
                  },
                  sharePrice: {
                    columnKey: 'annual-2024',
                    rowKey: 'main::annualData[].base.sharePrice',
                    value: 210.4,
                    sourceOfTruth: 'roic',
                    isOverridden: false,
                    isBold: true,
                    isOverrideable: true,
                    overrideTarget: {
                      kind: 'annual',
                      fiscalYear: 2024,
                      payloadPath: 'base.sharePrice',
                    },
                  },
                  sharesOnIssue: {
                    columnKey: 'annual-2024',
                    rowKey: 'main::annualData[].base.sharesOnIssue',
                    value: 15500000000,
                    sourceOfTruth: 'user',
                    isOverridden: true,
                    isBold: false,
                    isOverrideable: true,
                    overrideTarget: {
                      kind: 'annual',
                      fiscalYear: 2024,
                      payloadPath: 'base.sharesOnIssue',
                    },
                  },
                },
              },
            ],
            metricsColumns: [],
            metricsRows: [],
            hasLoadedMetricsView: false,
            needsBackgroundRefresh: true,
          },
        ],
      },
    });

    const payload = await fetchWatchlistDashboardBootstraps({
      signal: abortSignal,
      tickers: ['aapl'],
    });

    expect(axios.get).toHaveBeenCalledWith('/api/watchlist/dashboards', {
      signal: abortSignal,
      params: {
        tickers: 'AAPL',
      },
    });
    expect(payload).toEqual([
      {
        identifier: 'AAPL',
        companyName: 'Apple Inc.',
        investmentCategory: 'Profitable Hi Growth',
        priceCurrency: 'USD',
        reportingCurrency: 'GBP',
        prices: [{ date: '2024-01-02', close: 185.64 }],
        annualMetrics: [
          {
            fiscalYear: 2024,
            fiscalYearEndDate: '2024-12-31',
            earningsReleaseDate: '2025-02-15',
            sharePrice: 210.4,
            sharesOnIssue: 15500000000,
            marketCap: 3200000000000,
          },
        ],
        annualMainTableRows: [
          {
            fiscalYear: 2024,
            fiscalYearEndDate: '2024-12-31',
            cells: {
              fiscalYearEndDate: {
                columnKey: 'annual-2024',
                rowKey: 'main::annualData[].fiscalYearEndDate',
                value: null,
                sourceOfTruth: 'system',
                isOverridden: false,
                isBold: false,
                isOverrideable: false,
                overrideTarget: null,
                fieldKey: 'fiscalYearEndDate',
              },
              fiscalYear: {
                columnKey: 'annual-2024',
                rowKey: 'main::annualData[].fiscalYear',
                value: null,
                sourceOfTruth: 'system',
                isOverridden: false,
                isBold: false,
                isOverrideable: false,
                overrideTarget: null,
                fieldKey: 'fiscalYear',
              },
              earningsReleaseDate: {
                columnKey: 'annual-2024',
                rowKey: 'main::annualData[].earningsReleaseDate',
                value: null,
                sourceOfTruth: 'system',
                isOverridden: false,
                isBold: false,
                isOverrideable: false,
                overrideTarget: null,
                fieldKey: 'earningsReleaseDate',
              },
              priceCurrency: {
                columnKey: 'annual-2024',
                rowKey: 'main::priceCurrency',
                value: 'USD',
                sourceOfTruth: 'system',
                isOverridden: false,
                isBold: false,
                isOverrideable: false,
                overrideTarget: null,
                fieldKey: 'priceCurrency',
              },
              sharePrice: {
                columnKey: 'annual-2024',
                rowKey: 'main::annualData[].base.sharePrice',
                value: 210.4,
                sourceOfTruth: 'roic',
                isOverridden: false,
                isBold: true,
                isOverrideable: true,
                overrideTarget: {
                  kind: 'annual',
                  fiscalYear: 2024,
                  payloadPath: 'base.sharePrice',
                },
                fieldKey: 'sharePrice',
              },
              sharesOnIssue: {
                columnKey: 'annual-2024',
                rowKey: 'main::annualData[].base.sharesOnIssue',
                value: 15500000000,
                sourceOfTruth: 'user',
                isOverridden: true,
                isBold: false,
                isOverrideable: true,
                overrideTarget: {
                  kind: 'annual',
                  fiscalYear: 2024,
                  payloadPath: 'base.sharesOnIssue',
                },
                fieldKey: 'sharesOnIssue',
              },
              marketCap: {
                columnKey: 'annual-2024',
                rowKey: 'main::annualData[].base.marketCap',
                value: null,
                sourceOfTruth: 'system',
                isOverridden: false,
                isBold: true,
                isOverrideable: false,
                overrideTarget: null,
                fieldKey: 'marketCap',
              },
            },
          },
        ],
        metricsColumns: [],
        metricsRows: [],
        mainTableRowPreferences: [],
        hasLoadedMetricsView: false,
        needsBackgroundRefresh: true,
        loadError: '',
      },
    ]);
  });

  it('serializes multiple tickers for chunked dashboard bootstrap requests', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        dashboards: [],
      },
    });

    await fetchWatchlistDashboardBootstraps({
      tickers: ['aapl', 'msft', 'nvda'],
    });

    expect(axios.get).toHaveBeenCalledWith('/api/watchlist/dashboards', {
      params: {
        tickers: 'AAPL,MSFT,NVDA',
      },
    });
  });

  it('loads metrics-view lazily through the dedicated endpoint', async () => {
    const abortSignal = new AbortController().signal;

    axios.get.mockResolvedValueOnce({
      data: buildMetricsViewPayload(),
    });

    const payload = await fetchDashboardMetricsView('aapl', { signal: abortSignal });

    expect(axios.get).toHaveBeenCalledWith('/api/watchlist/AAPL/metrics-view', { signal: abortSignal });
    expect(payload.hasLoadedMetricsView).toBe(true);
    expect(payload.metricsRows[1].fieldPath).toBe('annualData[].forecastData.fy1.ebit');
    expect(payload.metricsRows[1].isBold).toBe(true);
    expect(payload.mainTableRowPreferences[0]).toEqual({
      rowKey: 'main::priceCurrency',
      fieldPath: 'priceCurrency',
      label: 'SP currency',
      isBold: false,
    });
    expect(payload.mainTableRowPreferences[1]).toEqual({
      rowKey: 'main::annualData[].base.sharePrice',
      fieldPath: 'annualData[].base.sharePrice',
      label: 'Share price',
      isBold: true,
    });
  });

  it('updates row preferences through the shared hide-and-bold route contract', async () => {
    axios.patch.mockResolvedValueOnce({
      data: buildMetricsViewPayload(),
    });

    const payload = await updateDashboardRowPreference('aapl', '710::annualData[].forecastData.fy1.ebit', {
      isBold: true,
    });

    // The same helper now sends whichever preference changed so bolding one
    // row does not accidentally wipe the saved hide/show state.
    expect(axios.patch).toHaveBeenCalledWith(
      '/api/watchlist/AAPL/metrics-row-preferences',
      {
        rowKey: '710::annualData[].forecastData.fy1.ebit',
        isBold: true,
      },
      undefined,
    );
    expect(
      payload.metricsRows.find((row) => row.rowKey === '710::annualData[].forecastData.fy1.ebit')?.isBold,
    ).toBe(true);
    expect(
      payload.mainTableRowPreferences.find((row) => row.rowKey === 'main::annualData[].base.sharePrice')?.isBold,
    ).toBe(true);
  });

  it('refreshes one dashboard in the background and then reloads its bootstrap payload', async () => {
    const abortSignal = new AbortController().signal;

    axios.post.mockResolvedValueOnce({
      data: buildWatchlistStock(),
    });
    axios.get.mockResolvedValueOnce({
      data: {
        dashboards: [
          {
            identifier: 'AAPL',
            companyName: 'Apple Inc.',
            investmentCategory: 'Profitable Hi Growth',
            priceCurrency: 'USD',
            reportingCurrency: 'GBP',
            prices: [{ date: '2024-01-02', close: 185.64 }],
            annualMetrics: [],
            metricsColumns: [],
            metricsRows: [],
            hasLoadedMetricsView: false,
            needsBackgroundRefresh: false,
          },
        ],
      },
    });

    const payload = await refreshWatchlistDashboardBootstrap('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
    expect(axios.get).toHaveBeenCalledWith('/api/watchlist/dashboards', {
      signal: abortSignal,
      params: {
        tickers: 'AAPL',
      },
    });
    expect(payload.identifier).toBe('AAPL');
    expect(payload.needsBackgroundRefresh).toBe(false);
  });

  it('updates the investment category through the canonical watchlist route', async () => {
    const abortSignal = new AbortController().signal;

    axios.patch = vi.fn().mockResolvedValueOnce({
      data: buildWatchlistStock({
        investmentCategory: 'Mature Compounder',
      }),
    });

    const result = await updateDashboardInvestmentCategory('aapl', 'Mature Compounder', {
      signal: abortSignal,
    });

    expect(axios.patch).toHaveBeenCalledWith(
      '/api/watchlist/AAPL',
      { investmentCategory: 'Mature Compounder' },
      { signal: abortSignal },
    );
    expect(result).toEqual({
      identifier: 'AAPL',
      investmentCategory: 'Mature Compounder',
    });
  });

  it('refreshes legacy default-10 watchlist stocks before building the dashboard payload', async () => {
    const abortSignal = new AbortController().signal;
    const legacyStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: 10,
      },
    });
    const refreshedStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
        stockDataVersion: 1,
      },
      annualData: [
        {
          fiscalYear: 2024,
          fiscalYearEndDate: '2024-12-31',
          base: {
            sharePrice: { effectiveValue: 210.4 },
            sharesOnIssue: { effectiveValue: 15500000000 },
            marketCap: { effectiveValue: 3200000000000 },
          },
        },
        {
          fiscalYear: 2023,
          fiscalYearEndDate: '2023-12-31',
          base: {
            sharePrice: { effectiveValue: 189.6 },
            sharesOnIssue: { effectiveValue: 15700000000 },
            marketCap: { effectiveValue: 2980000000000 },
          },
        },
        {
          fiscalYear: 2022,
          fiscalYearEndDate: '2022-12-31',
          base: {
            sharePrice: { effectiveValue: 176.4 },
            sharesOnIssue: { effectiveValue: 15900000000 },
            marketCap: { effectiveValue: 2820000000000 },
          },
        },
      ],
    });

    axios.get
      .mockResolvedValueOnce({ data: legacyStockDocument })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });
    axios.post.mockResolvedValueOnce({ data: refreshedStockDocument });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
    expect(payload.annualMetrics).toHaveLength(3);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2022);
  });

  it('refreshes uncapped stocks that are missing the annual-history fetch version', async () => {
    const abortSignal = new AbortController().signal;
    const legacyStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        stockDataVersion: 1,
      },
    });
    const refreshedStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
        stockDataVersion: 1,
      },
    });

    axios.get
      .mockResolvedValueOnce({ data: legacyStockDocument })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });
    axios.post.mockResolvedValueOnce({ data: refreshedStockDocument });

    await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
  });

  it('refreshes uncapped 10-row watchlist stocks before building the dashboard payload', async () => {
    const abortSignal = new AbortController().signal;
    const uncappedTenYearStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 1,
        stockDataVersion: 1,
      },
      annualData: Array.from({ length: 10 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });
    const refreshedStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
        stockDataVersion: 1,
      },
      annualData: Array.from({ length: 22 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: uncappedTenYearStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });
    axios.post.mockResolvedValueOnce({ data: refreshedStockDocument });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
    expect(payload.annualMetrics).toHaveLength(22);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2004);
    expect(payload.annualMetrics[21].fiscalYear).toBe(2025);
  });

  it('refreshes uncapped 20-row watchlist stocks before building the dashboard payload', async () => {
    const abortSignal = new AbortController().signal;
    const uncappedTwentyYearStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 1,
        stockDataVersion: 1,
      },
      annualData: Array.from({ length: 20 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });
    const refreshedStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
        stockDataVersion: 1,
      },
      annualData: Array.from({ length: 22 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: uncappedTwentyYearStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });
    axios.post.mockResolvedValueOnce({ data: refreshedStockDocument });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
    expect(payload.annualMetrics).toHaveLength(22);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2004);
    expect(payload.annualMetrics[21].fiscalYear).toBe(2025);
  });

  it('does not refresh versioned uncapped watchlist stocks that already use the new fetch contract', async () => {
    const abortSignal = new AbortController().signal;
    const upgradedStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
        stockDataVersion: 1,
      },
      annualData: Array.from({ length: 22 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: upgradedStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).not.toHaveBeenCalled();
    expect(payload.annualMetrics).toHaveLength(22);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2004);
    expect(payload.annualMetrics[21].fiscalYear).toBe(2025);
  });

  it('does not refresh versioned uncapped short-history watchlist stocks', async () => {
    const abortSignal = new AbortController().signal;
    const upgradedShortHistoryStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
        stockDataVersion: 1,
      },
      annualData: Array.from({ length: 10 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: upgradedShortHistoryStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).not.toHaveBeenCalled();
    expect(payload.annualMetrics).toHaveLength(10);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2016);
    expect(payload.annualMetrics[9].fiscalYear).toBe(2025);
  });

  it('does not refresh explicitly capped 20-row watchlist stocks', async () => {
    const abortSignal = new AbortController().signal;
    const explicitTwentyYearStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: 20,
        importRangeYearsExplicit: true,
        annualHistoryFetchVersion: 3,
        stockDataVersion: 1,
      },
      annualData: Array.from({ length: 20 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: explicitTwentyYearStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).not.toHaveBeenCalled();
    expect(payload.annualMetrics).toHaveLength(20);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2006);
    expect(payload.annualMetrics[19].fiscalYear).toBe(2025);
  });

  it('does not refresh explicitly capped 10-row watchlist stocks', async () => {
    const abortSignal = new AbortController().signal;
    const explicitTenYearStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: 10,
        importRangeYearsExplicit: true,
        annualHistoryFetchVersion: 3,
        stockDataVersion: 1,
      },
      annualData: Array.from({ length: 10 }, (_, index) => {
        const fiscalYear = 2025 - index;

        return {
          fiscalYear,
          fiscalYearEndDate: `${fiscalYear}-12-31`,
          base: {
            sharePrice: { effectiveValue: 100 + index },
            sharesOnIssue: { effectiveValue: 1000000000 + index },
            marketCap: { effectiveValue: 100000000000 + index },
          },
        };
      }),
    });

    axios.get
      .mockResolvedValueOnce({ data: explicitTenYearStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });

    const payload = await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).not.toHaveBeenCalled();
    expect(payload.annualMetrics).toHaveLength(10);
    expect(payload.annualMetrics[0].fiscalYear).toBe(2016);
    expect(payload.annualMetrics[9].fiscalYear).toBe(2025);
  });

  it('refreshes stocks that are missing stockDataVersion even when annual history metadata is current', async () => {
    const abortSignal = new AbortController().signal;
    const staleVersionStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
      },
    });
    const refreshedStockDocument = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: null,
        importRangeYearsExplicit: false,
        annualHistoryFetchVersion: 3,
        stockDataVersion: 1,
      },
    });

    axios.get
      .mockResolvedValueOnce({ data: staleVersionStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });
    axios.post.mockResolvedValueOnce({ data: refreshedStockDocument });

    await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).toHaveBeenCalledWith('/api/watchlist/AAPL/refresh', {}, { signal: abortSignal });
  });

  it('does not refresh explicitly capped stocks when stockDataVersion is current', async () => {
    const abortSignal = new AbortController().signal;
    const explicitCurrentStock = buildWatchlistStock({
      sourceMeta: {
        importRangeYears: 10,
        importRangeYearsExplicit: true,
        annualHistoryFetchVersion: 3,
        stockDataVersion: 1,
      },
    });

    axios.get
      .mockResolvedValueOnce({ data: explicitCurrentStock })
      .mockResolvedValueOnce({
        data: {
          prices: [{ date: '2024-01-02', close: 185.64 }],
        },
      });

    await fetchDashboardData('aapl', { signal: abortSignal });

    expect(axios.post).not.toHaveBeenCalled();
  });
});
