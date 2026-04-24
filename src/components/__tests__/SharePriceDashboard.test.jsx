import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SharePriceDashboard from '../SharePriceDashboard';
import { ENHANCED_INTERNAL_SCROLLBAR_SIZE, enhancedInternalScrollbarSx } from '../sharedScrollbarStyles.js';
import {
  fetchDashboardData,
  fetchDashboardMetricsView,
  updateDashboardMetricOverride,
  updateDashboardInvestmentCategory,
  updateDashboardRowPreference,
} from '../../services/watchlistDashboardApi';
import {
  buildRoundedChartScale,
  formatYAxisPrice,
  getPreferredTickCount,
} from '../sharePriceChartScale';

// This file protects the stock card's hardest user-facing behavior: preset
// ranges, scroll-driven month updates, lazy metrics, and focused metrics mode.
// The helpers below keep the test browser simple, while the assertions stay
// centered on what the user can see and what the page promises to preserve.

function createMockComponent(tagName, omittedPropNames = []) {
  return React.forwardRef(function MockComponent({ children, ...props }, ref) {
    const forwardedProps = { ...props, ref };

    omittedPropNames.forEach((propName) => {
      delete forwardedProps[propName];
    });

    if (tagName === 'button' && !forwardedProps.type) {
      forwardedProps.type = 'button';
    }

    return React.createElement(tagName, forwardedProps, children);
  });
}

vi.mock('../../services/watchlistDashboardApi', () => ({
  fetchDashboardData: vi.fn(),
  fetchDashboardMetricsView: vi.fn(),
  updateDashboardMetricOverride: vi.fn(),
  updateDashboardInvestmentCategory: vi.fn(),
  updateDashboardRowPreference: vi.fn(),
}));

vi.mock('@mui/material/Box', () => ({
  default: createMockComponent('div', ['sx']),
}));

vi.mock('@mui/material/Button', () => ({
  default: createMockComponent('button', ['size', 'sx', 'variant']),
}));

vi.mock('@mui/material/Card', () => ({
  default: createMockComponent('div', ['sx']),
}));

vi.mock('@mui/material/CardActions', () => ({
  default: createMockComponent('div', ['sx']),
}));

vi.mock('@mui/material/CardContent', () => ({
  default: createMockComponent('div', ['sx']),
}));

vi.mock('@mui/material/CircularProgress', () => ({
  default: createMockComponent('div', ['size', 'sx']),
}));

vi.mock('@mui/material/Typography', () => ({
  default: createMockComponent('div', ['align', 'color', 'component', 'gutterBottom', 'sx', 'variant']),
}));

// This mock keeps the input DOM-simple. The tests only need a label plus a
// plain input, so we strip MUI-only layout props before they hit the real DOM.
vi.mock('@mui/material/TextField', () => ({
  default: function MockTextField({
    fullWidth,
    InputLabelProps,
    inputProps,
    label,
    margin,
    size,
    sx,
    variant,
    ...props
  }) {
    void fullWidth;
    void InputLabelProps;
    void margin;
    void size;
    void sx;
    void variant;

    return React.createElement(
      'label',
      null,
      React.createElement('span', null, label),
      React.createElement('input', {
        'aria-label': label,
        ...inputProps,
        ...props,
      }),
    );
  },
}));

const PRESET_SCROLL_STEP_PX = 28;
const DASHBOARD_TEST_ID = 'share-price-dashboard-scroll-region';

let originalRequestAnimationFrame;
let originalCancelAnimationFrame;
let originalMatchMedia;
let originalResizeObserver;
let originalInnerWidth;
let originalInnerHeight;
let currentMatchMediaWidth = 1024;
let mountedContainer;
let mountedRoot;
let pendingAnimationFrameHandles = new Set();
let activeResizeObservers = [];
let matchMediaListenerRegistry = new Map();
let nextAnimationFrameHandle = 1;

function setViewportWidth(width) {
  currentMatchMediaWidth = width;
}

function setWindowViewportSize({ width, height }) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
}

function getMediaQueryMatch(query) {
  const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/);
  return maxWidthMatch ? currentMatchMediaWidth <= Number(maxWidthMatch[1]) : false;
}

function dispatchMatchMediaChange(query) {
  const listeners = matchMediaListenerRegistry.get(query);

  if (!listeners || !listeners.size) {
    return;
  }

  const event = {
    matches: getMediaQueryMatch(query),
    media: query,
  };

  Array.from(listeners).forEach((listener) => {
    listener(event);
  });
}

async function setViewportWidthAndDispatch(width) {
  setViewportWidth(width);

  await act(async () => {
    Array.from(matchMediaListenerRegistry.keys()).forEach((query) => {
      dispatchMatchMediaChange(query);
    });
  });
}

function shiftMonthString(monthString, monthsToShift) {
  const [yearText, monthText] = monthString.split('-');
  const shiftedDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + monthsToShift, 1));

  return `${shiftedDate.getUTCFullYear()}-${String(shiftedDate.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthStringFromDate(dateString) {
  return typeof dateString === 'string' ? dateString.slice(0, 7) : '';
}

function getMonthOffset(startMonth, endMonth) {
  const [startYearText, startMonthText] = startMonth.split('-');
  const [endYearText, endMonthText] = endMonth.split('-');

  return ((Number(endYearText) - Number(startYearText)) * 12) + (Number(endMonthText) - Number(startMonthText));
}

function mapTimestampAcrossAnchors(timestamp, { minTime, maxTime, anchors, plotWidth }) {
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  if (timestamp <= minTime) {
    return 0;
  }

  if (timestamp >= maxTime) {
    return plotWidth;
  }

  const segments = [];
  const firstAnchor = anchors[0];
  const lastAnchor = anchors[anchors.length - 1];

  segments.push({
    startTime: minTime,
    endTime: firstAnchor.time,
    startX: 0,
    endX: firstAnchor.x,
  });

  for (let index = 0; index < anchors.length - 1; index += 1) {
    segments.push({
      startTime: anchors[index].time,
      endTime: anchors[index + 1].time,
      startX: anchors[index].x,
      endX: anchors[index + 1].x,
    });
  }

  segments.push({
    startTime: lastAnchor.time,
    endTime: maxTime,
    startX: lastAnchor.x,
    endX: plotWidth,
  });

  const matchingSegment = segments.find((segment) => {
    return timestamp >= segment.startTime && timestamp <= segment.endTime;
  }) || segments[segments.length - 1];
  const timeRange = matchingSegment.endTime - matchingSegment.startTime;

  if (Math.abs(timeRange) <= 1e-6) {
    return matchingSegment.endX;
  }

  const ratio = (timestamp - matchingSegment.startTime) / timeRange;
  return matchingSegment.startX + (ratio * (matchingSegment.endX - matchingSegment.startX));
}

function buildExpectedFiscalYearBoundaryPositions({ annualMetrics, prices, headerCells, plotWidth }) {
  const headerCenterByYear = new Map(
    headerCells.map((cellNode) => [
      cellNode.getAttribute('data-fiscal-year'),
      Number(cellNode.getAttribute('data-center-x')),
    ]),
  );
  const anchors = annualMetrics.map((annualRow) => ({
    fiscalYear: annualRow.fiscalYear,
    time: new Date(annualRow.earningsReleaseDate || annualRow.fiscalYearEndDate).getTime(),
    x: headerCenterByYear.get(String(annualRow.fiscalYear)),
  }));
  const minTime = new Date(prices[0].date).getTime();
  const maxTime = new Date(prices[prices.length - 1].date).getTime();

  return annualMetrics.map((annualRow, index) => {
    const startX = index === 0
      ? 0
      : mapTimestampAcrossAnchors(
          new Date(annualMetrics[index - 1].fiscalYearEndDate).getTime(),
          { minTime, maxTime, anchors, plotWidth },
        );
    const endX = mapTimestampAcrossAnchors(
      new Date(annualRow.fiscalYearEndDate).getTime(),
      { minTime, maxTime, anchors, plotWidth },
    );

    return {
      fiscalYear: String(annualRow.fiscalYear),
      startX,
      endX,
    };
  });
}

// The real card fetches large backend payloads. Keeping a local payload here
// makes the regression deterministic and easier to read.
function buildAnnualMainTableRows(annualMetrics = []) {
  return annualMetrics.map((annualRow) => ({
    fiscalYear: annualRow.fiscalYear,
    fiscalYearEndDate: annualRow.fiscalYearEndDate,
    cells: {
      fiscalYearEndDate: {
        columnKey: `annual-${annualRow.fiscalYear}`,
        rowKey: 'main::annualData[].fiscalYearEndDate',
        value: annualRow.fiscalYearEndDate,
        sourceOfTruth: 'system',
        isOverridden: false,
        isBold: false,
        isOverrideable: false,
        overrideTarget: null,
      },
      fiscalYear: {
        columnKey: `annual-${annualRow.fiscalYear}`,
        rowKey: 'main::annualData[].fiscalYear',
        value: annualRow.fiscalYear,
        sourceOfTruth: 'system',
        isOverridden: false,
        isBold: false,
        isOverrideable: false,
        overrideTarget: null,
      },
      earningsReleaseDate: {
        columnKey: `annual-${annualRow.fiscalYear}`,
        rowKey: 'main::annualData[].earningsReleaseDate',
        value: annualRow.earningsReleaseDate,
        sourceOfTruth: 'system',
        isOverridden: false,
        isBold: false,
        isOverrideable: false,
        overrideTarget: null,
      },
      // Currency metadata repeats across columns because it belongs to the
      // stock itself, not to one fiscal year. Keeping it in the main table
      // still gives the user a clear reference right next to share price.
      priceCurrency: {
        columnKey: `annual-${annualRow.fiscalYear}`,
        rowKey: 'main::priceCurrency',
        value: annualRow.priceCurrency ?? 'USD',
        sourceOfTruth: 'system',
        isOverridden: false,
        isBold: false,
        isOverrideable: false,
        overrideTarget: null,
      },
      // The base table uses these rich cells so the tests can exercise the
      // same override editor flow as the detail metrics surface.
      sharePrice: {
        columnKey: `annual-${annualRow.fiscalYear}`,
        rowKey: 'main::annualData[].base.sharePrice',
        value: annualRow.sharePrice,
        sourceOfTruth: 'roic',
        isOverridden: false,
        isBold: true,
        isOverrideable: true,
        overrideTarget: {
          kind: 'annual',
          fiscalYear: annualRow.fiscalYear,
          payloadPath: 'base.sharePrice',
        },
      },
      sharesOnIssue: {
        columnKey: `annual-${annualRow.fiscalYear}`,
        rowKey: 'main::annualData[].base.sharesOnIssue',
        value: annualRow.sharesOnIssue,
        sourceOfTruth: 'roic',
        isOverridden: false,
        isBold: false,
        isOverrideable: true,
        overrideTarget: {
          kind: 'annual',
          fiscalYear: annualRow.fiscalYear,
          payloadPath: 'base.sharesOnIssue',
        },
      },
      marketCap: {
        columnKey: `annual-${annualRow.fiscalYear}`,
        rowKey: 'main::annualData[].base.marketCap',
        value: annualRow.marketCap,
        sourceOfTruth: 'derived',
        isOverridden: false,
        isBold: true,
        // Market cap stays bold and visible, but the new derived-field policy
        // keeps it read-only so the user edits share price or shares instead.
        isOverrideable: false,
        overrideTarget: null,
      },
    },
  }));
}

function buildDashboardPayload(overrides = {}) {
  const prices = [];

  for (let year = 2010; year <= 2025; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      prices.push({
        date: `${year}-${String(month).padStart(2, '0')}-01`,
        close: 80 + ((year - 2010) * 2) + (month / 10),
      });
    }
  }

  const annualMetrics = [];

  for (let year = 2010; year <= 2025; year += 1) {
    annualMetrics.push({
      fiscalYear: year,
      fiscalYearEndDate: `${year}-12-31`,
      earningsReleaseDate: `${year + 1}-02-15`,
      sharePrice: 100 + (year - 2010),
      sharesOnIssue: 1000000000 + ((year - 2010) * 1000000),
      marketCap: 100000000000 + ((year - 2010) * 5000000000),
    });
  }

  const finalAnnualMetrics = Array.isArray(overrides.annualMetrics) ? overrides.annualMetrics : annualMetrics;

  return {
    identifier: 'AAPL',
    companyName: 'Apple Inc.',
    investmentCategory: 'Profitable Hi Growth',
    priceCurrency: 'USD',
    reportingCurrency: 'GBP',
    prices,
    annualMetrics: finalAnnualMetrics.map((annualRow) => ({
      ...annualRow,
      priceCurrency: annualRow.priceCurrency ?? 'USD',
    })),
    annualMainTableRows: Array.isArray(overrides.annualMainTableRows)
      ? overrides.annualMainTableRows
      : buildAnnualMainTableRows(
          finalAnnualMetrics.map((annualRow) => ({
            ...annualRow,
            priceCurrency: annualRow.priceCurrency ?? 'USD',
          })),
        ),
    metricsColumns: [],
    metricsRows: [],
    ...overrides,
  };
}

function buildMetricsModePayload(overrides = {}) {
  return buildDashboardPayload({
    metricsColumns: [
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
      {
        key: 'annual-2025',
        kind: 'annual',
        label: 'FY 2025',
        shortLabel: '2025',
        fiscalYear: 2025,
        fiscalYearEndDate: '2025-12-31',
      },
    ],
    metricsRows: [
      {
        rowKey: '710::annualData[].forecastData.fy1.ebit',
        fieldPath: 'annualData[].forecastData.fy1.ebit',
        label: 'EBIT FY+1',
        shortLabel: 'EBIT FY+1',
        section: 'Income Statement',
        shortSection: 'Income',
        order: 710,
        surface: 'detail',
        isEnabled: true,
        isBold: false,
        cells: [
          {
            columnKey: 'annual-2023',
            value: 12,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2023, payloadPath: 'forecastData.fy1.ebit' },
          },
          {
            columnKey: 'annual-2024',
            value: 18,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.ebit' },
          },
          {
            columnKey: 'annual-2025',
            value: 24,
            sourceOfTruth: 'user',
            isOverridden: true,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.ebit' },
          },
        ],
      },
      {
        rowKey: '715::annualData[].forecastData.fy1.revenue',
        fieldPath: 'annualData[].forecastData.fy1.revenue',
        label: 'Revenue FY+1',
        shortLabel: 'Revenue FY+1',
        section: 'Income Statement',
        shortSection: 'Income',
        order: 715,
        surface: 'detail',
        isEnabled: true,
        isBold: false,
        cells: [
          {
            columnKey: 'annual-2023',
            value: 32,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2023, payloadPath: 'forecastData.fy1.revenue' },
          },
          {
            columnKey: 'annual-2024',
            value: 38,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.revenue' },
          },
          {
            columnKey: 'annual-2025',
            value: 44,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.revenue' },
          },
        ],
      },
      {
        rowKey: '810::annualData[].forecastData.fy1.cash',
        fieldPath: 'annualData[].forecastData.fy1.cash',
        label: 'Cash FY+1',
        shortLabel: 'Cash FY+1',
        section: 'Balance Sheet',
        shortSection: 'Balance',
        order: 810,
        surface: 'detail',
        isEnabled: true,
        isBold: false,
        cells: [
          {
            columnKey: 'annual-2023',
            value: 8,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2023, payloadPath: 'forecastData.fy1.cash' },
          },
          {
            columnKey: 'annual-2024',
            value: 11,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.cash' },
          },
          {
            columnKey: 'annual-2025',
            value: 14,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.cash' },
          },
        ],
      },
      {
        rowKey: '1110::annualData[].growthForecasts.revenueCagr3y',
        fieldPath: 'annualData[].growthForecasts.revenueCagr3y',
        label: 'Revenue forecast CAGR 3Y',
        shortLabel: 'Rev CAGR 3Y',
        section: 'Growth & Forecasts',
        shortSection: 'Growth',
        order: 1110,
        surface: 'detail',
        isEnabled: false,
        isBold: false,
        cells: [
          {
            columnKey: 'annual-2023',
            value: null,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2023, payloadPath: 'growthForecasts.revenueCagr3y' },
          },
          {
            columnKey: 'annual-2024',
            value: null,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'growthForecasts.revenueCagr3y' },
          },
          {
            columnKey: 'annual-2025',
            value: null,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'growthForecasts.revenueCagr3y' },
          },
        ],
      },
    ],
    ...overrides,
  });
}

function buildDefaultBoldValuationMetricsPayload(overrides = {}) {
  return buildDashboardPayload({
    metricsColumns: [
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
    metricsRows: [
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 3300000000000,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
          {
            columnKey: 'annual-2025',
            value: 3450000000000,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 3500000000000,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
          {
            columnKey: 'annual-2025',
            value: 3650000000000,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 3700000000000,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
          {
            columnKey: 'annual-2025',
            value: 3850000000000,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 5.8,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
          {
            columnKey: 'annual-2025',
            value: 5.4,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 5.2,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.evSales' },
          },
          {
            columnKey: 'annual-2025',
            value: 4.9,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.evSales' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 4.7,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy2.evSales' },
          },
          {
            columnKey: 'annual-2025',
            value: 4.4,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy2.evSales' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 18.4,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
          {
            columnKey: 'annual-2025',
            value: 16.2,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 15.8,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.evEbit' },
          },
          {
            columnKey: 'annual-2025',
            value: 14.4,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.evEbit' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 14.7,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy2.evEbit' },
          },
          {
            columnKey: 'annual-2025',
            value: 13.8,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy2.evEbit' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 13.9,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy3.evEbit' },
          },
          {
            columnKey: 'annual-2025',
            value: 13.1,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy3.evEbit' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 27.1,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'valuationMultiples.peTrailing' },
          },
          {
            columnKey: 'annual-2025',
            value: 24.8,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'valuationMultiples.peTrailing' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 23.6,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.pe' },
          },
          {
            columnKey: 'annual-2025',
            value: 21.3,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.pe' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 20.5,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy2.pe' },
          },
          {
            columnKey: 'annual-2025',
            value: 18.9,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy2.pe' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 18.2,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy3.pe' },
          },
          {
            columnKey: 'annual-2025',
            value: 17.1,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy3.pe' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 6.1,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'epsAndDividends.epsTrailing' },
          },
          {
            columnKey: 'annual-2025',
            value: 6.4,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'epsAndDividends.epsTrailing' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 6.8,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.eps' },
          },
          {
            columnKey: 'annual-2025',
            value: 7.2,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.eps' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 7.4,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy2.eps' },
          },
          {
            columnKey: 'annual-2025',
            value: 7.8,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy2.eps' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 7.9,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy3.eps' },
          },
          {
            columnKey: 'annual-2025',
            value: 8.3,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy3.eps' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 1.2,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
          {
            columnKey: 'annual-2025',
            value: 1.3,
            sourceOfTruth: 'derived',
            isOverridden: false,
            isOverrideable: false,
            overrideTarget: null,
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 1.4,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.dy' },
          },
          {
            columnKey: 'annual-2025',
            value: 1.5,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.dy' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 1.6,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy2.dy' },
          },
          {
            columnKey: 'annual-2025',
            value: 1.7,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy2.dy' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 1.8,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy3.dy' },
          },
          {
            columnKey: 'annual-2025',
            value: 1.9,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy3.dy' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 0.94,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'epsAndDividends.dpsTrailing' },
          },
          {
            columnKey: 'annual-2025',
            value: 0.99,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'epsAndDividends.dpsTrailing' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 1.03,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.dps' },
          },
          {
            columnKey: 'annual-2025',
            value: 1.08,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.dps' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 1.11,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy2.dps' },
          },
          {
            columnKey: 'annual-2025',
            value: 1.16,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy2.dps' },
          },
        ],
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
        isBold: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 1.19,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy3.dps' },
          },
          {
            columnKey: 'annual-2025',
            value: 1.24,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy3.dps' },
          },
        ],
      },
    ],
    ...overrides,
  });
}

function buildMetricsModePayloadWithHiddenSectionLeader() {
  const payload = buildMetricsModePayload();

  payload.metricsRows = payload.metricsRows.map((row) => {
    return row.rowKey === '710::annualData[].forecastData.fy1.ebit'
      ? { ...row, isEnabled: false }
      : row;
  });

  return payload;
}

function buildPlainValueBoundaryDashboardPayload(overrides = {}) {
  return buildDashboardPayload({
    prices: [
      { date: '2024-01-01', close: 99.75 },
      { date: '2024-12-01', close: 100.25 },
      { date: '2025-12-01', close: 101.25 },
    ],
    annualMetrics: [
      {
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
        earningsReleaseDate: '2025-02-15',
        sharePrice: 99.75,
        sharesOnIssue: 980000000,
        marketCap: 1200000000,
      },
      {
        fiscalYear: 2025,
        fiscalYearEndDate: '2025-12-31',
        earningsReleaseDate: '2026-02-15',
        sharePrice: 100.25,
        sharesOnIssue: 990000000,
        marketCap: 1300000000,
      },
    ],
    ...overrides,
  });
}

function buildPlainValueBoundaryMetricsPayload(overrides = {}) {
  return buildPlainValueBoundaryDashboardPayload({
    metricsColumns: [
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
    metricsRows: [
      {
        rowKey: '710::annualData[].forecastData.fy1.ebit',
        fieldPath: 'annualData[].forecastData.fy1.ebit',
        label: 'EBIT FY+1',
        shortLabel: 'EBIT FY+1',
        section: 'Income Statement',
        shortSection: 'Income',
        order: 710,
        surface: 'detail',
        isEnabled: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 99.75,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.ebit' },
          },
          {
            columnKey: 'annual-2025',
            value: 100.25,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.ebit' },
          },
        ],
      },
      {
        rowKey: '720::annualData[].base.customerCount',
        fieldPath: 'annualData[].base.customerCount',
        label: 'Customer count',
        shortLabel: 'Customer count',
        section: 'Operating',
        shortSection: 'Ops',
        order: 720,
        surface: 'detail',
        isEnabled: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 99.75,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'base.customerCount' },
          },
          {
            columnKey: 'annual-2025',
            value: 100.25,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'base.customerCount' },
          },
        ],
      },
      {
        rowKey: '730::annualData[].base.evEbit',
        fieldPath: 'annualData[].base.evEbit',
        label: 'EV / EBIT',
        shortLabel: 'EV / EBIT',
        section: 'Valuation',
        shortSection: 'Value',
        order: 730,
        surface: 'detail',
        isEnabled: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 99.75,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'base.evEbit' },
          },
          {
            columnKey: 'annual-2025',
            value: -123.45,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'base.evEbit' },
          },
        ],
      },
      {
        rowKey: '740::annualData[].growthForecasts.revenueCagr3y',
        fieldPath: 'annualData[].growthForecasts.revenueCagr3y',
        label: 'Revenue CAGR 3Y',
        shortLabel: 'Revenue CAGR 3Y',
        section: 'Growth',
        shortSection: 'Growth',
        order: 740,
        surface: 'detail',
        isEnabled: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 12.34,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'growthForecasts.revenueCagr3y' },
          },
          {
            columnKey: 'annual-2025',
            value: 123.45,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'growthForecasts.revenueCagr3y' },
          },
        ],
      },
    ],
    ...overrides,
  });
}

function buildExactZeroDashboardPayload(overrides = {}) {
  return buildDashboardPayload({
    annualMetrics: [
      {
        fiscalYear: 2024,
        fiscalYearEndDate: '2024-12-31',
        earningsReleaseDate: '2025-02-15',
        sharePrice: -0,
        sharesOnIssue: 0,
        marketCap: 0,
      },
      {
        fiscalYear: 2025,
        fiscalYearEndDate: '2025-12-31',
        earningsReleaseDate: '2026-02-15',
        sharePrice: 100.25,
        sharesOnIssue: 990000000,
        marketCap: 1300000000,
      },
    ],
    ...overrides,
  });
}

function buildExactZeroMetricsPayload(overrides = {}) {
  return buildExactZeroDashboardPayload({
    metricsColumns: [
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
    metricsRows: [
      {
        rowKey: '710::annualData[].forecastData.fy1.ebit',
        fieldPath: 'annualData[].forecastData.fy1.ebit',
        label: 'EBIT FY+1',
        shortLabel: 'EBIT FY+1',
        section: 'Income Statement',
        shortSection: 'Income',
        order: 710,
        surface: 'detail',
        isEnabled: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 0,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.ebit' },
          },
          {
            columnKey: 'annual-2025',
            value: 100.25,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.ebit' },
          },
        ],
      },
      {
        rowKey: '720::annualData[].base.customerCount',
        fieldPath: 'annualData[].base.customerCount',
        label: 'Customer count',
        shortLabel: 'Customer count',
        section: 'Operating',
        shortSection: 'Ops',
        order: 720,
        surface: 'detail',
        isEnabled: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: -0,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'base.customerCount' },
          },
          {
            columnKey: 'annual-2025',
            value: 99.75,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'base.customerCount' },
          },
        ],
      },
      {
        rowKey: '730::annualData[].base.evEbit',
        fieldPath: 'annualData[].base.evEbit',
        label: 'EV / EBIT',
        shortLabel: 'EV / EBIT',
        section: 'Valuation',
        shortSection: 'Value',
        order: 730,
        surface: 'detail',
        isEnabled: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 0,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'base.evEbit' },
          },
          {
            columnKey: 'annual-2025',
            value: -123.45,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'base.evEbit' },
          },
        ],
      },
      {
        rowKey: '740::annualData[].growthForecasts.revenueCagr3y',
        fieldPath: 'annualData[].growthForecasts.revenueCagr3y',
        label: 'Revenue CAGR 3Y',
        shortLabel: 'Revenue CAGR 3Y',
        section: 'Growth',
        shortSection: 'Growth',
        order: 740,
        surface: 'detail',
        isEnabled: true,
        cells: [
          {
            columnKey: 'annual-2024',
            value: 0,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'growthForecasts.revenueCagr3y' },
          },
          {
            columnKey: 'annual-2025',
            value: 12.34,
            sourceOfTruth: 'system',
            isOverridden: false,
            isOverrideable: true,
            overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'growthForecasts.revenueCagr3y' },
          },
        ],
      },
    ],
    ...overrides,
  });
}

function buildLongHistoryDashboardPayload(overrides = {}) {
  const prices = [];

  for (let year = 1990; year <= 2025; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      prices.push({
        date: `${year}-${String(month).padStart(2, '0')}-01`,
        close: 60 + ((year - 1990) * 1.5) + (month / 10),
      });
    }
  }

  const annualMetrics = [];

  for (let year = 1990; year <= 2025; year += 1) {
    annualMetrics.push({
      fiscalYear: year,
      fiscalYearEndDate: `${year}-12-31`,
      earningsReleaseDate: `${year + 1}-02-15`,
      sharePrice: 90 + (year - 1990),
      sharesOnIssue: 900000000 + ((year - 1990) * 1000000),
      marketCap: 90000000000 + ((year - 1990) * 4000000000),
    });
  }

  return buildDashboardPayload({
    prices,
    annualMetrics,
    ...overrides,
  });
}

function buildShortHistoryDashboardPayload(overrides = {}) {
  const prices = [];

  for (let year = 2024; year <= 2026; year += 1) {
    const startMonth = year === 2024 ? 4 : 1;
    const endMonth = year === 2026 ? 4 : 12;

    for (let month = startMonth; month <= endMonth; month += 1) {
      prices.push({
        date: `${year}-${String(month).padStart(2, '0')}-01`,
        close: 35 + ((year - 2024) * 8) + (month / 10),
      });
    }
  }

  const annualMetrics = [
    {
      fiscalYear: 2025,
      fiscalYearEndDate: '2025-01-31',
      earningsReleaseDate: '2025-03-15',
      sharePrice: 70.64,
      sharesOnIssue: 189800000,
      marketCap: 13400000000,
    },
    {
      fiscalYear: 2026,
      fiscalYearEndDate: '2026-01-31',
      earningsReleaseDate: '2026-03-15',
      sharePrice: 53.43,
      sharesOnIssue: 202200000,
      marketCap: 10800000000,
    },
  ];

  return buildDashboardPayload({
    identifier: 'RBRK',
    companyName: 'Rubrik, Inc.',
    prices,
    annualMetrics,
    ...overrides,
  });
}

function buildIrregularFiscalYearDashboardPayload(overrides = {}) {
  const prices = [];

  for (let year = 2022; year <= 2025; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      prices.push({
        date: `${year}-${String(month).padStart(2, '0')}-01`,
        close: 45 + ((year - 2022) * 9) + (month / 10),
      });
    }
  }

  const annualMetrics = [
    {
      fiscalYear: 2022,
      fiscalYearEndDate: '2022-02-28',
      earningsReleaseDate: '2022-04-15',
      sharePrice: 52.15,
      sharesOnIssue: 320000000,
      marketCap: 16600000000,
    },
    {
      fiscalYear: 2023,
      fiscalYearEndDate: '2023-04-30',
      earningsReleaseDate: '2023-06-15',
      sharePrice: 60.45,
      sharesOnIssue: 324000000,
      marketCap: 19500000000,
    },
    {
      fiscalYear: 2024,
      fiscalYearEndDate: '2024-12-31',
      earningsReleaseDate: '2025-02-20',
      sharePrice: 67.8,
      sharesOnIssue: 329000000,
      marketCap: 22300000000,
    },
    {
      fiscalYear: 2025,
      fiscalYearEndDate: '2025-02-28',
      earningsReleaseDate: '2025-04-20',
      sharePrice: 74.25,
      sharesOnIssue: 333000000,
      marketCap: 24700000000,
    },
  ];

  return buildDashboardPayload({
    identifier: 'IRFY',
    companyName: 'Irregular Fiscal Years Ltd.',
    prices,
    annualMetrics,
    ...overrides,
  });
}


function createDeferredResponse() {
  let resolveResponse;

  const responsePromise = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  return {
    resolveResponse,
    responsePromise,
  };
}

// The dashboard uses real DOM measurements from a horizontal scroll region.
// This helper gives the test a controllable viewport so it can simulate panning
// without depending on a full browser layout engine.
async function configureScrollRegion(scrollRegion, clientWidth = 920) {
  let scrollLeftValue = 0;

  Object.defineProperty(scrollRegion, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  });

  Object.defineProperty(scrollRegion, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeftValue,
    set: (value) => {
      scrollLeftValue = value;
    },
  });

  await act(async () => {
    scrollRegion.__sharePriceDashboardPublishMeasurement?.();
    activeResizeObservers.slice().forEach((observer) => {
      observer.notify(scrollRegion);
    });
    fireEvent.scroll(scrollRegion);
    await Promise.resolve();
  });

  await act(async () => {
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    scrollRegion.__sharePriceDashboardPublishMeasurement?.();
    activeResizeObservers.slice().forEach((observer) => {
      observer.notify(scrollRegion);
    });
    fireEvent.scroll(scrollRegion);
  });

  return {
    getScrollLeft: () => scrollLeftValue,
    setScrollLeft: (value) => {
      scrollLeftValue = value;
    },
  };
}

function getLatestPresetScrollLeft({
  latestPresetStartMonth,
  minAvailableMonth,
}) {
  if (!latestPresetStartMonth || !minAvailableMonth) {
    return 0;
  }

  return Math.max(
    getMonthOffset(minAvailableMonth, latestPresetStartMonth) * PRESET_SCROLL_STEP_PX,
    0,
  );
}

function getCloseRangeForMonths(priceRows, startMonth, endMonth) {
  const startDate = `${startMonth}-01`;
  const endDate = `${endMonth}-31`;
  const visibleRows = priceRows.filter((priceRow) => {
    return priceRow.date >= startDate && priceRow.date <= endDate;
  });

  return {
    minClose: Math.min(...visibleRows.map((priceRow) => priceRow.close)),
    maxClose: Math.max(...visibleRows.map((priceRow) => priceRow.close)),
  };
}

// One dashboard action can fan out into mocked API promises, animation-frame
// work, and one extra task turn. This helper gives React and the fake browser
// time to settle after `act(...)` has already started the user-visible work.
async function flushDashboardWork(turnCount = 1) {
  for (let turn = 0; turn < turnCount; turn += 1) {
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });

    await act(async () => {
      await Promise.resolve();
    });
  }
}

// These browser shims make JSDOM look enough like the real browser behavior
// this card depends on. Keeping them together makes preset and metrics tests
// share the same layout rules.
function installDashboardBrowserShims() {
  pendingAnimationFrameHandles = new Set();
  nextAnimationFrameHandle = 1;

  originalRequestAnimationFrame = window.requestAnimationFrame;
  originalCancelAnimationFrame = window.cancelAnimationFrame;
  originalMatchMedia = window.matchMedia;
  originalResizeObserver = global.ResizeObserver;
  originalInnerWidth = window.innerWidth;
  originalInnerHeight = window.innerHeight;
  activeResizeObservers = [];
  matchMediaListenerRegistry = new Map();

  window.matchMedia = (query) => {
    if (!matchMediaListenerRegistry.has(query)) {
      matchMediaListenerRegistry.set(query, new Set());
    }

    const listeners = matchMediaListenerRegistry.get(query);

    const addListener = (listener) => {
      listeners.add(listener);
    };

    const removeListener = (listener) => {
      listeners.delete(listener);
    };

    return {
      get matches() {
        return getMediaQueryMatch(query);
      },
      media: query,
      onchange: null,
      addListener,
      removeListener,
      addEventListener: (eventName, listener) => {
        if (eventName === 'change') {
          addListener(listener);
        }
      },
      removeEventListener: (eventName, listener) => {
        if (eventName === 'change') {
          removeListener(listener);
        }
      },
      dispatchEvent: () => false,
    };
  };

  // `queueMicrotask` is safer than `setTimeout(..., 0)` here because React's
  // `act(...)` drains microtasks as part of the current test step. A timeout-
  // backed rAF would escape into a later task and trigger the very warnings this
  // file is trying to eliminate.
  window.requestAnimationFrame = (callback) => {
    const handle = nextAnimationFrameHandle;
    nextAnimationFrameHandle += 1;
    pendingAnimationFrameHandles.add(handle);

    queueMicrotask(() => {
      if (!pendingAnimationFrameHandles.has(handle)) {
        return;
      }

      pendingAnimationFrameHandles.delete(handle);
      callback(window.performance.now());
    });

    return handle;
  };

  window.cancelAnimationFrame = (handle) => {
    pendingAnimationFrameHandles.delete(handle);
  };

  class MockResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.observedElements = new Set();
      activeResizeObservers.push(this);
    }

    observe = (element) => {
      this.observedElements.add(element);
    };

    unobserve = (element) => {
      this.observedElements.delete(element);
    };

    disconnect = () => {
      this.observedElements.clear();
      activeResizeObservers = activeResizeObservers.filter((observer) => observer !== this);
    };

    notify = (element) => {
      if (!this.observedElements.has(element)) {
        return;
      }

      this.callback([
        {
          target: element,
          contentRect: {
            width: element.clientWidth,
            height: 0,
          },
        },
      ]);
    };
  }

  global.ResizeObserver = MockResizeObserver;
  window.ResizeObserver = MockResizeObserver;
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
}

// Cleanup matters just as much as setup. If one test leaves custom browser
// shims behind, the next test can fail for the wrong reason because of shared state.
function restoreDashboardBrowserShims() {
  if (mountedRoot) {
    act(() => {
      mountedRoot.unmount();
    });
    mountedRoot = null;
  }

  if (mountedContainer) {
    mountedContainer.remove();
    mountedContainer = null;
  }

  pendingAnimationFrameHandles.clear();

  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
  window.matchMedia = originalMatchMedia;
  global.ResizeObserver = originalResizeObserver;
  window.ResizeObserver = originalResizeObserver;
  setWindowViewportSize({
    width: originalInnerWidth,
    height: originalInnerHeight,
  });
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  vi.restoreAllMocks();
  currentMatchMediaWidth = 1024;
  activeResizeObservers = [];
  matchMediaListenerRegistry = new Map();
}

// This file still uses `createRoot` because the RTL React 19 path hangs for
// this component stack in this environment. Even here, mount and rerender work
// still belongs inside `act(...)` so React can flush user-visible state safely.
function mountDashboard(ui) {
  mountedContainer = document.createElement('div');
  document.body.appendChild(mountedContainer);
  mountedRoot = createRoot(mountedContainer);

  act(() => {
    mountedRoot.render(ui);
  });

  return {
    rerender(nextUi) {
      act(() => {
        mountedRoot.render(nextUi);
      });
    },
  };
}

// This shared helper keeps setup in one place so each test can focus on one
// user-facing behavior.
async function renderDashboard(options = {}) {
  const {
    dashboardProps = {},
    identifier = 'AAPL',
    isRemovable = false,
    name = `${identifier} name`,
    payload = buildDashboardPayload(),
    payloadSequence = null,
  } = options;

  const deferredResponse = createDeferredResponse();
  const queuedPayloads = Array.isArray(payloadSequence) && payloadSequence.length > 0
    ? payloadSequence
    : [payload];
  let fetchCallCount = 0;

  // Releasing the API response after mount keeps the async data load separate
  // from the initial render, which makes the component test much more stable.
  fetchDashboardData.mockImplementation(() => {
    const nextPayload = queuedPayloads[Math.min(fetchCallCount, queuedPayloads.length - 1)];
    fetchCallCount += 1;

    if (fetchCallCount === 1) {
      return deferredResponse.responsePromise;
    }

    return Promise.resolve(nextPayload);
  });

  const user = userEvent.setup();

  const renderResult = mountDashboard(
    <SharePriceDashboard
      identifier={identifier}
      isRemovable={isRemovable}
      name={name}
      scaleAnimationDurationMs={0}
      {...dashboardProps}
    />,
  );
  const mountedQueries = within(mountedContainer);

  await act(async () => {
    deferredResponse.resolveResponse(queuedPayloads[0]);
    await deferredResponse.responsePromise;
    await Promise.resolve();
  });

  await flushDashboardWork();

  const startInput = mountedQueries.getAllByLabelText('Start month')[0];
  const endInput = mountedQueries.getAllByLabelText('End month')[0];

  const scrollRegion = mountedQueries.getByTestId(DASHBOARD_TEST_ID);
  const scrollController = await configureScrollRegion(scrollRegion);
  const minAvailableMonth = getMonthStringFromDate(payload.prices?.[0]?.date);

  await flushDashboardWork();
  await flushDashboardWork();

  return {
    endInput,
    minAvailableMonth,
    renderResult,
    scrollController,
    scrollRegion,
    startInput,
    user,
  };
}

async function dragPresetWindowOlderByMonths({
  scrollRegion,
  scrollController,
  monthCount = 1,
}) {
  const nextScrollLeft = scrollController.getScrollLeft() - (monthCount * PRESET_SCROLL_STEP_PX);

  await act(async () => {
    scrollController.setScrollLeft(nextScrollLeft);
    scrollRegion.__sharePriceDashboardPublishMeasurement?.();
    fireEvent.scroll(scrollRegion);
  });

  await flushDashboardWork();
  await flushDashboardWork();
}

// Many metrics tests need to point at one specific overrideable detail cell.
// This helper keeps that lookup in one place so each test can talk about the
// user-visible behavior it is protecting instead of repeating DOM plumbing.
function getOverrideableMetricCell({
  rowKey = '710::annualData[].forecastData.fy1.ebit',
  columnKey = 'annual-2025',
} = {}) {
  return screen.getAllByTestId('share-price-dashboard-metric-cell').find((cellNode) => {
    return (
      cellNode.getAttribute('data-row-key') === rowKey
      && cellNode.getAttribute('data-column-key') === columnKey
    );
  });
}

function getDashboardTableCell({
  rowKey,
  columnKey,
} = {}) {
  return screen.getAllByTestId('share-price-dashboard-metric-cell').find((cellNode) => {
    return (
      cellNode.getAttribute('data-row-key') === rowKey
      && cellNode.getAttribute('data-column-key') === columnKey
    );
  });
}

function getMainTableRow(rowLabel) {
  return screen.getByText(rowLabel).parentElement?.parentElement;
}

function getMainTableRowLeftRail(rowKey = 'main::annualData[].base.sharePrice') {
  return screen.getAllByTestId('share-price-dashboard-main-table-row-left-rail').find((rowNode) => {
    return rowNode.getAttribute('data-row-key') === rowKey;
  });
}

function getMainTableCell({
  rowKey,
  columnKey,
} = {}) {
  return screen.getAllByTestId('share-price-dashboard-main-table-cell').find((cellNode) => {
    return (
      cellNode.getAttribute('data-row-key') === rowKey
      && cellNode.getAttribute('data-column-key') === columnKey
    );
  });
}

// Row-hiding now belongs to the frozen left rail instead of the annual-value
// cells or a separate button. This helper keeps the row-label lookup readable.
function getMetricRowLeftRail(rowKey = '710::annualData[].forecastData.fy1.ebit') {
  return screen.getAllByTestId('share-price-dashboard-metric-row-left-rail').find((rowNode) => {
    return rowNode.getAttribute('data-row-key') === rowKey;
  });
}

function getMetricRowValuesSurface(rowKey = '710::annualData[].forecastData.fy1.ebit') {
  return screen.getAllByTestId('share-price-dashboard-metric-row-values').find((rowNode) => {
    return rowNode.getAttribute('data-row-key') === rowKey;
  });
}

// Section-boundary regressions are easiest to reason about by row key instead
// of DOM order. This helper collects the visible section starts the user can
// actually see, then lets each test assert the full-width divider contract.
function getVisibleSectionStartContracts() {
  return screen.getAllByTestId('share-price-dashboard-metric-row')
    .filter((rowNode) => rowNode.getAttribute('data-section-start') === 'true')
    .map((rowNode) => {
      const rowKey = rowNode.getAttribute('data-row-key');

      return {
        rowKey,
        leftRail: getMetricRowLeftRail(rowKey),
        valuesSurface: getMetricRowValuesSurface(rowKey),
      };
    });
}

function getActWarningCalls(consoleErrorSpy) {
  return consoleErrorSpy.mock.calls.filter((call) => {
    return call.some((value) => {
      const text = String(value);
      return (
        text.includes('An update to Root inside a test was not wrapped in act(...)')
        || text.includes('An update to SharePriceDashboard inside a test was not wrapped in act(...)')
      );
    });
  });
}

function expectNoActWarnings(consoleErrorSpy) {
  expect(getActWarningCalls(consoleErrorSpy)).toHaveLength(0);
}

// Each `it(...)` block below describes one user-facing preset-scroll scenario.
// Together they protect the first-load scrollbar position and the month-range
// updates that should happen when a user drags through history.
describe('SharePriceDashboard preset scrolling', () => {
  beforeEach(() => {
    fetchDashboardData.mockReset();
    fetchDashboardMetricsView.mockReset();
    updateDashboardMetricOverride.mockReset();
    updateDashboardInvestmentCategory.mockReset();
    updateDashboardRowPreference.mockReset();
    updateDashboardInvestmentCategory.mockResolvedValue({
      identifier: 'AAPL',
      investmentCategory: 'Mature Compounder',
    });
    installDashboardBrowserShims();
  });

  afterEach(() => {
    restoreDashboardBrowserShims();
  });

  // A test can "pass" and still print `act(...)` warnings to stderr. That is
  // still a real problem because React is telling us some updates escaped the
  // normal test lifecycle. Those escaped updates are often the first clue that a
  // future refactor will become flaky, hang, or start failing only sometimes.
  //
  // We spy on `console.error` narrowly instead of muting it entirely so the test
  // only fails on the specific warning text we care about.
  describe('SharePriceDashboard act warning regressions', () => {
    it('does not emit act warnings during the default dashboard mount and first load', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        // Phase 1: mount the default dashboard and release the first mocked API
        // response through the same helper most of this file already uses.
        const {
          endInput,
          startInput,
        } = await renderDashboard();

        // Phase 2: confirm the user-visible dashboard state really finished
        // loading instead of only asserting on the absence of warnings.
        expect(startInput.value).toBe('2020-12');
        expect(endInput.value).toBe('2025-12');
        expect(screen.getByText('AAPL name')).toBeTruthy();

        // Phase 3: once the UI is settled, the test should have captured no
        // "update was not wrapped in act(...)" warnings.
        expectNoActWarnings(consoleErrorSpy);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  it('renders the dashboard smoke test without hanging', async () => {
    const {
      endInput,
      startInput,
    } = await renderDashboard();

    expect(screen.getByText('AAPL name')).toBeTruthy();
    expect(startInput.value).toBe('2020-12');
    expect(endInput.value).toBe('2025-12');
  });

  it('does not log a maximum update depth error when rerendered with the same mounted scroll region', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { renderResult } = await renderDashboard();

      renderResult.rerender(
        <SharePriceDashboard
          identifier="AAPL"
          name="AAPL name"
          scaleAnimationDurationMs={0}
        />,
      );
      await flushDashboardWork();
      await flushDashboardWork();

      const maximumDepthErrors = consoleErrorSpy.mock.calls.filter((call) => {
        return call.some((value) => String(value).includes('Maximum update depth exceeded'));
      });

      expect(maximumDepthErrors).toHaveLength(0);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('does not log a maximum update depth error while scrolling the mounted scroll region', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await renderDashboard();

      const scrollRegion = screen.getByTestId(DASHBOARD_TEST_ID);
      await configureScrollRegion(scrollRegion, 920);

      await act(async () => {
        scrollRegion.scrollLeft = 168;
        fireEvent.scroll(scrollRegion);
      });
      await flushDashboardWork();
      await flushDashboardWork();

      const maximumDepthErrors = consoleErrorSpy.mock.calls.filter((call) => {
        return call.some((value) => String(value).includes('Maximum update depth exceeded'));
      });

      expect(maximumDepthErrors).toHaveLength(0);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('does not log a maximum update depth error when resize observers publish the same measurement repeatedly', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await renderDashboard();

      const scrollRegion = screen.getByTestId(DASHBOARD_TEST_ID);
      await configureScrollRegion(scrollRegion, 920);

      await act(async () => {
        activeResizeObservers.slice().forEach((observer) => {
          observer.notify(scrollRegion);
          observer.notify(scrollRegion);
          observer.notify(scrollRegion);
        });
      });
      await flushDashboardWork();
      await flushDashboardWork();

      const maximumDepthErrors = consoleErrorSpy.mock.calls.filter((call) => {
        return call.some((value) => String(value).includes('Maximum update depth exceeded'));
      });

      expect(maximumDepthErrors).toHaveLength(0);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('does not log a maximum update depth error when a media-query change fires', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      setViewportWidth(1024);
      await renderDashboard();

      await setViewportWidthAndDispatch(480);
      await flushDashboardWork();
      await flushDashboardWork();

      const maximumDepthErrors = consoleErrorSpy.mock.calls.filter((call) => {
        return call.some((value) => String(value).includes('Maximum update depth exceeded'));
      });

      expect(maximumDepthErrors).toHaveLength(0);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('does not mount the month inputs until a loaded month range exists', async () => {
    const deferredResponse = createDeferredResponse();

    fetchDashboardData.mockImplementation(() => deferredResponse.responsePromise);

    mountDashboard(
      <SharePriceDashboard
        identifier="AAPL"
        name="AAPL name"
        scaleAnimationDurationMs={0}
      />,
    );

    const mountedQueries = within(mountedContainer);

    expect(mountedQueries.queryByLabelText('Start month')).toBeNull();
    expect(mountedQueries.queryByLabelText('End month')).toBeNull();
    expect(mountedQueries.getByTestId('share-price-dashboard-month-controls-placeholder')).toBeTruthy();

    await act(async () => {
      deferredResponse.resolveResponse(buildDashboardPayload());
      await deferredResponse.responsePromise;
      await Promise.resolve();
    });

    await flushDashboardWork();

    expect(mountedQueries.getByLabelText('Start month')).toBeTruthy();
    expect(mountedQueries.getByLabelText('End month')).toBeTruthy();
  });

  it('does not log a maximum update depth error when the dashboard remounts after unmounting', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await renderDashboard();

      if (mountedRoot) {
        act(() => {
          mountedRoot.unmount();
        });
        mountedRoot = null;
      }

      if (mountedContainer) {
        mountedContainer.remove();
        mountedContainer = null;
      }

      await renderDashboard();

      const maximumDepthErrors = consoleErrorSpy.mock.calls.filter((call) => {
        return call.some((value) => String(value).includes('Maximum update depth exceeded'));
      });

      expect(maximumDepthErrors).toHaveLength(0);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('renders more than three Y-axis gridlines while keeping labels readable', async () => {
    const payload = buildDashboardPayload();
    await renderDashboard({ payload });

    const gridlines = screen.getAllByTestId('share-price-dashboard-y-gridline');
    const labels = screen.getAllByTestId('share-price-dashboard-y-axis-label');
    const { minClose, maxClose } = getCloseRangeForMonths(payload.prices, '2020-12', '2025-12');
    const expectedScale = buildRoundedChartScale(minClose, maxClose, {
      preferredTickCount: getPreferredTickCount(240),
    });
    const expectedLabelTexts = expectedScale.ticks.map((tickValue) => {
      return formatYAxisPrice(tickValue, expectedScale.ticks);
    });
    const renderedLabelTexts = labels.map((labelNode) => labelNode.textContent);

    expect(gridlines.length).toBeGreaterThan(3);
    expect(gridlines.length).toBe(expectedScale.ticks.length);
    expect(labels.length).toBeLessThanOrEqual(gridlines.length);
    expect(renderedLabelTexts).toContain(expectedLabelTexts[0]);
    expect(renderedLabelTexts).toContain(expectedLabelTexts[expectedLabelTexts.length - 1]);
    renderedLabelTexts.forEach((labelText) => {
      expect(expectedLabelTexts).toContain(labelText);
    });
  });

  it('drops decimals from 3-digit plain main-table, Y-axis, and hover values while preserving smaller values', async () => {
    const payload = buildPlainValueBoundaryDashboardPayload();
    const { scrollRegion } = await renderDashboard({ payload });
    const sharePriceRow = getMainTableRow('Share price');

    expect(sharePriceRow).toBeTruthy();
    expect(within(sharePriceRow).getByText('99.75')).toBeTruthy();
    expect(within(sharePriceRow).getByText('100')).toBeTruthy();
    expect(within(sharePriceRow).queryByText('100.25')).toBeNull();

    const renderedLabelTexts = screen.getAllByTestId('share-price-dashboard-y-axis-label').map((labelNode) => labelNode.textContent);
    const renderedLabelsAtOrAboveHundred = renderedLabelTexts.filter((labelText) => {
      const numericPortion = Number(String(labelText).replace(/,/g, ''));
      return Number.isFinite(numericPortion) && numericPortion >= 100;
    });

    expect(renderedLabelsAtOrAboveHundred.length).toBeGreaterThan(0);
    renderedLabelsAtOrAboveHundred.forEach((labelText) => {
      expect(labelText.includes('.')).toBe(false);
    });

    const svg = scrollRegion.querySelector('svg');
    expect(svg).toBeTruthy();

    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: Number(scrollRegion.getAttribute('data-content-width')),
        height: 280,
        right: Number(scrollRegion.getAttribute('data-content-width')),
        bottom: 280,
      }),
    });

    await act(async () => {
      fireEvent.mouseMove(svg, { clientX: 1, clientY: 140 });
    });
    await flushDashboardWork();

    expect(within(svg).getByText('99.75')).toBeTruthy();

    await act(async () => {
      fireEvent.mouseMove(svg, {
        clientX: 180,
        clientY: 140,
      });
    });
    await flushDashboardWork();

    expect(within(svg).getByText('100')).toBeTruthy();
    expect(within(svg).queryByText('100.25')).toBeNull();
  });

  it('keeps the shared hover tooltip fully inside the stock chart near both x-axis edges', async () => {
    const payload = buildPlainValueBoundaryDashboardPayload();
    const { scrollRegion } = await renderDashboard({ payload });
    const svg = scrollRegion.querySelector('svg');
    const contentWidth = Number(scrollRegion.getAttribute('data-content-width'));
    const plotWidth = Number(scrollRegion.getAttribute('data-plot-width'));

    expect(svg).toBeTruthy();

    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: contentWidth,
        height: 280,
        right: contentWidth,
        bottom: 280,
      }),
    });

    // This protects the clipping regression specifically. The hover still needs
    // to show the right data, but the box and both text lines now have to stay
    // inside the visible chart when the pointer hugs either edge.
    await act(async () => {
      fireEvent.mouseMove(svg, { clientX: 1, clientY: 140 });
    });
    await flushDashboardWork();

    const leftHoverBox = within(svg).getByTestId('time-series-chart-hover-box');
    const leftHoverLabel = within(svg).getByTestId('time-series-chart-hover-label');
    const leftHoverValue = within(svg).getByTestId('time-series-chart-hover-value');
    const leftBoxX = Number(leftHoverBox.getAttribute('x'));
    const leftBoxWidth = Number(leftHoverBox.getAttribute('width'));
    const leftLabelX = Number(leftHoverLabel.getAttribute('x'));
    const leftValueX = Number(leftHoverValue.getAttribute('x'));

    expect(leftHoverValue.textContent).toBe('99.75');
    expect(leftHoverLabel.textContent).toBeTruthy();
    expect(leftBoxX).toBeGreaterThanOrEqual(0);
    expect(leftBoxX + leftBoxWidth).toBeLessThanOrEqual(plotWidth);
    expect(leftLabelX).toBeGreaterThanOrEqual(leftBoxX);
    expect(leftLabelX).toBeLessThanOrEqual(leftBoxX + leftBoxWidth);
    expect(leftValueX).toBeGreaterThanOrEqual(leftBoxX);
    expect(leftValueX).toBeLessThanOrEqual(leftBoxX + leftBoxWidth);

    await act(async () => {
      fireEvent.mouseMove(svg, { clientX: plotWidth - 1, clientY: 140 });
    });
    await flushDashboardWork();

    const rightHoverBox = within(svg).getByTestId('time-series-chart-hover-box');
    const rightHoverLabel = within(svg).getByTestId('time-series-chart-hover-label');
    const rightHoverValue = within(svg).getByTestId('time-series-chart-hover-value');
    const rightBoxX = Number(rightHoverBox.getAttribute('x'));
    const rightBoxWidth = Number(rightHoverBox.getAttribute('width'));
    const rightLabelX = Number(rightHoverLabel.getAttribute('x'));
    const rightValueX = Number(rightHoverValue.getAttribute('x'));

    expect(rightHoverValue.textContent).toBe('101');
    expect(rightHoverLabel.textContent).toBeTruthy();
    expect(rightBoxX).toBeGreaterThanOrEqual(0);
    expect(rightBoxX + rightBoxWidth).toBeLessThanOrEqual(plotWidth);
    expect(rightLabelX).toBeGreaterThanOrEqual(rightBoxX);
    expect(rightLabelX).toBeLessThanOrEqual(rightBoxX + rightBoxWidth);
    expect(rightValueX).toBeGreaterThanOrEqual(rightBoxX);
    expect(rightValueX).toBeLessThanOrEqual(rightBoxX + rightBoxWidth);
  });

  it('uses full sticky rail labels on wider screens', async () => {
    setViewportWidth(1024);

    await renderDashboard();

    expect(screen.getByText('FY end date')).toBeTruthy();
    expect(screen.getByText('FY')).toBeTruthy();
    expect(screen.getByText('FY release date')).toBeTruthy();
    expect(screen.getByText('Share price')).toBeTruthy();
    expect(screen.getByText('Shares on issue')).toBeTruthy();
    expect(screen.getByText('Market cap')).toBeTruthy();
    expect(screen.queryByText('ROIC')).toBeNull();
  });

  it('keeps the full-label left rail tight on wide screens while preserving the longest label', async () => {
    setViewportWidth(1440);

    await renderDashboard();

    const scrollRegion = screen.getByTestId('share-price-dashboard-scroll-region');

    expect(screen.getByText('FY release date')).toBeTruthy();
    expect(screen.getByText('Shares on issue')).toBeTruthy();
    expect(Number(scrollRegion.getAttribute('data-left-rail-width'))).toBeLessThan(220);
    expect(Number(scrollRegion.getAttribute('data-left-rail-width'))).toBeGreaterThanOrEqual(120);
  });

  it('uses short sticky rail labels on narrow screens while keeping the full label as metadata', async () => {
    setViewportWidth(480);

    await renderDashboard();

    expect(screen.getByText('FY END')).toBeTruthy();
    expect(screen.getByText('FY')).toBeTruthy();
    expect(screen.getByText('FY release')).toBeTruthy();
    expect(screen.getByText('SP')).toBeTruthy();
    expect(screen.getByText('SOI')).toBeTruthy();
    expect(screen.getByText('Mkt Cap')).toBeTruthy();
    expect(screen.queryByText('ROIC')).toBeNull();

    const sharePriceRailLabel = screen.getByText('SP');
    expect(sharePriceRailLabel.getAttribute('title')).toBe('Share price');
    expect(sharePriceRailLabel.getAttribute('aria-label')).toBe('Share price');
  });

  it('updates sticky rail labels when the media-query match changes after mount', async () => {
    setViewportWidth(1024);

    await renderDashboard();

    expect(screen.getByText('Share price')).toBeTruthy();
    expect(screen.queryByText('SP')).toBeNull();

    await setViewportWidthAndDispatch(480);
    await flushDashboardWork();

    expect(screen.queryByText('Share price')).toBeNull();
    expect(screen.getByText('SP')).toBeTruthy();
    expect(screen.getByText('FY END')).toBeTruthy();
  });

  it('keeps the smaller Remove stock action above the Stock heading and separate from the investment category row', async () => {
    setViewportWidth(420);

    const { user } = await renderDashboard({ isRemovable: true });

    const categorySelect = screen.getByLabelText('Investment Category');
    const removeStockButton = screen.getByRole('button', { name: 'Remove stock' });
    const investmentCategoryRow = screen.getByTestId('share-price-dashboard-investment-category-row');
    const removeStockRow = screen.getByTestId('share-price-dashboard-remove-stock-row');
    const stockHeading = screen.getByText('Stock');

    expect(categorySelect.value).toBe('Profitable Hi Growth');
    expect(removeStockButton).toBeTruthy();
    expect(within(removeStockRow).getByRole('button', { name: 'Remove stock' })).toBe(removeStockButton);
    expect(within(investmentCategoryRow).queryByRole('button', { name: 'Remove stock' })).toBeNull();
    expect(removeStockButton.textContent).toBe('Remove stock');
    expect(removeStockRow.compareDocumentPosition(stockHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.selectOptions(categorySelect, 'Mature Compounder');
    await flushDashboardWork();

    expect(updateDashboardInvestmentCategory).toHaveBeenCalledWith('AAPL', 'Mature Compounder');
    expect(categorySelect.value).toBe('Mature Compounder');
  });

  it('keeps preset annual columns readable on very narrow scroll widths', async () => {
    setViewportWidth(480);

    const {
      endInput,
      scrollRegion,
      startInput,
      user,
    } = await renderDashboard();

    await configureScrollRegion(scrollRegion, 240);
    await flushDashboardWork();

    await user.click(screen.getByRole('button', { name: '10Y' }));
    await flushDashboardWork();

    expect(startInput.value).toBe('2015-12');
    expect(endInput.value).toBe('2025-12');
    expect(scrollRegion.getAttribute('data-scroll-mode')).toBe('preset');
    expect(Number(scrollRegion.getAttribute('data-year-cell-width'))).toBeGreaterThanOrEqual(48);
    expect(Number(scrollRegion.getAttribute('data-content-width'))).toBeGreaterThanOrEqual((11 * 48) + 24);
    expect(Number(scrollRegion.getAttribute('data-scroll-surface-width'))).toBeGreaterThan(240);
  });

  it('centers each fiscal-year tick on the matching visible table column', async () => {
    setViewportWidth(1024);

    const { user } = await renderDashboard();

    await user.click(screen.getByRole('button', { name: '10Y' }));
    await flushDashboardWork();

    const fiscalTicks = screen.getAllByTestId('share-price-dashboard-fiscal-tick');
    const headerCells = screen.getAllByTestId('share-price-dashboard-header-cell');

    expect(fiscalTicks).toHaveLength(headerCells.length);

    fiscalTicks.forEach((tickNode, index) => {
      expect(tickNode.getAttribute('data-fiscal-year')).toBe(headerCells[index].getAttribute('data-fiscal-year'));
      expect(Number(tickNode.getAttribute('data-x'))).toBeCloseTo(
        Number(headerCells[index].getAttribute('data-center-x')),
        6,
      );
    });
  });

  it('maps each fixed column center to the FY release date while keeping the fiscal tick aligned', async () => {
    setViewportWidth(1024);

    const { user } = await renderDashboard({
      payload: buildIrregularFiscalYearDashboardPayload(),
    });

    await user.click(screen.getByRole('button', { name: 'MAX' }));
    await flushDashboardWork();

    const scrollRegion = screen.getByTestId('share-price-dashboard-scroll-region');
    const svg = scrollRegion.querySelector('svg');
    const fiscalTicks = screen.getAllByTestId('share-price-dashboard-fiscal-tick');
    const headerCells = screen.getAllByTestId('share-price-dashboard-header-cell');
    const targetHeaderCell = headerCells.find((cellNode) => cellNode.getAttribute('data-fiscal-year') === '2023');
    const targetTick = fiscalTicks.find((tickNode) => tickNode.getAttribute('data-fiscal-year') === '2023');

    expect(svg).toBeTruthy();
    expect(targetHeaderCell).toBeTruthy();
    expect(targetTick).toBeTruthy();

    const targetX = Number(targetHeaderCell.getAttribute('data-center-x'));

    expect(Number(targetTick.getAttribute('data-x'))).toBeCloseTo(targetX, 6);

    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: Number(scrollRegion.getAttribute('data-content-width')),
        height: 280,
        right: Number(scrollRegion.getAttribute('data-content-width')),
        bottom: 280,
      }),
    });

    await act(async () => {
      fireEvent.mouseMove(svg, { clientX: targetX, clientY: 140 });
    });

    expect(screen.getByText('Jun 1, 2023')).toBeTruthy();
    expect(screen.queryByText('Apr 1, 2023')).toBeNull();
  });

  it('renders chart-only fiscal-year bands aligned with the visible table columns', async () => {
    setViewportWidth(1024);

    const payload = buildDashboardPayload();
    const { user } = await renderDashboard({ payload });

    await user.click(screen.getByRole('button', { name: '10Y' }));
    await flushDashboardWork();

    const scrollRegion = screen.getByTestId('share-price-dashboard-scroll-region');
    const fiscalBands = screen.getAllByTestId('share-price-dashboard-fiscal-band');
    const headerCells = screen.getAllByTestId('share-price-dashboard-header-cell');
    const visibleFiscalYears = headerCells.map((cellNode) => Number(cellNode.getAttribute('data-fiscal-year')));
    const visibleAnnualMetrics = payload.annualMetrics.filter((annualRow) => visibleFiscalYears.includes(annualRow.fiscalYear));
    const visiblePrices = payload.prices.filter((priceRow) => {
      return priceRow.date >= '2015-12-01' && priceRow.date <= '2025-12-31';
    });
    const expectedBoundaries = buildExpectedFiscalYearBoundaryPositions({
      annualMetrics: visibleAnnualMetrics,
      prices: visiblePrices,
      headerCells,
      plotWidth: Number(scrollRegion.getAttribute('data-plot-width')),
    });

    expect(fiscalBands).toHaveLength(headerCells.length);

    fiscalBands.forEach((bandNode, index) => {
      expect(bandNode.getAttribute('data-fiscal-year')).toBe(headerCells[index].getAttribute('data-fiscal-year'));

      const startX = Number(bandNode.getAttribute('data-start-x'));
      const width = Number(bandNode.getAttribute('data-width'));
      const expectedBoundary = expectedBoundaries[index];

      expect(width).toBeGreaterThan(0);
      expect(startX).toBeCloseTo(expectedBoundary.startX, 6);
      expect(startX + width).toBeCloseTo(expectedBoundary.endX, 6);
    });

    expect(fiscalBands.some((bandNode) => bandNode.getAttribute('data-is-alternate') === 'true')).toBe(true);
    expect(fiscalBands.some((bandNode) => bandNode.getAttribute('data-is-alternate') === 'false')).toBe(true);
  });

  it('anchors each irregular fiscal-year band to the previous and current fiscal year-end ticks', async () => {
    setViewportWidth(1024);

    const { user } = await renderDashboard({
      payload: buildIrregularFiscalYearDashboardPayload(),
    });

    await user.click(screen.getByRole('button', { name: 'MAX' }));
    await flushDashboardWork();

    const fiscalBands = screen.getAllByTestId('share-price-dashboard-fiscal-band');
    const headerCells = screen.getAllByTestId('share-price-dashboard-header-cell');
    const payload = buildIrregularFiscalYearDashboardPayload();
    const expectedBoundaries = buildExpectedFiscalYearBoundaryPositions({
      annualMetrics: payload.annualMetrics,
      prices: payload.prices,
      headerCells,
      plotWidth: Number(screen.getByTestId('share-price-dashboard-scroll-region').getAttribute('data-plot-width')),
    });

    expect(fiscalBands.map((bandNode) => bandNode.getAttribute('data-fiscal-year'))).toEqual([
      '2022',
      '2023',
      '2024',
      '2025',
    ]);

    fiscalBands.forEach((bandNode, index) => {
      const expectedBoundary = expectedBoundaries[index];

      expect(Number(bandNode.getAttribute('data-start-x'))).toBeCloseTo(expectedBoundary.startX, 6);
      expect(
        Number(bandNode.getAttribute('data-start-x')) + Number(bandNode.getAttribute('data-width')),
      ).toBeCloseTo(expectedBoundary.endX, 6);
    });
  });

  it('reveals the matching FY watermark when hovering a chart band and clears it on leave', async () => {
    setViewportWidth(1024);

    const { user } = await renderDashboard();

    await user.click(screen.getByRole('button', { name: '10Y' }));
    await flushDashboardWork();

    const scrollRegion = screen.getByTestId('share-price-dashboard-scroll-region');
    const svg = scrollRegion.querySelector('svg');
    const fiscalBands = screen.getAllByTestId('share-price-dashboard-fiscal-band');

    expect(svg).toBeTruthy();

    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: Number(scrollRegion.getAttribute('data-content-width')),
        height: 280,
        right: Number(scrollRegion.getAttribute('data-content-width')),
        bottom: 280,
      }),
    });

    const targetBand = fiscalBands[2];
    const targetX = Number(targetBand.getAttribute('data-center-x'));

    await act(async () => {
      fireEvent.mouseMove(svg, { clientX: targetX, clientY: 140 });
    });

    const watermark = screen.getByTestId('share-price-dashboard-fiscal-watermark');
    expect(watermark.textContent).toBe(`FY ${targetBand.getAttribute('data-fiscal-year')}`);
    expect(watermark.getAttribute('opacity')).toBe('0.9');
    expect(watermark.getAttribute('fill')).toBe('#dc2626');
    expect(watermark.getAttribute('font-size')).toBe('16');
    expect(watermark.getAttribute('stroke')).toBe('rgba(255, 255, 255, 0.95)');
    expect(watermark.getAttribute('stroke-width')).toBe('2');
    expect(Number(watermark.getAttribute('y'))).toBeCloseTo(248, 6);

    await act(async () => {
      fireEvent.mouseLeave(svg);
    });

    expect(screen.queryByTestId('share-price-dashboard-fiscal-watermark')).toBeNull();
  });

  it('reveals the matching FY watermark on mobile long press and clears it on touch end', async () => {
    setViewportWidth(480);

    const { user } = await renderDashboard();

    await user.click(screen.getByRole('button', { name: '10Y' }));
    await flushDashboardWork();

    const scrollRegion = screen.getByTestId('share-price-dashboard-scroll-region');
    const svg = scrollRegion.querySelector('svg');
    const fiscalBands = screen.getAllByTestId('share-price-dashboard-fiscal-band');

    expect(svg).toBeTruthy();

    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: Number(scrollRegion.getAttribute('data-content-width')),
        height: 280,
        right: Number(scrollRegion.getAttribute('data-content-width')),
        bottom: 280,
      }),
    });

    const targetBand = fiscalBands[1];
    const targetX = Number(targetBand.getAttribute('data-center-x'));

    vi.useFakeTimers();

    try {
      await act(async () => {
        fireEvent.touchStart(svg, {
          touches: [{ clientX: targetX, clientY: 140 }],
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(450);
      });

      const watermark = screen.getByTestId('share-price-dashboard-fiscal-watermark');
      expect(watermark.textContent).toBe(`FY ${targetBand.getAttribute('data-fiscal-year')}`);

      await act(async () => {
        fireEvent.touchEnd(svg, { touches: [] });
      });

      expect(screen.queryByTestId('share-price-dashboard-fiscal-watermark')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses fiscal year-end anchors as the hover boundary for irregular fiscal year ends', async () => {
    setViewportWidth(1024);

    const { user } = await renderDashboard({
      payload: buildIrregularFiscalYearDashboardPayload(),
    });

    await user.click(screen.getByRole('button', { name: 'MAX' }));
    await flushDashboardWork();

    const scrollRegion = screen.getByTestId('share-price-dashboard-scroll-region');
    const svg = scrollRegion.querySelector('svg');
    const fiscalBands = screen.getAllByTestId('share-price-dashboard-fiscal-band');

    expect(svg).toBeTruthy();

    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: Number(scrollRegion.getAttribute('data-content-width')),
        height: 280,
        right: Number(scrollRegion.getAttribute('data-content-width')),
        bottom: 280,
      }),
    });

    const boundaryBand = fiscalBands.find((bandNode) => bandNode.getAttribute('data-fiscal-year') === '2024');
    expect(boundaryBand).toBeTruthy();

    const boundaryX = Number(boundaryBand.getAttribute('data-start-x')) + Number(boundaryBand.getAttribute('data-width'));

    await act(async () => {
      fireEvent.mouseMove(svg, { clientX: boundaryX - 2, clientY: 140 });
    });

    expect(screen.getByTestId('share-price-dashboard-fiscal-watermark').textContent).toBe('FY 2024');

    await act(async () => {
      fireEvent.mouseMove(svg, { clientX: boundaryX + 2, clientY: 140 });
    });

    expect(screen.getByTestId('share-price-dashboard-fiscal-watermark').textContent).toBe('FY 2025');
  });

  it('lets the default 5Y preset pan immediately on first load', async () => {
    const {
      endInput,
      minAvailableMonth,
      scrollController,
      startInput,
    } = await renderDashboard();

    expect(scrollController.getScrollLeft()).toBe(getLatestPresetScrollLeft({
      latestPresetStartMonth: '2020-12',
      minAvailableMonth,
    }));

    await dragPresetWindowOlderByMonths({
      scrollRegion: screen.getByTestId(DASHBOARD_TEST_ID),
      scrollController,
      monthCount: 2,
    });

    expect(startInput.value).toBe('2020-10');
    expect(endInput.value).toBe('2025-10');
  });

  it('allows every fixed-length preset to pan as soon as it is selected', async () => {
    const {
      endInput,
      minAvailableMonth,
      scrollController,
      scrollRegion,
      startInput,
      user,
    } = await renderDashboard();

    const presetExpectations = [
      { label: '1M', latestStart: '2025-11' },
      { label: '6M', latestStart: '2025-06' },
      { label: '1Y', latestStart: '2024-12' },
      { label: '3Y', latestStart: '2022-12' },
      { label: '5Y', latestStart: '2020-12' },
      { label: '10Y', latestStart: '2015-12' },
    ];

    for (const preset of presetExpectations) {
      await user.click(screen.getByRole('button', { name: preset.label }));
      await flushDashboardWork();

      expect(startInput.value).toBe(preset.latestStart);
      expect(endInput.value).toBe('2025-12');
      expect(scrollController.getScrollLeft()).toBe(getLatestPresetScrollLeft({
        latestPresetStartMonth: preset.latestStart,
        minAvailableMonth,
      }));

      await dragPresetWindowOlderByMonths({
        scrollRegion,
        scrollController,
      });

      expect(startInput.value).toBe(shiftMonthString(preset.latestStart, -1));
      expect(endInput.value).toBe('2025-11');
    }
  }, 15000);

  it('keeps MAX in free-range mode so scroll does not rewrite the month inputs', async () => {
    const {
      endInput,
      minAvailableMonth,
      scrollController,
      scrollRegion,
      startInput,
      user,
    } = await renderDashboard();

    await user.click(screen.getByRole('button', { name: 'MAX' }));
    await flushDashboardWork();

    expect(startInput.value).toBe('2010-01');
    expect(endInput.value).toBe('2025-12');

    await act(async () => {
      scrollController.setScrollLeft(scrollController.getScrollLeft() + 140);
      fireEvent.scroll(scrollRegion);
    });

    await flushDashboardWork();

    expect(startInput.value).toBe('2010-01');
    expect(endInput.value).toBe('2025-12');
  });

  it('shows every available annual column when MAX is selected', async () => {
    const { user } = await renderDashboard();

    await user.click(screen.getByRole('button', { name: 'MAX' }));
    await flushDashboardWork();

    const fiscalYearLabels = screen.getAllByText(/^\d{4}-12$/).map((node) => node.textContent);

    expect(fiscalYearLabels).toHaveLength(16);
    expect(fiscalYearLabels[0]).toBe('2010-12');
    expect(fiscalYearLabels[15]).toBe('2025-12');
  });

  it('shows more than 20 annual columns when MAX is selected for long histories', async () => {
    const { user } = await renderDashboard({
      payload: buildLongHistoryDashboardPayload(),
    });

    await user.click(screen.getByRole('button', { name: 'MAX' }));
    await flushDashboardWork();

    const fiscalYearLabels = screen.getAllByText(/^\d{4}-12$/).map((node) => node.textContent);

    expect(fiscalYearLabels).toHaveLength(36);
    expect(fiscalYearLabels[0]).toBe('1990-12');
    expect(fiscalYearLabels[35]).toBe('2025-12');
  });

  it('makes short-history MAX match the fixed preset layout when the range already collapses to the full history', async () => {
    const {
      endInput,
      scrollController,
      scrollRegion,
      startInput,
      user,
    } = await renderDashboard({
      payload: buildShortHistoryDashboardPayload(),
    });

    const readLayoutMetrics = () => ({
      contentWidth: scrollRegion.getAttribute('data-content-width'),
      plotWidth: scrollRegion.getAttribute('data-plot-width'),
      yearCellWidth: scrollRegion.getAttribute('data-year-cell-width'),
    });
    const readVisibleTickPositions = () => {
      return screen.getAllByTestId('share-price-dashboard-fiscal-tick').map((node) => {
        return node.getAttribute('data-x');
      });
    };

    await user.click(screen.getByRole('button', { name: 'MAX' }));
    await flushDashboardWork();

    expect(startInput.value).toBe('2024-04');
    expect(endInput.value).toBe('2026-04');

    const maxMetrics = readLayoutMetrics();
    const maxTickPositions = readVisibleTickPositions();

    await act(async () => {
      scrollController.setScrollLeft(scrollController.getScrollLeft() + 140);
      fireEvent.scroll(scrollRegion);
    });
    await flushDashboardWork();

    expect(startInput.value).toBe('2024-04');
    expect(endInput.value).toBe('2026-04');

    for (const presetLabel of ['3Y', '5Y', '10Y']) {
      await user.click(screen.getByRole('button', { name: presetLabel }));
      await flushDashboardWork();

      expect(startInput.value).toBe('2024-04');
      expect(endInput.value).toBe('2026-04');
    }

    const fixedPresetMetrics = readLayoutMetrics();
    const fixedPresetTickPositions = readVisibleTickPositions();

    expect(maxMetrics).toEqual(fixedPresetMetrics);
    expect(maxTickPositions).toEqual(fixedPresetTickPositions);
  });

  it('sizes a short-history preset to the real card width on initial render without a window resize', async () => {
    const payload = buildShortHistoryDashboardPayload();
    const deferredResponse = createDeferredResponse();
    const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

    fetchDashboardData.mockImplementation(() => deferredResponse.responsePromise);

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        if (this.getAttribute?.('data-testid') === DASHBOARD_TEST_ID) {
          return 920;
        }

        return originalClientWidthDescriptor?.get
          ? originalClientWidthDescriptor.get.call(this)
          : 0;
      },
    });

    try {
      mountDashboard(
        <SharePriceDashboard
          identifier="RBRK"
          name="Rubrik, Inc."
          scaleAnimationDurationMs={0}
        />,
      );

      await act(async () => {
        deferredResponse.resolveResponse(payload);
        await deferredResponse.responsePromise;
        await Promise.resolve();
      });

      await flushDashboardWork();
      await flushDashboardWork();
      await flushDashboardWork();

      const scrollRegion = screen.getByTestId(DASHBOARD_TEST_ID);
      await act(async () => {
        scrollRegion.__sharePriceDashboardPublishMeasurement?.();
      });
      await flushDashboardWork();
      const leftRailWidth = Number(scrollRegion.getAttribute('data-left-rail-width'));
      const expectedContentWidth = 920 - leftRailWidth;

      expect(scrollRegion.getAttribute('data-scroll-mode')).toBe('preset');
      expect(Number(scrollRegion.getAttribute('data-content-width'))).toBe(expectedContentWidth);
      expect(Number(scrollRegion.getAttribute('data-plot-width'))).toBe(expectedContentWidth - 24);

      await act(async () => {
        window.dispatchEvent(new Event('resize'));
      });
      await flushDashboardWork();

      expect(Number(scrollRegion.getAttribute('data-content-width'))).toBe(expectedContentWidth);
      expect(Number(scrollRegion.getAttribute('data-plot-width'))).toBe(expectedContentWidth - 24);
    } finally {
      if (originalClientWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidthDescriptor);
      } else {
        delete HTMLElement.prototype.clientWidth;
      }
    }
  });

  it('re-measures short-history preset width when timeline content appears after loading', async () => {
    const payload = buildShortHistoryDashboardPayload();
    const deferredResponse = createDeferredResponse();
    const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

    fetchDashboardData.mockImplementation(() => deferredResponse.responsePromise);

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        if (this.getAttribute?.('data-testid') === DASHBOARD_TEST_ID) {
          return 920;
        }

        return originalClientWidthDescriptor?.get
          ? originalClientWidthDescriptor.get.call(this)
          : 0;
      },
    });

    try {
      mountDashboard(
        <SharePriceDashboard
          identifier="RBRK"
          name="Rubrik, Inc."
          scaleAnimationDurationMs={0}
        />,
      );

      expect(screen.queryByTestId(DASHBOARD_TEST_ID)).toBeNull();

      await act(async () => {
        deferredResponse.resolveResponse(payload);
        await deferredResponse.responsePromise;
        await Promise.resolve();
      });

      await flushDashboardWork();
      await flushDashboardWork();
      await flushDashboardWork();

      const scrollRegion = screen.getByTestId(DASHBOARD_TEST_ID);
      await act(async () => {
        scrollRegion.__sharePriceDashboardPublishMeasurement?.();
      });
      await flushDashboardWork();
      const leftRailWidth = Number(scrollRegion.getAttribute('data-left-rail-width'));

      expect(Number(scrollRegion.getAttribute('data-content-width'))).toBe(920 - leftRailWidth);
    } finally {
      if (originalClientWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidthDescriptor);
      } else {
        delete HTMLElement.prototype.clientWidth;
      }
    }
  });

  it('populates older annual entries when a fixed-length preset is panned left', async () => {
    const {
      scrollController,
      scrollRegion,
      user,
    } = await renderDashboard();

    await user.click(screen.getByRole('button', { name: '10Y' }));
    await flushDashboardWork();

    expect(screen.getByText('2015-12')).toBeTruthy();
    expect(screen.getByText('2025-12')).toBeTruthy();

    await dragPresetWindowOlderByMonths({
      scrollRegion,
      scrollController,
      monthCount: 24,
    });

    expect(screen.getByText('2013-12')).toBeTruthy();
    expect(screen.getByText('2023-12')).toBeTruthy();
    expect(screen.queryByText('2025-12')).toBeNull();

    const visibleFiscalYears = screen.getAllByTestId('share-price-dashboard-fiscal-tick').map((node) => {
      return node.getAttribute('data-fiscal-year');
    });

    expect(visibleFiscalYears[0]).toBe('2013');
    expect(visibleFiscalYears[visibleFiscalYears.length - 1]).toBe('2023');
  });

  it('lets fixed presets pan into years older than the 20th most recent annual row', async () => {
    const {
      scrollController,
      scrollRegion,
      user,
    } = await renderDashboard({
      payload: buildLongHistoryDashboardPayload(),
    });

    await user.click(screen.getByRole('button', { name: '10Y' }));
    await flushDashboardWork();

    expect(screen.getByText('2015-12')).toBeTruthy();
    expect(screen.getByText('2025-12')).toBeTruthy();

    await dragPresetWindowOlderByMonths({
      scrollRegion,
      scrollController,
      monthCount: 180,
    });

    expect(screen.getByText('2000-12')).toBeTruthy();
    expect(screen.getByText('2010-12')).toBeTruthy();
    expect(screen.queryByText('2025-12')).toBeNull();
  });

  it('re-initializes preset panning correctly after switching through MAX', async () => {
    const {
      endInput,
      minAvailableMonth,
      scrollController,
      scrollRegion,
      startInput,
      user,
    } = await renderDashboard();

    await user.click(screen.getByRole('button', { name: 'MAX' }));
    await flushDashboardWork();
    await user.click(screen.getByRole('button', { name: '1Y' }));
    await flushDashboardWork();

    expect(startInput.value).toBe('2024-12');
    expect(endInput.value).toBe('2025-12');
    expect(scrollController.getScrollLeft()).toBe(getLatestPresetScrollLeft({
      latestPresetStartMonth: '2024-12',
      minAvailableMonth,
    }));

    await dragPresetWindowOlderByMonths({
      scrollRegion,
      scrollController,
    });

    expect(startInput.value).toBe('2024-11');
    expect(endInput.value).toBe('2025-11');
  });

  it('keeps a single visible annual row centered in its table column', async () => {
    const {
      endInput,
      startInput,
    } = await renderDashboard();

    await act(async () => {
      fireEvent.change(startInput, { target: { value: '2025-12' } });
      fireEvent.change(endInput, { target: { value: '2025-12' } });
    });
    await flushDashboardWork();

    const fiscalTicks = screen.getAllByTestId('share-price-dashboard-fiscal-tick');
    const headerCells = screen.getAllByTestId('share-price-dashboard-header-cell');

    expect(fiscalTicks).toHaveLength(1);
    expect(headerCells).toHaveLength(1);
    expect(fiscalTicks[0].getAttribute('data-fiscal-year')).toBe('2025');
    expect(Number(fiscalTicks[0].getAttribute('data-x'))).toBeCloseTo(
      Number(headerCells[0].getAttribute('data-center-x')),
      6,
    );
  });

  it('ignores the programmatic preset snap when switching presets', async () => {
    const {
      minAvailableMonth,
      scrollController,
      scrollRegion,
      startInput,
      user,
    } = await renderDashboard();

    await dragPresetWindowOlderByMonths({
      scrollRegion,
      scrollController,
      monthCount: 2,
    });

    expect(startInput.value).toBe('2020-10');

    await user.click(screen.getByRole('button', { name: '3Y' }));
    await flushDashboardWork();

    expect(startInput.value).toBe('2022-12');
  });

});

// Metrics mode is a second, richer state of the same stock card. These tests
// prove that the detail rows stay inside the existing annual table instead of
// creating a separate forecast-only surface.
describe('SharePriceDashboard metrics mode', () => {
  beforeEach(() => {
    fetchDashboardData.mockReset();
    fetchDashboardMetricsView.mockReset();
    updateDashboardMetricOverride.mockReset();
    updateDashboardInvestmentCategory.mockReset();
    updateDashboardRowPreference.mockReset();
    updateDashboardInvestmentCategory.mockResolvedValue({
      identifier: 'AAPL',
      investmentCategory: 'Mature Compounder',
    });
    installDashboardBrowserShims();
  });

  afterEach(() => {
    restoreDashboardBrowserShims();
  });

  describe('SharePriceDashboard act warning regressions', () => {
    it('does not emit act warnings when metrics mode opens after the dashboard has loaded', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        // Phase 1: mount the metrics-capable payload and wait for the base card
        // to finish loading in its normal non-metrics state.
        const { user } = await renderDashboard({
          payload: buildMetricsModePayload(),
        });

        expect(screen.queryByText('DETAIL METRICS')).toBeNull();
        expect(screen.getByRole('button', { name: 'ENTER METRICS' })).toBeTruthy();

        // Phase 2: open metrics and give React/browser follow-up work time to
        // settle through the shared helper.
        await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
        await flushDashboardWork();

        // Phase 3: verify the user-visible metrics surface really opened, then
        // assert that React never complained about work escaping `act(...)`.
        expect(screen.getByText('DETAIL METRICS')).toBeTruthy();
        expect(screen.getByText('EBIT FY+1')).toBeTruthy();
        expectNoActWarnings(consoleErrorSpy);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  it('loads metrics lazily from bootstrapped dashboard data and reuses them on reopen', async () => {
    fetchDashboardMetricsView.mockResolvedValue({
      identifier: 'AAPL',
      metricsColumns: buildMetricsModePayload().metricsColumns,
      metricsRows: buildMetricsModePayload().metricsRows,
      hasLoadedMetricsView: true,
    });

    const bootstrappedPayload = buildDashboardPayload({
      hasLoadedMetricsView: false,
      metricsColumns: [],
      metricsRows: [],
    });

    const { user } = await renderDashboard({
      payload: bootstrappedPayload,
      dashboardProps: {
        initialDashboardData: bootstrappedPayload,
      },
    });

    expect(fetchDashboardData).not.toHaveBeenCalled();
    expect(screen.queryByText('DETAIL METRICS')).toBeNull();
    expect(screen.getByTestId('share-price-dashboard-metrics-toggle').getAttribute('data-visual-emphasis')).toBe('normal');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    });
    await flushDashboardWork();

    expect(fetchDashboardMetricsView).toHaveBeenCalledTimes(1);
    expect(screen.getByText('DETAIL METRICS')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'EXIT METRICS' }));
    await flushDashboardWork();
    await userEvent.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    expect(fetchDashboardMetricsView).toHaveBeenCalledTimes(1);
  });

  it('opens one annual metrics table, keeps non-empty rows visible, and places empty rows under hidden rows', async () => {
    const { user } = await renderDashboard({
      payload: buildMetricsModePayload(),
    });

    expect(screen.queryByText('DETAIL METRICS')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    expect(screen.getByText('DETAIL METRICS')).not.toBeNull();
    const detailMetricsHeader = screen.getByTestId('share-price-dashboard-detail-metrics-header');
    const metricRows = screen.getAllByTestId('share-price-dashboard-metric-row');
    expect(within(detailMetricsHeader).queryByText('2023')).toBeNull();
    expect(within(detailMetricsHeader).queryByText('2024')).toBeNull();
    expect(within(detailMetricsHeader).queryByText('2025')).toBeNull();
    expect(metricRows[0].getAttribute('data-section-start')).toBe('true');
    expect(screen.getAllByText('Income Statement')).toHaveLength(1);
    expect(screen.getAllByText('Balance Sheet')).toHaveLength(1);
    expect(screen.getByText('EBIT FY+1')).not.toBeNull();
    expect(screen.getByText('Revenue FY+1')).not.toBeNull();
    expect(screen.getByText('Cash FY+1')).not.toBeNull();
    expect(screen.queryAllByTestId('share-price-dashboard-metric-row-hide-button')).toHaveLength(0);
    expect(screen.getByText('12.00')).not.toBeNull();
    expect(screen.getByText('18.00')).not.toBeNull();
    expect(screen.getByText('24.00')).not.toBeNull();
    expect(screen.queryByText('Revenue forecast CAGR 3Y')).toBeNull();

    // Completely empty rows should stay out of the main metrics table by default,
    // but the user can still discover them in the dedicated hidden-rows section.
    await user.click(screen.getByRole('button', { name: 'HIDDEN ROWS (1)' }));

    expect(screen.getByTestId('share-price-dashboard-hidden-rows')).not.toBeNull();
    expect(screen.getByText('Revenue forecast CAGR 3Y')).not.toBeNull();
  });

  it('formats large metrics values with compact units instead of raw full-length decimals', async () => {
    const { user } = await renderDashboard({
      payload: buildMetricsModePayload({
        annualMetrics: [
          {
            fiscalYear: 2023,
            fiscalYearEndDate: '2023-12-31',
            earningsReleaseDate: '2024-02-15',
            sharePrice: 14.2,
            sharesOnIssue: 44200000,
            marketCap: 1200000000,
          },
          {
            fiscalYear: 2024,
            fiscalYearEndDate: '2024-12-31',
            earningsReleaseDate: '2025-02-15',
            sharePrice: 16.8,
            sharesOnIssue: 507600000,
            marketCap: 114200000,
          },
          {
            fiscalYear: 2025,
            fiscalYearEndDate: '2025-12-31',
            earningsReleaseDate: '2026-02-15',
            sharePrice: 18.4,
            sharesOnIssue: -507600000,
            marketCap: -114600000000,
          },
        ],
        annualMainTableRows: buildAnnualMainTableRows([
          {
            fiscalYear: 2023,
            fiscalYearEndDate: '2023-12-31',
            earningsReleaseDate: '2024-02-15',
            sharePrice: 14.2,
            sharesOnIssue: 44200000,
            marketCap: 1200000000,
          },
          {
            fiscalYear: 2024,
            fiscalYearEndDate: '2024-12-31',
            earningsReleaseDate: '2025-02-15',
            sharePrice: 16.8,
            sharesOnIssue: 507600000,
            marketCap: 114200000,
          },
          {
            fiscalYear: 2025,
            fiscalYearEndDate: '2025-12-31',
            earningsReleaseDate: '2026-02-15',
            sharePrice: 18.4,
            sharesOnIssue: -507600000,
            marketCap: -114600000000,
          },
        ]),
        metricsRows: [
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
            cells: [
              {
                columnKey: 'annual-2023',
                value: 1200000000.99,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: true,
                overrideTarget: { kind: 'annual', fiscalYear: 2023, payloadPath: 'forecastData.fy1.ebit' },
              },
              {
                columnKey: 'annual-2024',
                value: 114600000.99,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: true,
                overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.ebit' },
              },
              {
                columnKey: 'annual-2025',
                value: 3800.4,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: true,
                overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'forecastData.fy1.ebit' },
              },
            ],
          },
          {
            rowKey: '720::annualData[].base.customerCount',
            fieldPath: 'annualData[].base.customerCount',
            label: 'Customer count',
            shortLabel: 'Customer count',
            section: 'Income Statement',
            shortSection: 'Income',
            order: 720,
            surface: 'detail',
            isEnabled: true,
            cells: [
              {
                columnKey: 'annual-2023',
                value: 44200000,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: true,
                overrideTarget: { kind: 'annual', fiscalYear: 2023, payloadPath: 'base.customerCount' },
              },
              {
                columnKey: 'annual-2024',
                value: 507600000,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: true,
                overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'base.customerCount' },
              },
              {
                columnKey: 'annual-2025',
                value: -507600000,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: true,
                overrideTarget: { kind: 'annual', fiscalYear: 2025, payloadPath: 'base.customerCount' },
              },
            ],
          },
        ],
      }),
    });

    const sharesOnIssueRow = getMainTableRow('Shares on issue');
    const marketCapRow = getMainTableRow('Market cap');

    expect(sharesOnIssueRow).toBeTruthy();
    expect(marketCapRow).toBeTruthy();
    expect(within(sharesOnIssueRow).getByText('44.2M')).toBeTruthy();
    expect(within(sharesOnIssueRow).getByText('508M')).toBeTruthy();
    expect(within(sharesOnIssueRow).getByText('-508M')).toBeTruthy();
    expect(within(marketCapRow).getByText('1.2B')).toBeTruthy();
    expect(within(marketCapRow).getByText('114M')).toBeTruthy();
    expect(within(marketCapRow).getByText('-115B')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    expect(screen.getAllByText('1.2B').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('115M')).not.toBeNull();
    expect(screen.getByText('3.8K')).not.toBeNull();
    expect(screen.getAllByText('44.2M').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('508M').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('-508M').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('1,200,000,000.99')).toBeNull();
    expect(screen.queryByText('114,600,000.99')).toBeNull();
    expect(screen.queryByText('1B')).toBeNull();
    expect(screen.queryByText('114.6M')).toBeNull();
  });

  it('keeps compact decimals below 100 while rounding compact 100+ values', async () => {
    const { user } = await renderDashboard({
      payload: buildMetricsModePayload({
        annualMetrics: [
          {
            fiscalYear: 2023,
            fiscalYearEndDate: '2023-12-31',
            earningsReleaseDate: '2024-02-15',
            sharePrice: 14.2,
            sharesOnIssue: 44200000,
            marketCap: 1200000000,
          },
          {
            fiscalYear: 2024,
            fiscalYearEndDate: '2024-12-31',
            earningsReleaseDate: '2025-02-15',
            sharePrice: 16.8,
            sharesOnIssue: 507200000,
            marketCap: 114600000,
          },
        ],
        annualMainTableRows: buildAnnualMainTableRows([
          {
            fiscalYear: 2023,
            fiscalYearEndDate: '2023-12-31',
            earningsReleaseDate: '2024-02-15',
            sharePrice: 14.2,
            sharesOnIssue: 44200000,
            marketCap: 1200000000,
          },
          {
            fiscalYear: 2024,
            fiscalYearEndDate: '2024-12-31',
            earningsReleaseDate: '2025-02-15',
            sharePrice: 16.8,
            sharesOnIssue: 507200000,
            marketCap: 114600000,
          },
        ]),
        metricsRows: [
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
            cells: [
              {
                columnKey: 'annual-2023',
                value: 1200000000,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: true,
                overrideTarget: { kind: 'annual', fiscalYear: 2023, payloadPath: 'forecastData.fy1.ebit' },
              },
              {
                columnKey: 'annual-2024',
                value: 114600000,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: true,
                overrideTarget: { kind: 'annual', fiscalYear: 2024, payloadPath: 'forecastData.fy1.ebit' },
              },
            ],
          },
        ],
      }),
    });

    const sharesOnIssueRow = getMainTableRow('Shares on issue');
    const marketCapRow = getMainTableRow('Market cap');

    expect(sharesOnIssueRow).toBeTruthy();
    expect(marketCapRow).toBeTruthy();
    // These three examples teach the compact threshold directly: values below compact
    // 100 keep one decimal, while compact 100+ values round to whole units.
    expect(within(sharesOnIssueRow).getByText('44.2M')).toBeTruthy();
    expect(within(sharesOnIssueRow).getByText('507M')).toBeTruthy();
    expect(within(marketCapRow).getByText('1.2B')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    expect(screen.getAllByText('44.2M').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('507M').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1.2B').length).toBeGreaterThanOrEqual(2);
  });

  it('drops decimals from 3-digit plain detail metrics while preserving smaller values and compact rules', async () => {
    const { user } = await renderDashboard({
      payload: buildPlainValueBoundaryMetricsPayload(),
    });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    expect(getDashboardTableCell({
      rowKey: '710::annualData[].forecastData.fy1.ebit',
      columnKey: 'annual-2024',
    })?.textContent).toContain('99.75');
    expect(getDashboardTableCell({
      rowKey: '710::annualData[].forecastData.fy1.ebit',
      columnKey: 'annual-2025',
    })?.textContent).toContain('100');

    expect(getDashboardTableCell({
      rowKey: '720::annualData[].base.customerCount',
      columnKey: 'annual-2024',
    })?.textContent).toContain('99.75');
    expect(getDashboardTableCell({
      rowKey: '720::annualData[].base.customerCount',
      columnKey: 'annual-2025',
    })?.textContent).toContain('100');

    expect(getDashboardTableCell({
      rowKey: '730::annualData[].base.evEbit',
      columnKey: 'annual-2024',
    })?.textContent).toContain('99.75');
    expect(getDashboardTableCell({
      rowKey: '730::annualData[].base.evEbit',
      columnKey: 'annual-2025',
    })?.textContent).toContain('-123');
    expect(getDashboardTableCell({
      rowKey: '730::annualData[].base.evEbit',
      columnKey: 'annual-2025',
    })?.textContent).not.toContain('-123.45');

    expect(getDashboardTableCell({
      rowKey: '740::annualData[].growthForecasts.revenueCagr3y',
      columnKey: 'annual-2024',
    })?.textContent).toContain('12.3%');
    expect(getDashboardTableCell({
      rowKey: '740::annualData[].growthForecasts.revenueCagr3y',
      columnKey: 'annual-2025',
    })?.textContent).toContain('123%');
  });

  it('renders exact zero table values without redundant decimals across main-table and detail rows', async () => {
    const { user } = await renderDashboard({
      payload: buildExactZeroMetricsPayload(),
    });

    const sharePriceRow = getMainTableRow('Share price');
    const sharesOnIssueRow = getMainTableRow('Shares on issue');
    const marketCapRow = getMainTableRow('Market cap');
    const sharePriceZeroCell = getMainTableCell({
      rowKey: 'annualData[].base.sharePrice',
      columnKey: 'annual-2024',
    });
    const sharePriceNonZeroCell = getMainTableCell({
      rowKey: 'annualData[].base.sharePrice',
      columnKey: 'annual-2025',
    });
    const sharesOnIssueZeroCell = getMainTableCell({
      rowKey: 'annualData[].base.sharesOnIssue',
      columnKey: 'annual-2024',
    });
    const marketCapZeroCell = getMainTableCell({
      rowKey: 'annualData[].base.marketCap',
      columnKey: 'annual-2024',
    });

    expect(sharePriceRow).toBeTruthy();
    expect(sharesOnIssueRow).toBeTruthy();
    expect(marketCapRow).toBeTruthy();
    expect(sharePriceZeroCell).toBeTruthy();
    expect(sharePriceNonZeroCell).toBeTruthy();
    expect(sharesOnIssueZeroCell).toBeTruthy();
    expect(marketCapZeroCell).toBeTruthy();

    // Zero is a readability exception. These assertions keep the old non-zero
    // rounding rules intact while proving we no longer show noisy `0.00` text.
    expect(sharePriceZeroCell.textContent).toContain('0');
    expect(sharePriceZeroCell.textContent).not.toContain('0.00');
    expect(sharePriceZeroCell.textContent).not.toContain('-0.00');
    expect(sharesOnIssueZeroCell.textContent).toContain('0');
    expect(sharesOnIssueZeroCell.textContent).not.toContain('0.0');
    expect(marketCapZeroCell.textContent).toContain('0');
    expect(marketCapZeroCell.textContent).not.toContain('0.0');
    expect(sharePriceNonZeroCell.textContent).toContain('100');

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    expect(getDashboardTableCell({
      rowKey: '710::annualData[].forecastData.fy1.ebit',
      columnKey: 'annual-2024',
    })?.textContent).toContain('0');
    expect(getDashboardTableCell({
      rowKey: '710::annualData[].forecastData.fy1.ebit',
      columnKey: 'annual-2024',
    })?.textContent).not.toContain('0.00');
    expect(getDashboardTableCell({
      rowKey: '720::annualData[].base.customerCount',
      columnKey: 'annual-2024',
    })?.textContent).toContain('0');
    expect(getDashboardTableCell({
      rowKey: '720::annualData[].base.customerCount',
      columnKey: 'annual-2024',
    })?.textContent).not.toContain('-0.00');
    expect(getDashboardTableCell({
      rowKey: '730::annualData[].base.evEbit',
      columnKey: 'annual-2024',
    })?.textContent).toContain('0');
    expect(getDashboardTableCell({
      rowKey: '740::annualData[].growthForecasts.revenueCagr3y',
      columnKey: 'annual-2024',
    })?.textContent).toContain('0%');
    expect(getDashboardTableCell({
      rowKey: '740::annualData[].growthForecasts.revenueCagr3y',
      columnKey: 'annual-2024',
    })?.textContent).not.toContain('0.0%');

    expect(getDashboardTableCell({
      rowKey: '710::annualData[].forecastData.fy1.ebit',
      columnKey: 'annual-2025',
    })?.textContent).toContain('100');
    expect(getDashboardTableCell({
      rowKey: '720::annualData[].base.customerCount',
      columnKey: 'annual-2025',
    })?.textContent).toContain('99.75');
    expect(getDashboardTableCell({
      rowKey: '740::annualData[].growthForecasts.revenueCagr3y',
      columnKey: 'annual-2025',
    })?.textContent).toContain('12.3%');
  });

  it('opens the left-rail row action menu and hides a row from that menu', async () => {
    const initialPayload = buildMetricsModePayload();
    const hiddenPayload = buildMetricsModePayload();

    // Hiding a row should move it out of the visible detail section and into
    // the existing hidden-rows area instead of deleting it outright.
    hiddenPayload.metricsRows = hiddenPayload.metricsRows.map((row) => {
      return row.rowKey === '710::annualData[].forecastData.fy1.ebit'
        ? { ...row, isEnabled: false }
        : row;
    });
    updateDashboardRowPreference.mockResolvedValue({
      metricsColumns: hiddenPayload.metricsColumns,
      metricsRows: hiddenPayload.metricsRows,
    });

    const { user } = await renderDashboard({
      payload: initialPayload,
    });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const metricRowLeftRail = getMetricRowLeftRail();
    expect(metricRowLeftRail).toBeTruthy();

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });

    await act(async () => {
      metricRowLeftRail.dispatchEvent(contextMenuEvent);
    });

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    const rowActionMenu = screen.getByTestId('share-price-dashboard-metric-row-action-menu');
    expect(rowActionMenu).toBeTruthy();
    expect(within(rowActionMenu).getByText('EBIT FY+1')).not.toBeNull();
    expect(within(rowActionMenu).getByRole('button', { name: 'HIDE ROW' })).not.toBeNull();
    expect(within(rowActionMenu).getByRole('button', { name: 'BOLD' })).not.toBeNull();

    await user.click(screen.getByTestId('share-price-dashboard-metric-row-hide-action'));
    await flushDashboardWork();

    expect(updateDashboardRowPreference).toHaveBeenCalledWith(
      'AAPL',
      '710::annualData[].forecastData.fy1.ebit',
      { isEnabled: false },
    );
    expect(screen.queryByTestId('share-price-dashboard-metric-row-action-menu')).toBeNull();

    // Hiding moves the row into the existing hidden-rows management area, which
    // is where the user can later bring it back with SHOW ROW.
    if (!screen.queryByTestId('share-price-dashboard-hidden-rows')) {
      const hiddenRowsToggle = screen.getAllByRole('button').find((buttonNode) => {
        return /HIDDEN ROWS/.test(buttonNode.textContent || '');
      });
      expect(hiddenRowsToggle).toBeTruthy();
      await user.click(hiddenRowsToggle);
    }
    const hiddenRowsPanel = screen.getByTestId('share-price-dashboard-hidden-rows');
    expect(hiddenRowsPanel).toBeTruthy();
    expect(within(hiddenRowsPanel).getAllByText('EBIT FY+1').length).toBeGreaterThan(0);
    expect(within(hiddenRowsPanel).getAllByRole('button', { name: 'SHOW ROW' })).toHaveLength(2);
  });

  it('shows a brief press pulse on detailed-metrics left rails when right click opens the row menu', async () => {
    await renderDashboard({
      payload: buildMetricsModePayload(),
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    });
    await flushDashboardWork();

    const metricRowLeftRail = getMetricRowLeftRail();
    expect(metricRowLeftRail).toBeTruthy();
    expect(metricRowLeftRail?.getAttribute('data-press-feedback-active')).toBe('false');

    await act(async () => {
      fireEvent.contextMenu(metricRowLeftRail);
    });

    expect(screen.getByTestId('share-price-dashboard-metric-row-action-menu')).toBeTruthy();
    expect(metricRowLeftRail?.getAttribute('data-press-feedback-active')).toBe('true');

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 220);
      });
    });

    expect(metricRowLeftRail?.getAttribute('data-press-feedback-active')).toBe('false');
  });

  it('opens the left-rail row action menu from a touch long press', async () => {
    await renderDashboard({
      payload: buildMetricsModePayload(),
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    });
    await flushDashboardWork();

    const metricRowLeftRail = getMetricRowLeftRail();
    expect(metricRowLeftRail).toBeTruthy();

    // The long press should belong to the frozen row label so touch users can
    // still reach row actions now that the right-side hide button is gone.
    await act(async () => {
      fireEvent.touchStart(metricRowLeftRail, {
        touches: [{ clientX: 20, clientY: 20 }],
      });
      await new Promise((resolve) => {
        window.setTimeout(resolve, 700);
      });
    });

    const rowActionMenu = screen.getByTestId('share-price-dashboard-metric-row-action-menu');
    expect(rowActionMenu).toBeTruthy();
    expect(within(rowActionMenu).getByRole('button', { name: 'HIDE ROW' })).not.toBeNull();
    expect(within(rowActionMenu).getByRole('button', { name: 'BOLD' })).not.toBeNull();

    await act(async () => {
      fireEvent.touchEnd(metricRowLeftRail, { touches: [] });
    });
  });

  it('shows a brief press pulse on detailed-metrics left rails when long press opens the row menu', async () => {
    await renderDashboard({
      payload: buildMetricsModePayload(),
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    });
    await flushDashboardWork();

    const metricRowLeftRail = getMetricRowLeftRail();
    expect(metricRowLeftRail).toBeTruthy();

    await act(async () => {
      fireEvent.touchStart(metricRowLeftRail, {
        touches: [{ clientX: 20, clientY: 20 }],
      });
      await new Promise((resolve) => {
        window.setTimeout(resolve, 700);
      });
    });

    expect(screen.getByTestId('share-price-dashboard-metric-row-action-menu')).toBeTruthy();
    expect(metricRowLeftRail?.getAttribute('data-press-feedback-active')).toBe('true');

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 220);
      });
    });

    expect(metricRowLeftRail?.getAttribute('data-press-feedback-active')).toBe('false');
  });

  it('bolds a detailed metrics row from the left-rail action menu', async () => {
    const initialPayload = buildMetricsModePayload();
    const boldedPayload = buildMetricsModePayload();
    boldedPayload.metricsRows = boldedPayload.metricsRows.map((row) => {
      return row.rowKey === '710::annualData[].forecastData.fy1.ebit'
        ? { ...row, isBold: true }
        : row;
    });
    updateDashboardRowPreference.mockResolvedValue({
      metricsColumns: boldedPayload.metricsColumns,
      metricsRows: boldedPayload.metricsRows,
      mainTableRowPreferences: [],
    });

    const { user } = await renderDashboard({ payload: initialPayload });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const metricRowLeftRail = getMetricRowLeftRail();
    expect(metricRowLeftRail).toBeTruthy();

    // This locks the user-visible rule we care about: bolding a row should
    // style both the frozen left rail and the row's visible value cells.
    await act(async () => {
      fireEvent.contextMenu(metricRowLeftRail);
    });

    await user.click(screen.getByRole('button', { name: 'BOLD' }));
    await flushDashboardWork();

    expect(updateDashboardRowPreference).toHaveBeenCalledWith(
      'AAPL',
      '710::annualData[].forecastData.fy1.ebit',
      { isBold: true },
    );
    expect(getMetricRowLeftRail()?.getAttribute('data-is-bold')).toBe('true');
    expect(getDashboardTableCell({
      rowKey: '710::annualData[].forecastData.fy1.ebit',
      columnKey: 'annual-2025',
    })?.getAttribute('data-is-bold')).toBe('true');
  });

  it('shows UNBOLD for an already-bold detailed metrics row and removes that bold state', async () => {
    const initialPayload = buildMetricsModePayload();
    initialPayload.metricsRows = initialPayload.metricsRows.map((row) => {
      return row.rowKey === '710::annualData[].forecastData.fy1.ebit'
        ? { ...row, isBold: true }
        : row;
    });
    const unboldedPayload = buildMetricsModePayload();
    updateDashboardRowPreference.mockResolvedValue({
      metricsColumns: unboldedPayload.metricsColumns,
      metricsRows: unboldedPayload.metricsRows,
      mainTableRowPreferences: [],
    });

    const { user } = await renderDashboard({ payload: initialPayload });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    await act(async () => {
      fireEvent.contextMenu(getMetricRowLeftRail());
    });

    expect(screen.getByRole('button', { name: 'UNBOLD' })).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'UNBOLD' }));
    await flushDashboardWork();

    expect(updateDashboardRowPreference).toHaveBeenCalledWith(
      'AAPL',
      '710::annualData[].forecastData.fy1.ebit',
      { isBold: false },
    );
    expect(getMetricRowLeftRail()?.getAttribute('data-is-bold')).toBe('false');
  });

  it('opens the main-table row action menu on right click and only offers BOLD or UNBOLD', async () => {
    await renderDashboard();

    const mainTableLeftRail = getMainTableRowLeftRail('main::annualData[].base.sharesOnIssue');
    expect(mainTableLeftRail).toBeTruthy();

    await act(async () => {
      fireEvent.contextMenu(mainTableLeftRail);
    });

    const rowActionMenu = screen.getByTestId('share-price-dashboard-metric-row-action-menu');
    expect(rowActionMenu).toBeTruthy();
    expect(within(rowActionMenu).getByRole('button', { name: 'BOLD' })).not.toBeNull();
    expect(within(rowActionMenu).queryByRole('button', { name: 'HIDE ROW' })).toBeNull();
  });

  it('shows a brief press pulse on main-table left rails when right click opens the row menu', async () => {
    await renderDashboard();

    const mainTableLeftRail = getMainTableRowLeftRail('main::annualData[].base.sharesOnIssue');
    expect(mainTableLeftRail).toBeTruthy();
    expect(mainTableLeftRail?.getAttribute('data-press-feedback-active')).toBe('false');

    await act(async () => {
      fireEvent.contextMenu(mainTableLeftRail);
    });

    expect(screen.getByTestId('share-price-dashboard-metric-row-action-menu')).toBeTruthy();
    expect(mainTableLeftRail?.getAttribute('data-press-feedback-active')).toBe('true');

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 220);
      });
    });

    expect(mainTableLeftRail?.getAttribute('data-press-feedback-active')).toBe('false');
  });

  it('opens the main-table row action menu from a long press', async () => {
    await renderDashboard();

    const mainTableLeftRail = getMainTableRowLeftRail('main::annualData[].base.sharesOnIssue');
    expect(mainTableLeftRail).toBeTruthy();

    await act(async () => {
      fireEvent.touchStart(mainTableLeftRail, {
        touches: [{ clientX: 18, clientY: 18 }],
      });
      await new Promise((resolve) => {
        window.setTimeout(resolve, 700);
      });
    });

    const rowActionMenu = screen.getByTestId('share-price-dashboard-metric-row-action-menu');
    expect(rowActionMenu).toBeTruthy();
    expect(within(rowActionMenu).getByRole('button', { name: 'BOLD' })).not.toBeNull();
    expect(within(rowActionMenu).queryByRole('button', { name: 'HIDE ROW' })).toBeNull();

    await act(async () => {
      fireEvent.touchEnd(mainTableLeftRail, { touches: [] });
    });
  });

  it('shows a brief press pulse on main-table left rails when long press opens the row menu', async () => {
    await renderDashboard();

    const mainTableLeftRail = getMainTableRowLeftRail('main::annualData[].base.sharesOnIssue');
    expect(mainTableLeftRail).toBeTruthy();

    await act(async () => {
      fireEvent.touchStart(mainTableLeftRail, {
        touches: [{ clientX: 18, clientY: 18 }],
      });
      await new Promise((resolve) => {
        window.setTimeout(resolve, 700);
      });
    });

    expect(screen.getByTestId('share-price-dashboard-metric-row-action-menu')).toBeTruthy();
    expect(mainTableLeftRail?.getAttribute('data-press-feedback-active')).toBe('true');

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 220);
      });
    });

    expect(mainTableLeftRail?.getAttribute('data-press-feedback-active')).toBe('false');
  });

  it('does not trigger left-rail press feedback when an overrideable metric value cell opens the editor', async () => {
    const { user } = await renderDashboard({
      payload: buildMetricsModePayload(),
      dashboardProps: {
        isFocusedMetricsMode: true,
      },
    });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const metricRowLeftRail = getMetricRowLeftRail();
    const metricCell = getOverrideableMetricCell();

    expect(metricRowLeftRail).toBeTruthy();
    expect(metricCell).toBeTruthy();

    await act(async () => {
      fireEvent.contextMenu(metricCell);
    });

    expect(screen.getByTestId('share-price-dashboard-metric-editor')).toBeTruthy();
    expect(screen.queryByTestId('share-price-dashboard-metric-row-action-menu')).toBeNull();
    expect(metricRowLeftRail?.getAttribute('data-press-feedback-active')).toBe('false');
  });

  it('keeps the row action menu fully inside a narrow desktop viewport near the right edge', async () => {
    await renderDashboard();
    setWindowViewportSize({ width: 280, height: 620 });

    const mainTableLeftRail = getMainTableRowLeftRail('main::annualData[].base.sharesOnIssue');
    expect(mainTableLeftRail).toBeTruthy();
    Object.defineProperty(mainTableLeftRail, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 236,
        right: 300,
        top: 90,
        bottom: 122,
        width: 64,
        height: 32,
      }),
    });

    // This regression is about zoom-like narrow desktop viewports, not just
    // whether the menu opens. The panel should clamp inward and stay readable.
    await act(async () => {
      fireEvent.contextMenu(mainTableLeftRail);
    });

    const rowActionMenu = screen.getByTestId('share-price-dashboard-metric-row-action-menu');
    const overlayLeft = Number(rowActionMenu.getAttribute('data-overlay-left'));
    const overlayWidth = Number(rowActionMenu.getAttribute('data-overlay-width'));

    expect(rowActionMenu.getAttribute('data-overlay-mode')).toBe('desktop');
    expect(overlayLeft).toBeGreaterThanOrEqual(12);
    expect(overlayLeft + overlayWidth).toBeLessThanOrEqual(268);
    expect(within(rowActionMenu).getByRole('button', { name: 'BOLD' })).not.toBeNull();
  });

  it('keeps the long-press row action menu fully inside a narrow desktop viewport near the right edge', async () => {
    await renderDashboard();
    setWindowViewportSize({ width: 280, height: 620 });

    const mainTableLeftRail = getMainTableRowLeftRail('main::annualData[].base.sharesOnIssue');
    expect(mainTableLeftRail).toBeTruthy();
    Object.defineProperty(mainTableLeftRail, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 240,
        right: 304,
        top: 88,
        bottom: 120,
        width: 64,
        height: 32,
      }),
    });

    await act(async () => {
      fireEvent.touchStart(mainTableLeftRail, {
        touches: [{ clientX: 250, clientY: 100 }],
      });
      await new Promise((resolve) => {
        window.setTimeout(resolve, 700);
      });
    });

    const rowActionMenu = screen.getByTestId('share-price-dashboard-metric-row-action-menu');
    const overlayLeft = Number(rowActionMenu.getAttribute('data-overlay-left'));
    const overlayWidth = Number(rowActionMenu.getAttribute('data-overlay-width'));

    expect(rowActionMenu.getAttribute('data-overlay-mode')).toBe('desktop');
    expect(overlayLeft).toBeGreaterThanOrEqual(12);
    expect(overlayLeft + overlayWidth).toBeLessThanOrEqual(268);
    expect(within(rowActionMenu).getByRole('button', { name: 'BOLD' })).not.toBeNull();

    await act(async () => {
      fireEvent.touchEnd(mainTableLeftRail, { touches: [] });
    });
  });

  it('shows UNBOLD for a main-table row that is already bold', async () => {
    await renderDashboard();

    await act(async () => {
      fireEvent.contextMenu(getMainTableRowLeftRail('main::annualData[].base.sharePrice'));
    });

    const rowActionMenu = screen.getByTestId('share-price-dashboard-metric-row-action-menu');
    expect(within(rowActionMenu).getByRole('button', { name: 'UNBOLD' })).not.toBeNull();
    expect(within(rowActionMenu).queryByRole('button', { name: 'HIDE ROW' })).toBeNull();
  });

  it('bolds a main-table row from the left rail and applies that style to the whole row', async () => {
    const initialPayload = buildDashboardPayload();
    updateDashboardRowPreference.mockResolvedValue({
      metricsColumns: [],
      metricsRows: [],
      mainTableRowPreferences: [
        {
          rowKey: 'main::annualData[].base.sharesOnIssue',
          fieldPath: 'annualData[].base.sharesOnIssue',
          label: 'Shares on issue',
          isBold: true,
        },
      ],
    });

    const { user } = await renderDashboard({ payload: initialPayload });
    const mainTableLeftRail = getMainTableRowLeftRail('main::annualData[].base.sharesOnIssue');
    expect(mainTableLeftRail).toBeTruthy();

    await act(async () => {
      fireEvent.contextMenu(mainTableLeftRail);
    });

    await user.click(screen.getByRole('button', { name: 'BOLD' }));
    await flushDashboardWork();

    expect(updateDashboardRowPreference).toHaveBeenCalledWith(
      'AAPL',
      'main::annualData[].base.sharesOnIssue',
      { isBold: true },
    );
    expect(getMainTableRowLeftRail('main::annualData[].base.sharesOnIssue')?.getAttribute('data-is-bold')).toBe('true');
    expect(getMainTableCell({
      rowKey: 'annualData[].base.sharesOnIssue',
      columnKey: 'annual-2025',
    })?.getAttribute('data-is-bold')).toBe('true');
  });

  it('renders the requested default-bold pricing, valuation, and dividend rows on the stock card before the user changes them', async () => {
    const { user } = await renderDashboard({ payload: buildDefaultBoldValuationMetricsPayload() });

    // These rows start bold across existing and future stocks so the user sees
    // the requested pricing, valuation, and dividend rows highlighted
    // immediately before any per-stock preference is saved.
    expect(getMainTableRowLeftRail('main::annualData[].base.sharePrice')?.getAttribute('data-is-bold')).toBe('true');
    expect(getMainTableRowLeftRail('main::annualData[].base.marketCap')?.getAttribute('data-is-bold')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    [
      '670::annualData[].forecastData.fy1.marketCap',
      '680::annualData[].forecastData.fy2.marketCap',
      '690::annualData[].forecastData.fy3.marketCap',
      '810::annualData[].valuationMultiples.evSalesTrailing',
      '820::annualData[].forecastData.fy1.evSales',
      '830::annualData[].forecastData.fy2.evSales',
      '940::annualData[].valuationMultiples.evEbitTrailing',
      '950::annualData[].forecastData.fy1.evEbit',
      '960::annualData[].forecastData.fy2.evEbit',
      '970::annualData[].forecastData.fy3.evEbit',
      '980::annualData[].valuationMultiples.peTrailing',
      '990::annualData[].forecastData.fy1.pe',
      '1000::annualData[].forecastData.fy2.pe',
      '1010::annualData[].forecastData.fy3.pe',
      '1410::annualData[].epsAndDividends.epsTrailing',
      '1420::annualData[].forecastData.fy1.eps',
      '1430::annualData[].forecastData.fy2.eps',
      '1440::annualData[].forecastData.fy3.eps',
      '1450::annualData[].epsAndDividends.dyTrailing',
      '1460::annualData[].forecastData.fy1.dy',
      '1470::annualData[].forecastData.fy2.dy',
      '1480::annualData[].forecastData.fy3.dy',
      '1490::annualData[].epsAndDividends.dpsTrailing',
      '1500::annualData[].forecastData.fy1.dps',
      '1510::annualData[].forecastData.fy2.dps',
      '1520::annualData[].forecastData.fy3.dps',
    ].forEach((rowKey) => {
      expect(getMetricRowLeftRail(rowKey)?.getAttribute('data-is-bold')).toBe('true');
    });
  });

  it('lets the user unbold one of the default bold rows and keeps that saved change', async () => {
    const initialPayload = buildDefaultBoldValuationMetricsPayload();
    const unboldedPayload = buildDefaultBoldValuationMetricsPayload({
      metricsRows: buildDefaultBoldValuationMetricsPayload().metricsRows.map((row) => {
        return row.rowKey === '1490::annualData[].epsAndDividends.dpsTrailing'
          ? { ...row, isBold: false }
          : row;
      }),
    });
    updateDashboardRowPreference.mockResolvedValue({
      metricsColumns: unboldedPayload.metricsColumns,
      metricsRows: unboldedPayload.metricsRows,
      mainTableRowPreferences: [],
    });

    const { user } = await renderDashboard({ payload: initialPayload });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    await act(async () => {
      fireEvent.contextMenu(getMetricRowLeftRail('1490::annualData[].epsAndDividends.dpsTrailing'));
    });

    expect(screen.getByRole('button', { name: 'UNBOLD' })).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'UNBOLD' }));
    await flushDashboardWork();

    expect(updateDashboardRowPreference).toHaveBeenCalledWith(
      'AAPL',
      '1490::annualData[].epsAndDividends.dpsTrailing',
      { isBold: false },
    );
    expect(getMetricRowLeftRail('1490::annualData[].epsAndDividends.dpsTrailing')?.getAttribute('data-is-bold')).toBe('false');
  });

  it('applies the full-width section-start divider to every visible section start in normal metrics mode', async () => {
    const { user } = await renderDashboard({
      payload: buildMetricsModePayloadWithHiddenSectionLeader(),
    });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const visibleSectionStarts = getVisibleSectionStartContracts();

    // Hiding the first EBIT row turns the next visible EBIT row into the true
    // section start the user sees. Every visible section start must still get
    // the shared full-width divider on both surfaces.
    expect(visibleSectionStarts.map((sectionStart) => sectionStart.rowKey)).toEqual([
      '715::annualData[].forecastData.fy1.revenue',
      '810::annualData[].forecastData.fy1.cash',
    ]);

    visibleSectionStarts.forEach((sectionStart) => {
      expect(sectionStart.leftRail).toBeTruthy();
      expect(sectionStart.valuesSurface).toBeTruthy();
      expect(sectionStart.leftRail.getAttribute('data-row-top-divider')).toBe('full-width');
      expect(sectionStart.valuesSurface.getAttribute('data-row-top-divider')).toBe('full-width');
    });
  });

  it('applies the same full-width section-start divider inside the focused metrics viewport', async () => {
    const { user } = await renderDashboard({
      payload: buildMetricsModePayloadWithHiddenSectionLeader(),
      dashboardProps: {
        isFocusedMetricsMode: true,
      },
    });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const visibleSectionStarts = getVisibleSectionStartContracts();
    const internalSectionStarts = visibleSectionStarts.filter((sectionStart) => {
      return sectionStart.rowKey !== '715::annualData[].forecastData.fy1.revenue';
    });

    expect(visibleSectionStarts.map((sectionStart) => sectionStart.rowKey)).toEqual([
      '715::annualData[].forecastData.fy1.revenue',
      '810::annualData[].forecastData.fy1.cash',
    ]);

    // Focused mode already has a sticky header divider above the first visible row,
    // so this suite checks the repeated internal section boundaries inside the viewport.
    expect(internalSectionStarts.map((sectionStart) => sectionStart.rowKey)).toEqual([
      '810::annualData[].forecastData.fy1.cash',
    ]);

    internalSectionStarts.forEach((sectionStart) => {
      expect(sectionStart.leftRail).toBeTruthy();
      expect(sectionStart.valuesSurface).toBeTruthy();
      expect(sectionStart.leftRail.getAttribute('data-row-top-divider')).toBe('full-width');
      expect(sectionStart.valuesSurface.getAttribute('data-row-top-divider')).toBe('full-width');
    });
  });

  it('keeps non-section detail rows free of the section-start divider styling', async () => {
    const { user } = await renderDashboard({ payload: buildMetricsModePayload() });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const nonSectionLeftRail = getMetricRowLeftRail('715::annualData[].forecastData.fy1.revenue');
    const nonSectionValuesSurface = getMetricRowValuesSurface('715::annualData[].forecastData.fy1.revenue');

    expect(nonSectionLeftRail).toBeTruthy();
    expect(nonSectionValuesSurface).toBeTruthy();
    // This negative check makes sure the fix does not turn every row into a
    // section boundary. Only real visible section starts should get the heavy line.
    expect(nonSectionLeftRail.getAttribute('data-row-top-divider')).toBe('none');
    expect(nonSectionValuesSurface.getAttribute('data-row-top-divider')).toBe('none');
  });

  it('preserves bold state when a hidden detailed row is shown again', async () => {
    const hiddenBoldPayload = buildMetricsModePayload();
    hiddenBoldPayload.metricsRows = hiddenBoldPayload.metricsRows.map((row) => {
      return row.rowKey === '710::annualData[].forecastData.fy1.ebit'
        ? { ...row, isEnabled: false, isBold: true }
        : row;
    });
    const shownBoldPayload = buildMetricsModePayload();
    shownBoldPayload.metricsRows = shownBoldPayload.metricsRows.map((row) => {
      return row.rowKey === '710::annualData[].forecastData.fy1.ebit'
        ? { ...row, isEnabled: true, isBold: true }
        : row;
    });
    updateDashboardRowPreference.mockResolvedValue({
      metricsColumns: shownBoldPayload.metricsColumns,
      metricsRows: shownBoldPayload.metricsRows,
      mainTableRowPreferences: [],
    });

    const { user } = await renderDashboard({ payload: hiddenBoldPayload });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const hiddenRowsToggle = screen.getAllByRole('button').find((buttonNode) => {
      return /HIDDEN ROWS/.test(buttonNode.textContent || '');
    });
    expect(hiddenRowsToggle).toBeTruthy();
    await user.click(hiddenRowsToggle);

    const hiddenRowsPanel = screen.getByTestId('share-price-dashboard-hidden-rows');
    await user.click(within(hiddenRowsPanel).getAllByRole('button', { name: 'SHOW ROW' })[0]);
    await flushDashboardWork();

    expect(updateDashboardRowPreference).toHaveBeenCalledWith(
      'AAPL',
      '710::annualData[].forecastData.fy1.ebit',
      { isEnabled: true },
    );
    expect(getMetricRowLeftRail()?.getAttribute('data-is-bold')).toBe('true');
  });

  it('drops the overridden flag after CLEAR OVERRIDE reloads a non-overridden payload', async () => {
    const initialPayload = buildMetricsModePayload();
    const clearedPayload = buildMetricsModePayload();

    // The first payload simulates the stock card before the user clears the
    // override. The same cell comes back in the second payload without the
    // override flag, which is what should remove the purple styling in the UI.
    clearedPayload.metricsRows[0].cells[2] = {
      ...clearedPayload.metricsRows[0].cells[2],
      sourceOfTruth: 'system',
      isOverridden: false,
    };

    updateDashboardMetricOverride.mockResolvedValue({});

    const { user } = await renderDashboard({
      payloadSequence: [initialPayload, clearedPayload],
    });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const overriddenCellBeforeClear = screen.getAllByTestId('share-price-dashboard-metric-cell').find((cellNode) => {
      return cellNode.getAttribute('data-is-overridden') === 'true';
    });
    expect(overriddenCellBeforeClear).toBeTruthy();
    expect(overriddenCellBeforeClear.getAttribute('data-is-overridden')).toBe('true');
    const overriddenRowKey = overriddenCellBeforeClear.getAttribute('data-row-key');
    const overriddenColumnKey = overriddenCellBeforeClear.getAttribute('data-column-key');

    // We open the same editor a real user would open from the metrics table,
    // then trigger the clear path instead of the save path.
    await act(async () => {
      fireEvent.contextMenu(overriddenCellBeforeClear);
    });

    expect(screen.getByTestId('share-price-dashboard-metric-editor')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'CLEAR OVERRIDE' }));
    await flushDashboardWork();
    await flushDashboardWork();

    expect(updateDashboardMetricOverride).toHaveBeenCalledWith(
      'AAPL',
      {
        kind: 'annual',
        fiscalYear: 2025,
        payloadPath: 'forecastData.fy1.ebit',
      },
      null,
    );
    expect(screen.queryByTestId('share-price-dashboard-metric-editor')).toBeNull();

    const overriddenCellAfterClear = getOverrideableMetricCell({
      rowKey: overriddenRowKey,
      columnKey: overriddenColumnKey,
    });
    expect(overriddenCellAfterClear).toBeTruthy();
    expect(overriddenCellAfterClear.getAttribute('data-is-overridden')).toBe('false');
  });

  it('opens the shared override editor from a main-table right click', async () => {
    await renderDashboard();

    const sharePriceCell = getMainTableCell({
      rowKey: 'annualData[].base.sharePrice',
      columnKey: 'annual-2025',
    });
    expect(sharePriceCell).toBeTruthy();

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });

    await act(async () => {
      sharePriceCell.dispatchEvent(contextMenuEvent);
    });

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(screen.getByTestId('share-price-dashboard-metric-editor')).toBeTruthy();
  });

  it('keeps the shared override editor fully inside a narrow desktop viewport near the right edge', async () => {
    await renderDashboard();
    setWindowViewportSize({ width: 300, height: 620 });

    const sharePriceCell = getMainTableCell({
      rowKey: 'annualData[].base.sharePrice',
      columnKey: 'annual-2025',
    });
    expect(sharePriceCell).toBeTruthy();
    Object.defineProperty(sharePriceCell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 262,
        right: 320,
        top: 112,
        bottom: 144,
        width: 58,
        height: 32,
      }),
    });

    // The editor uses the same shared overlay helper as the row menu, so this
    // regression locks the right-edge fix down for both stock-card overlays.
    await act(async () => {
      fireEvent.contextMenu(sharePriceCell);
    });

    const metricEditor = screen.getByTestId('share-price-dashboard-metric-editor');
    const overlayLeft = Number(metricEditor.getAttribute('data-overlay-left'));
    const overlayWidth = Number(metricEditor.getAttribute('data-overlay-width'));

    expect(metricEditor.getAttribute('data-overlay-mode')).toBe('desktop');
    expect(overlayLeft).toBeGreaterThanOrEqual(12);
    expect(overlayLeft + overlayWidth).toBeLessThanOrEqual(288);
    expect(screen.getByLabelText('Override value')).toBeTruthy();
  });

  it('marks the stock dashboard scroll regions with the shared enhanced scrollbar contract', async () => {
    // These checks protect the shared scrollbar styling rule without depending
    // on JSDOM to visually paint native scrollbars.
    await renderDashboard();

    const horizontalScrollRegion = await screen.findByTestId('share-price-dashboard-scroll-region');
    expect(horizontalScrollRegion.getAttribute('data-scrollbar-style')).toBe('enhanced');
    expect(
      enhancedInternalScrollbarSx['@supports selector(::-webkit-scrollbar)']['&::-webkit-scrollbar'].width,
    ).toBe(ENHANCED_INTERNAL_SCROLLBAR_SIZE);
  });

  it('marks the focused metrics viewport with the shared enhanced scrollbar contract', async () => {
    // Focused metrics uses a second scroll surface, so it gets its own shared
    // scrollbar assertion instead of pretending the inline metrics mode renders
    // the viewport container.
    await renderDashboard({
      payload: buildMetricsModePayload(),
      dashboardProps: {
        isFocusedMetricsMode: true,
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    });
    await flushDashboardWork();

    const metricsViewport = await screen.findByTestId('share-price-dashboard-metrics-viewport');
    expect(metricsViewport.getAttribute('data-scrollbar-style')).toBe('enhanced');
    expect(
      enhancedInternalScrollbarSx['@supports selector(::-webkit-scrollbar)']['&::-webkit-scrollbar'].height,
    ).toBe(ENHANCED_INTERNAL_SCROLLBAR_SIZE);
  });

  it('keeps non-overrideable main-table cells inert', async () => {
    const payload = buildDashboardPayload();
    payload.annualMainTableRows[payload.annualMainTableRows.length - 1].cells.sharePrice = {
      ...payload.annualMainTableRows[payload.annualMainTableRows.length - 1].cells.sharePrice,
      isOverrideable: false,
      overrideTarget: null,
    };

    await renderDashboard({ payload });

    const sharePriceCell = getMainTableCell({
      rowKey: 'annualData[].base.sharePrice',
      columnKey: 'annual-2025',
    });
    expect(sharePriceCell).toBeTruthy();

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });

    await act(async () => {
      sharePriceCell.dispatchEvent(contextMenuEvent);
    });

    expect(contextMenuEvent.defaultPrevented).toBe(false);
    expect(screen.queryByTestId('share-price-dashboard-metric-editor')).toBeNull();
  });

  it('keeps derived main-table cells inert under the new direct-override lockout', async () => {
    await renderDashboard();

    const marketCapCell = getMainTableCell({
      rowKey: 'annualData[].base.marketCap',
      columnKey: 'annual-2025',
    });
    expect(marketCapCell).toBeTruthy();

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });

    await act(async () => {
      marketCapCell.dispatchEvent(contextMenuEvent);
    });

    // Market cap is still visible and bold by default, but it is derived from
    // editable inputs. This regression proves the card no longer opens the
    // shared override editor directly on that calculated cell.
    expect(contextMenuEvent.defaultPrevented).toBe(false);
    expect(screen.queryByTestId('share-price-dashboard-metric-editor')).toBeNull();
  });

  it('keeps derived detail-metrics cells inert while manual forecast rows still stay editable', async () => {
    await renderDashboard({ payload: buildDefaultBoldValuationMetricsPayload() });
    await userEvent.click(screen.getByRole('button', { name: 'ENTER METRICS' }));

    const derivedMarketCapCell = getDashboardTableCell({
      rowKey: '670::annualData[].forecastData.fy1.marketCap',
      columnKey: 'annual-2024',
    });
    const editableForecastCell = getDashboardTableCell({
      rowKey: '950::annualData[].forecastData.fy1.evEbit',
      columnKey: 'annual-2024',
    });

    expect(derivedMarketCapCell).toBeTruthy();
    expect(editableForecastCell).toBeTruthy();

    const derivedContextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });

    await act(async () => {
      derivedMarketCapCell.dispatchEvent(derivedContextMenuEvent);
    });

    expect(derivedContextMenuEvent.defaultPrevented).toBe(false);
    expect(screen.queryByTestId('share-price-dashboard-metric-editor')).toBeNull();

    await act(async () => {
      editableForecastCell.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
      }));
    });

    expect(screen.getByTestId('share-price-dashboard-metric-editor')).toBeTruthy();
  });

  it('saves a main-table override through the existing annual override route', async () => {
    const initialPayload = buildDashboardPayload();
    const savedPayload = buildDashboardPayload();
    savedPayload.annualMainTableRows[savedPayload.annualMainTableRows.length - 1].cells.sharePrice = {
      ...savedPayload.annualMainTableRows[savedPayload.annualMainTableRows.length - 1].cells.sharePrice,
      value: 333.33,
      sourceOfTruth: 'user',
      isOverridden: true,
    };

    updateDashboardMetricOverride.mockResolvedValue({});

    const { user } = await renderDashboard({
      payloadSequence: [initialPayload, savedPayload],
    });

    const sharePriceCell = getMainTableCell({
      rowKey: 'annualData[].base.sharePrice',
      columnKey: 'annual-2025',
    });
    expect(sharePriceCell).toBeTruthy();

    await act(async () => {
      fireEvent.contextMenu(sharePriceCell);
    });

    const overrideInput = screen.getByLabelText('Override value');
    await user.clear(overrideInput);
    await user.type(overrideInput, '333.33');
    await user.click(screen.getByRole('button', { name: 'SAVE OVERRIDE' }));
    await flushDashboardWork();
    await flushDashboardWork();

    expect(updateDashboardMetricOverride).toHaveBeenCalledWith(
      'AAPL',
      {
        kind: 'annual',
        fiscalYear: 2025,
        payloadPath: 'base.sharePrice',
      },
      333.33,
    );

    const savedCell = getMainTableCell({
      rowKey: 'annualData[].base.sharePrice',
      columnKey: 'annual-2025',
    });
    expect(savedCell.getAttribute('data-is-overridden')).toBe('true');
  });

  it('drops the overridden flag after CLEAR OVERRIDE reloads a main-table payload', async () => {
    const initialPayload = buildDashboardPayload();
    const clearedPayload = buildDashboardPayload();

    initialPayload.annualMainTableRows[initialPayload.annualMainTableRows.length - 1].cells.sharesOnIssue = {
      ...initialPayload.annualMainTableRows[initialPayload.annualMainTableRows.length - 1].cells.sharesOnIssue,
      sourceOfTruth: 'user',
      isOverridden: true,
      value: 2000000000,
    };
    clearedPayload.annualMainTableRows[clearedPayload.annualMainTableRows.length - 1].cells.sharesOnIssue = {
      ...clearedPayload.annualMainTableRows[clearedPayload.annualMainTableRows.length - 1].cells.sharesOnIssue,
      sourceOfTruth: 'roic',
      isOverridden: false,
      value: 1015000000,
    };

    updateDashboardMetricOverride.mockResolvedValue({});

    const { user } = await renderDashboard({
      payloadSequence: [initialPayload, clearedPayload],
    });

    const overriddenCellBeforeClear = getMainTableCell({
      rowKey: 'annualData[].base.sharesOnIssue',
      columnKey: 'annual-2025',
    });
    expect(overriddenCellBeforeClear.getAttribute('data-is-overridden')).toBe('true');

    await act(async () => {
      fireEvent.contextMenu(overriddenCellBeforeClear);
    });

    await user.click(screen.getByRole('button', { name: 'CLEAR OVERRIDE' }));
    await flushDashboardWork();
    await flushDashboardWork();

    expect(updateDashboardMetricOverride).toHaveBeenCalledWith(
      'AAPL',
      {
        kind: 'annual',
        fiscalYear: 2025,
        payloadPath: 'base.sharesOnIssue',
      },
      null,
    );

    const overriddenCellAfterClear = getMainTableCell({
      rowKey: 'annualData[].base.sharesOnIssue',
      columnKey: 'annual-2025',
    });
    expect(overriddenCellAfterClear.getAttribute('data-is-overridden')).toBe('false');
  });

  // This subsection protects the family of React loop bugs that previously froze
  // the stock cards. The historical failure chain looked like this:
  // 1. the user pressed ENTER METRICS
  // 2. a parent component updated which stock was "focused"
  // 3. sibling cards hid or remounted
  // 4. scale/measurement inputs were recomputed during those rerenders
  // 5. an effect treated a semantically identical input as "new" and scheduled
  //    another state update
  // 6. React repeated that cycle until it threw "Maximum update depth exceeded"
  //
  // The tests below intentionally exercise that dangerous territory with
  // animation enabled, because the animated path is where the regressions hid.
  describe('SharePriceDashboard React loop regressions', () => {
    const DANGEROUS_REACT_LOOP_WARNING_FRAGMENTS = [
      'Maximum update depth exceeded',
      'Cannot update a component',
    ];

    // React often surfaces these regressions in `console.error` before the test
    // visibly "freezes". Keeping one narrow helper here lets the suite fail on
    // the dangerous loop warnings we care about without being distracted by
    // unrelated pre-existing warnings elsewhere in this large file.
    function getDangerousReactLoopWarnings(consoleErrorSpy) {
      return consoleErrorSpy.mock.calls.filter((call) => {
        return call.some((value) => {
          return DANGEROUS_REACT_LOOP_WARNING_FRAGMENTS.some((messageFragment) => {
            return String(value).includes(messageFragment);
          });
        });
      });
    }

    function expectNoDangerousReactLoopWarnings(consoleErrorSpy) {
      expect(getDangerousReactLoopWarnings(consoleErrorSpy)).toHaveLength(0);
    }

    function getRenderedYAxisLabelTexts(testRoot = within(mountedContainer)) {
      return testRoot.getAllByTestId('share-price-dashboard-y-axis-label').map((labelNode) => labelNode.textContent);
    }

    // The real Stocks page owns the "which card is focused?" decision in a
    // parent component, then passes that state down into SharePriceDashboard.
    // This harness recreates that relationship in the smallest possible test
    // setup so we can isolate React loop bugs without rendering the whole page.
    function ParentFocusHarness({ showFocusState = false, showRerenderButton = false }) {
      const [isFocused, setIsFocused] = React.useState(false);
      const [rerenderCount, setRerenderCount] = React.useState(0);

      return (
        <div>
          {showFocusState ? (
            <div data-testid="share-price-dashboard-parent-focus-state">
              {isFocused ? 'focused' : 'idle'}
            </div>
          ) : null}
          {showRerenderButton ? (
            <div>
              <button type="button" onClick={() => setRerenderCount((count) => count + 1)}>
                RERENDER PARENT
              </button>
              <div data-testid="share-price-dashboard-parent-rerender-count">
                {rerenderCount}
              </div>
            </div>
          ) : null}
          <SharePriceDashboard
            identifier="AAPL"
            name="AAPL name"
            isFocusedMetricsMode={isFocused}
            onMetricsVisibilityChange={setIsFocused}
            scaleAnimationDurationMs={120}
          />
        </div>
      );
    }

    // This harness mirrors the real Stocks page behavior more closely:
    // - no focused stock => both cards are visible
    // - focused stock => only that card remains mounted
    // - hiding metrics => both cards come back
    //
    // That hide/remount cycle is exactly what made the original infinite-loop
    // bug so painful, so we keep the harness explicit and named here.
    function FocusedStocksHarness() {
      const [focusedIdentifier, setFocusedIdentifier] = React.useState('');
      const visibleIdentifiers = focusedIdentifier ? [focusedIdentifier] : ['AAPL', 'MSFT'];

      return (
        <div>
          {visibleIdentifiers.map((identifier) => (
            <div key={identifier} data-testid={`share-price-dashboard-harness-${identifier}`}>
              <SharePriceDashboard
                identifier={identifier}
                name={`${identifier} name`}
                isFocusedMetricsMode={focusedIdentifier === identifier}
                onMetricsVisibilityChange={(nextIsOpen) => {
                  setFocusedIdentifier(nextIsOpen ? identifier : '');
                }}
                scaleAnimationDurationMs={120}
              />
            </div>
          ))}
        </div>
      );
    }

    // This is the smallest possible reproduction of the first focus bug:
    // the child card opens metrics, the parent updates its own focus state, and
    // React must complete that handoff without any render-phase warnings or loop
    // warnings. We keep the focused/idle label visible so a beginner can see the
    // parent-owned state change directly in the DOM.
    it('does not warn when ENTER METRICS updates parent focus state', async () => {
      const payload = buildMetricsModePayload();
      const deferredResponse = createDeferredResponse();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      fetchDashboardData.mockImplementation(() => deferredResponse.responsePromise);

      try {
        mountDashboard(<ParentFocusHarness showFocusState />);

        await act(async () => {
          deferredResponse.resolveResponse(payload);
          await deferredResponse.responsePromise;
          await Promise.resolve();
        });

        await flushDashboardWork();

        const mountedQueries = within(mountedContainer);
        const user = userEvent.setup();

        // Phase 1: the parent starts idle and the child card is still in its
        // normal non-focused mode.
        expect(mountedQueries.getByTestId('share-price-dashboard-parent-focus-state').textContent).toBe('idle');
        expect(mountedQueries.getByRole('button', { name: 'ENTER METRICS' })).toBeTruthy();
        expect(mountedQueries.getByTestId('share-price-dashboard-metrics-toggle').getAttribute('data-visual-emphasis')).toBe('normal');

        // Phase 2: pressing ENTER METRICS asks the parent to flip into focused
        // mode. We use three turns here because this path includes the parent
        // state update plus the dashboard's animated follow-up effects.
        await user.click(mountedQueries.getByRole('button', { name: 'ENTER METRICS' }));
        await flushDashboardWork(3);

        // Phase 3: both the parent-owned state and the user-facing button label
        // should show that focused mode finished cleanly.
        expect(mountedQueries.getByTestId('share-price-dashboard-parent-focus-state').textContent).toBe('focused');
        expect(mountedQueries.getByRole('button', { name: 'EXIT METRICS' })).toBeTruthy();
        expect(mountedQueries.getByTestId('share-price-dashboard-metrics-toggle').getAttribute('data-visual-emphasis')).toBe('high');
        expectNoDangerousReactLoopWarnings(consoleErrorSpy);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    // The earlier version of this regression watched raw requestAnimationFrame
    // counts, which was fragile because it cared about *how* the animation ran
    // instead of what the user would notice. This version is stronger:
    // - open focused metrics so the animated scale path is active
    // - force several parent rerenders that do not change the semantic target scale
    // - verify the chart labels stay stable and React never logs a loop warning
    it('survives repeated parent rerenders with the same semantic target scale', async () => {
      const payload = buildMetricsModePayload();
      const deferredResponse = createDeferredResponse();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      fetchDashboardData.mockImplementation(() => deferredResponse.responsePromise);

      try {
        mountDashboard(<ParentFocusHarness showRerenderButton />);

        await act(async () => {
          deferredResponse.resolveResponse(payload);
          await deferredResponse.responsePromise;
          await Promise.resolve();
        });

        await flushDashboardWork(3);

        const mountedQueries = within(mountedContainer);
        const user = userEvent.setup();

        // Phase 1: open focused metrics so the parent-owned focus state and the
        // animated chart-scale path are both live.
        await user.click(mountedQueries.getByRole('button', { name: 'ENTER METRICS' }));
        await flushDashboardWork(3);

        const labelsBeforeParentRerenders = getRenderedYAxisLabelTexts(mountedQueries);

        expect(labelsBeforeParentRerenders.length).toBeGreaterThan(0);
        expect(mountedQueries.getByRole('button', { name: 'EXIT METRICS' })).toBeTruthy();

        // Phase 2: force several parent rerenders that do *not* change the
        // dashboard's semantic chart scale. If object identity accidentally
        // became the dependency again, this is where the loop would restart.
        await user.click(mountedQueries.getByRole('button', { name: 'RERENDER PARENT' }));
        await flushDashboardWork(3);
        await user.click(mountedQueries.getByRole('button', { name: 'RERENDER PARENT' }));
        await flushDashboardWork(3);
        await user.click(mountedQueries.getByRole('button', { name: 'RERENDER PARENT' }));
        await flushDashboardWork(3);

        // Phase 3: the chart should still look the same to the user, and React
        // should not have reported any runaway update loop.
        expect(mountedQueries.getByTestId('share-price-dashboard-parent-rerender-count').textContent).toBe('3');
        expect(getRenderedYAxisLabelTexts(mountedQueries)).toEqual(labelsBeforeParentRerenders);
        expect(mountedQueries.getByRole('button', { name: 'EXIT METRICS' })).toBeTruthy();
        expectNoDangerousReactLoopWarnings(consoleErrorSpy);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    // This is the strongest real-world loop guard in the file because it copies
    // the Stocks page flow directly. The original bug was cumulative, so one
    // SHOW/HIDE cycle was not enough. We deliberately repeat the focus handoff
    // across both cards to make sure remount churn stays safe over time.
    it('does not log dangerous React loop warnings after repeated focused metrics remount cycles', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const payloadByIdentifier = {
        AAPL: buildMetricsModePayload({
          identifier: 'AAPL',
          companyName: 'AAPL name',
        }),
        MSFT: buildMetricsModePayload({
          identifier: 'MSFT',
          companyName: 'MSFT name',
        }),
      };

      fetchDashboardData.mockImplementation((identifier) => {
        return Promise.resolve(payloadByIdentifier[identifier]);
      });

      try {
        mountDashboard(<FocusedStocksHarness />);
        await flushDashboardWork(4);

        const user = userEvent.setup();
        const getDashboardCard = (identifier) => {
          return screen.queryByTestId(`share-price-dashboard-harness-${identifier}`);
        };

        // Phase 1: the watchlist starts with both cards visible.
        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeTruthy();

        // Phase 2: focus AAPL. That should hide the sibling card but keep the
        // focused card interactive.
        await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'ENTER METRICS' }));
        await flushDashboardWork(4);
        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeNull();
        expect(within(getDashboardCard('AAPL')).getByRole('button', { name: 'EXIT METRICS' })).toBeTruthy();

        // Phase 3: hide AAPL metrics so both cards remount.
        await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'EXIT METRICS' }));
        await flushDashboardWork(4);
        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeTruthy();

        // Phase 4: repeat the same flow with MSFT.
        await user.click(within(getDashboardCard('MSFT')).getByRole('button', { name: 'ENTER METRICS' }));
        await flushDashboardWork(4);
        expect(getDashboardCard('AAPL')).toBeNull();
        expect(getDashboardCard('MSFT')).toBeTruthy();
        expect(within(getDashboardCard('MSFT')).getByRole('button', { name: 'EXIT METRICS' })).toBeTruthy();

        // Phase 5: restore both cards once more to prove the remount path stays
        // safe after a second handoff.
        await user.click(within(getDashboardCard('MSFT')).getByRole('button', { name: 'EXIT METRICS' }));
        await flushDashboardWork(4);
        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeTruthy();

        // Phase 6: focus AAPL again. The earlier bug could build up over
        // repeated cycles, so this final repeat guards the cumulative case.
        await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'ENTER METRICS' }));
        await flushDashboardWork(4);
        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeNull();
        expect(within(getDashboardCard('AAPL')).getByRole('button', { name: 'EXIT METRICS' })).toBeTruthy();
        expectNoDangerousReactLoopWarnings(consoleErrorSpy);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    // The earlier loop bug was amplified by layout churn. This regression checks
    // one nearby risk: both cards remount, then a media-query change fires, then
    // the user opens focused metrics again. React must survive that sequence
    // without re-entering a runaway update loop.
    it('does not warn when a media-query change lands between focused metrics unmount and remount', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const payloadByIdentifier = {
        AAPL: buildMetricsModePayload({
          identifier: 'AAPL',
          companyName: 'AAPL name',
        }),
        MSFT: buildMetricsModePayload({
          identifier: 'MSFT',
          companyName: 'MSFT name',
        }),
      };

      fetchDashboardData.mockImplementation((identifier) => {
        return Promise.resolve(payloadByIdentifier[identifier]);
      });

      try {
        setViewportWidth(1024);
        mountDashboard(<FocusedStocksHarness />);
        await flushDashboardWork(4);

        const user = userEvent.setup();
        const getDashboardCard = (identifier) => {
          return screen.queryByTestId(`share-price-dashboard-harness-${identifier}`);
        };

        // Phase 1: focus AAPL, then restore both cards so the sibling-remount
        // path has already been exercised once.
        await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'ENTER METRICS' }));
        await flushDashboardWork(4);
        await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'EXIT METRICS' }));
        await flushDashboardWork(4);

        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeTruthy();

        // Phase 2: fire the same kind of media-query change that can alter rail
        // widths and measurement state across every mounted card at once.
        await setViewportWidthAndDispatch(480);
        await flushDashboardWork(3);

        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeTruthy();

        // Phase 3: open focused metrics again after the layout churn. If the
        // dashboard reintroduced the earlier effect cycle, this is where the
        // console warning would reappear.
        await user.click(within(getDashboardCard('MSFT')).getByRole('button', { name: 'ENTER METRICS' }));
        await flushDashboardWork(4);

        expect(getDashboardCard('AAPL')).toBeNull();
        expect(getDashboardCard('MSFT')).toBeTruthy();
        expect(within(getDashboardCard('MSFT')).getByRole('button', { name: 'EXIT METRICS' })).toBeTruthy();
        expect(within(getDashboardCard('MSFT')).getAllByTestId('share-price-dashboard-y-axis-label').length).toBeGreaterThan(0);
        expectNoDangerousReactLoopWarnings(consoleErrorSpy);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    // This regression keeps the card in focused metrics mode, then changes the
    // measured scroll width underneath it. That reproduces the "layout changes
    // after focus is already open" case that often accompanies big feature work.
    it('does not warn when focused metrics stays open while the measured scroll width changes', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const { user } = await renderDashboard({
          payload: buildMetricsModePayload(),
          dashboardProps: {
            isFocusedMetricsMode: true,
            scaleAnimationDurationMs: 120,
          },
        });

        // Phase 1: open focused metrics so the dashboard is in its richest,
        // most measurement-sensitive state.
        await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
        await flushDashboardWork(3);

        let activeScrollRegion = screen.getAllByTestId(DASHBOARD_TEST_ID).at(-1);

        // Phase 2: shrink the measured width, let the dashboard react, then
        // shrink it again. Multiple width changes are stronger than one because
        // the original bug was driven by repeated synchronous updates.
        await configureScrollRegion(activeScrollRegion, 360);
        await flushDashboardWork(3);

        activeScrollRegion = screen.getAllByTestId(DASHBOARD_TEST_ID).at(-1);
        await configureScrollRegion(activeScrollRegion, 280);
        await flushDashboardWork(3);

        // Phase 3: the focused metrics viewport and chart labels should still be
        // visible, which tells us the UI survived the width churn.
        const metricsViewport = screen.getAllByTestId('share-price-dashboard-metrics-viewport').at(-1);
        expect(within(metricsViewport).getByText('DETAIL METRICS')).toBeTruthy();
        expect(within(metricsViewport).getByText('EBIT FY+1')).toBeTruthy();
        expect(screen.getAllByTestId('share-price-dashboard-y-axis-label').length).toBeGreaterThan(0);
        expectNoDangerousReactLoopWarnings(consoleErrorSpy);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  // These tests protect a different failure class from the React loop regressions
  // above. Here the risk is not "React updates forever"; it is "focused metrics
  // stays mounted, but the frozen left rail disappears when MAX re-enters the
  // long-history scrolling layout." Keeping the layout regressions separate from
  // the loop regressions makes it easier for beginners to understand which kind
  // of bug each test is defending against.
  describe('SharePriceDashboard focused metrics layout regressions', () => {
    // Focused metrics mode is a second reading mode for the same card.
    // These tests protect a very specific bug:
    // - in normal mode the left rail can use CSS sticky inside the shared horizontal scroller
    // - in focused mode the detail metrics live inside their own vertical viewport
    // - when MAX is selected, the dashboard uses long-history horizontal scrolling again
    // - if we keep the focused left rail inside that inner viewport, the rail can slide away
    //   with the long-history content and effectively "disappear"
    //
    // This regression reproduces the dangerous combination directly:
    // 1. open focused metrics
    // 2. switch to MAX so the card uses long-history horizontal scrolling
    // 3. narrow the visible scroll window
    // 4. scroll sideways
    //
    // The expected behavior is that the row labels still stay visible on the left
    // while only the value area moves horizontally underneath the focused shell.
    it('keeps the focused detail metrics left rail visible while MAX scrolls horizontally', async () => {
      const { user, scrollRegion } = await renderDashboard({
        payload: buildMetricsModePayload(),
        dashboardProps: {
          isFocusedMetricsMode: true,
        },
      });

      await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
      await flushDashboardWork();

      // A narrow scroll region makes the "frozen left rail vs moving values"
      // split obvious and gives this regression a realistic mobile-sized viewport.
      await configureScrollRegion(scrollRegion, 360);
      await flushDashboardWork();

      const mountedQueries = within(mountedContainer);

      await user.click(mountedQueries.getByRole('button', { name: 'MAX' }));
      await flushDashboardWork();

      const scrollRegions = screen.getAllByTestId('share-price-dashboard-scroll-region');
      const activeScrollRegion = scrollRegions[scrollRegions.length - 1];
      const topRails = screen.getAllByTestId('share-price-dashboard-top-rails').at(-1);
      const metricsViewport = screen.getAllByTestId('share-price-dashboard-metrics-viewport').at(-1);
      const metricsHeaderWrapper = within(metricsViewport).getByTestId('share-price-dashboard-detail-metrics-header-wrapper');
      const metricsHeader = within(metricsViewport).getByTestId('share-price-dashboard-detail-metrics-header');
      const metricsContent = within(metricsViewport).getByTestId('share-price-dashboard-focused-metrics-content');
      const metricRows = within(metricsViewport).getAllByTestId('share-price-dashboard-metric-row');
      const metricRowLeftRails = within(metricsViewport).getAllByTestId('share-price-dashboard-metric-row-left-rail');
      const visibleWidth = Number(metricsViewport.getAttribute('data-visible-width'));
      const fullContentWidth = Number(metricsViewport.getAttribute('data-full-content-width'));

      expect(metricsViewport.getAttribute('data-vertical-scroll')).toBe('true');
      expect(activeScrollRegion.getAttribute('data-scroll-mode')).toBe('range');
      expect(topRails).toBeTruthy();
      expect(within(topRails).getByText('FY end date')).toBeTruthy();
      expect(metricsHeaderWrapper).toBeTruthy();
      expect(metricsHeader).toBeTruthy();
      expect(within(metricsHeader).getByText('DETAIL METRICS')).toBeTruthy();
      expect(metricRows[0].getAttribute('data-section-start')).toBe('true');
      expect(within(metricsViewport).getByText('EBIT FY+1')).toBeTruthy();
      expect(within(metricsViewport).queryByText('FY end date')).toBeNull();
      expect(metricRows).toHaveLength(3);
      expect(metricRowLeftRails).toHaveLength(3);
      expect(within(metricsViewport).queryAllByTestId('share-price-dashboard-metric-row-hide-button')).toHaveLength(0);
      expect(visibleWidth).toBeGreaterThan(0);
      expect(fullContentWidth).toBeGreaterThan(visibleWidth);
      expect(metricsViewport.getAttribute('data-horizontal-offset')).toBe('0');
      expect(metricsContent.getAttribute('data-horizontal-offset')).toBe('0');

      // We use a multiple-of-16 scroll amount because the dashboard intentionally
      // quantizes long-history scroll positions in 16px steps before deriving the
      // visible chart/table window. That keeps this assertion aligned with the
      // production geometry instead of relying on a lucky rounding result.
      await act(async () => {
        activeScrollRegion.scrollLeft = 160;
        fireEvent.scroll(activeScrollRegion);
      });
      await flushDashboardWork(2);

      expect(metricsViewport.getAttribute('data-horizontal-offset')).toBe('160');
      expect(metricsContent.getAttribute('data-horizontal-offset')).toBe('160');
      expect(within(metricsViewport).getByText('EBIT FY+1')).toBeTruthy();
      expect(metricRowLeftRails[0]).toBeTruthy();
    });

    // The same focused shell must also recover cleanly when the user leaves MAX
    // and returns to a fixed-length preset. In that preset world, horizontal
    // movement no longer means "scroll inside history" - it means "pan the month
    // window itself" - so the translated detail metrics content should snap back
    // to an internal horizontal offset of zero.
    it('resets the focused detail metrics horizontal offset when switching from MAX back to a fixed preset', async () => {
      const { user, scrollRegion } = await renderDashboard({
        payload: buildMetricsModePayload(),
        dashboardProps: {
          isFocusedMetricsMode: true,
        },
      });

      await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
      await flushDashboardWork();

      await configureScrollRegion(scrollRegion, 360);
      await flushDashboardWork();

      const mountedQueries = within(mountedContainer);

      await user.click(mountedQueries.getByRole('button', { name: 'MAX' }));
      await flushDashboardWork();

      const activeScrollRegion = screen.getAllByTestId('share-price-dashboard-scroll-region').at(-1);

      await act(async () => {
        activeScrollRegion.scrollLeft = 160;
        fireEvent.scroll(activeScrollRegion);
      });
      await flushDashboardWork(2);

      let metricsViewport = screen.getAllByTestId('share-price-dashboard-metrics-viewport').at(-1);
      let metricsContent = within(metricsViewport).getByTestId('share-price-dashboard-focused-metrics-content');

      expect(metricsViewport.getAttribute('data-horizontal-offset')).toBe('160');
      expect(metricsContent.getAttribute('data-horizontal-offset')).toBe('160');

      await user.click(mountedQueries.getByRole('button', { name: '5Y' }));
      await flushDashboardWork(2);

      metricsViewport = screen.getAllByTestId('share-price-dashboard-metrics-viewport').at(-1);
      metricsContent = within(metricsViewport).getByTestId('share-price-dashboard-focused-metrics-content');

      expect(screen.getAllByTestId('share-price-dashboard-scroll-region').at(-1).getAttribute('data-scroll-mode')).toBe('preset');
      expect(metricsViewport.getAttribute('data-horizontal-offset')).toBe('0');
      expect(metricsContent.getAttribute('data-horizontal-offset')).toBe('0');
      expect(within(metricsViewport).getByText('EBIT FY+1')).toBeTruthy();
    });
  });

  it('prevents the native context menu while still opening the metric editor', async () => {
    const { user } = await renderDashboard({
      payload: buildMetricsModePayload(),
      dashboardProps: {
        isFocusedMetricsMode: true,
      },
    });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const metricCell = getOverrideableMetricCell();
    expect(metricCell).toBeTruthy();

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });

    await act(async () => {
      metricCell.dispatchEvent(contextMenuEvent);
    });

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(screen.getByTestId('share-price-dashboard-metric-editor')).toBeTruthy();
    expect(screen.queryByTestId('share-price-dashboard-metric-row-action-menu')).toBeNull();
  });

  it('stops the metric cell context menu from bubbling to ancestors', async () => {
    const payload = buildMetricsModePayload();
    const deferredResponse = createDeferredResponse();
    const ancestorContextMenuSpy = vi.fn();

    fetchDashboardData.mockImplementation(() => deferredResponse.responsePromise);

    mountDashboard(
      <div onContextMenu={ancestorContextMenuSpy}>
        <SharePriceDashboard
          identifier="AAPL"
          name="AAPL name"
          scaleAnimationDurationMs={0}
        />
      </div>,
    );

    await act(async () => {
      deferredResponse.resolveResponse(payload);
      await deferredResponse.responsePromise;
      await Promise.resolve();
    });

    await flushDashboardWork();

    const mountedQueries = within(mountedContainer);
    await act(async () => {
      fireEvent.click(mountedQueries.getByRole('button', { name: 'ENTER METRICS' }));
    });
    await flushDashboardWork();

    const metricCell = getOverrideableMetricCell();
    expect(metricCell).toBeTruthy();

    await act(async () => {
      fireEvent.contextMenu(metricCell);
    });

    expect(ancestorContextMenuSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('share-price-dashboard-metric-editor')).toBeTruthy();
  });

  it('prevents the secondary-button mousedown on overrideable metric cells', async () => {
    const { user } = await renderDashboard({
      payload: buildMetricsModePayload(),
    });

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const metricCell = getOverrideableMetricCell();
    expect(metricCell).toBeTruthy();

    const mouseDownEvent = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });

    await act(async () => {
      metricCell.dispatchEvent(mouseDownEvent);
    });

    expect(mouseDownEvent.defaultPrevented).toBe(true);
  });

  it('renders SP currency above Share price and Reporting currency directly under the detail heading', async () => {
    const payload = buildMetricsModePayload({
      metricsRows: [
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
            {
              columnKey: 'annual-2025',
              value: 'GBP',
              sourceOfTruth: 'roic',
              isOverridden: false,
              isOverrideable: false,
              overrideTarget: null,
            },
          ],
        },
        ...buildMetricsModePayload().metricsRows,
      ],
    });
    const { user } = await renderDashboard({
      payload,
      dashboardProps: {
        isFocusedMetricsMode: true,
      },
    });

    const mainTableRails = screen.getAllByTestId('share-price-dashboard-main-table-row-left-rail');
    const priceCurrencyIndex = mainTableRails.findIndex((rowNode) => rowNode.getAttribute('data-row-key') === 'main::priceCurrency');
    const sharePriceIndex = mainTableRails.findIndex((rowNode) => rowNode.getAttribute('data-row-key') === 'main::annualData[].base.sharePrice');

    // This protects the stock-card reading order directly in the rendered rail,
    // so the pricing currency stays above the numeric share-price row.
    expect(priceCurrencyIndex).toBeGreaterThanOrEqual(0);
    expect(sharePriceIndex).toBeGreaterThanOrEqual(0);
    expect(priceCurrencyIndex).toBeLessThan(sharePriceIndex);
    expect(getMainTableRowLeftRail('main::priceCurrency')?.textContent).toContain('SP currency');
    expect(screen.getAllByText('USD').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'ENTER METRICS' }));
    await flushDashboardWork();

    const metricsViewport = screen.getAllByTestId('share-price-dashboard-metrics-viewport').at(-1);
    const metricRowLeftRails = within(metricsViewport).getAllByTestId('share-price-dashboard-metric-row-left-rail');
    const reportingCurrencyIndex = metricRowLeftRails.findIndex((rowNode) => rowNode.getAttribute('data-row-key') === '105::reportingCurrency');
    const firstNumericDetailIndex = metricRowLeftRails.findIndex((rowNode) => rowNode.getAttribute('data-row-key') === '710::annualData[].forecastData.fy1.ebit');

    // Reporting currency is stock metadata, so the focused metrics view should
    // show it immediately after the heading before the numeric detail rows start.
    expect(within(metricsViewport).getByText('DETAIL METRICS')).toBeTruthy();
    expect(reportingCurrencyIndex).toBe(0);
    expect(firstNumericDetailIndex).toBeGreaterThan(reportingCurrencyIndex);
    expect(within(metricsViewport).getByText('Reporting currency')).toBeTruthy();
    expect(within(metricsViewport).getAllByText('GBP').length).toBeGreaterThan(0);
  });

});

