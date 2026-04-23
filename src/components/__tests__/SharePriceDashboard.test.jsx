import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SharePriceDashboard from '../SharePriceDashboard';
import {
  fetchDashboardData,
  updateDashboardMetricOverride,
  updateDashboardInvestmentCategory,
  updateDashboardRowPreference,
} from '../../services/watchlistDashboardApi';
import {
  buildRoundedChartScale,
  formatYAxisPrice,
  getPreferredTickCount,
} from '../sharePriceChartScale';

// This test relies on the following libraries:
// - React Testing Library: for rendering the component and simulating user interactions in a way that resembles real usage.
// - Vitest: for structuring the test suite, making assertions, and mocking dependencies like axios.
// - A custom mock implementation for MUI components: to avoid rendering complex UI elements that are not relevant to the test scenarios.

// This file holds component-specific regression tests for SharePriceDashboard.
// We created this test because the stock dashboard has an easy-to-break user
// interaction: preset buttons like 1M, 1Y, and 5Y must choose the correct date
// range, place the horizontal scrollbar in the correct starting position, and
// keep the month inputs updated while the user scrolls backward through older
// history. That combination is hard to trust by eye alone, so we capture it in
// an automated test file that can warn us when a future code change breaks it.
//
// The `__tests__` folder name is a common convention for keeping tests close
// to the feature they verify. A beginner can think of it as: "this is the test
// folder that belongs to this part of the app." This file lives next to the
// dashboard area because it is specifically protecting dashboard behavior.
//
// This repo also has a separate `src/test/` folder. That folder is for shared
// test infrastructure used by many test files, such as setup code and browser
// fallbacks. In short:
// - `src/components/__tests__/` = the actual component test scenarios
// - `src/test/` = shared support code that helps all tests run
//
// If this test succeeds, that means we have evidence that the dashboard still
// behaves the way a user expects in the checked scenarios. For example, the
// default preset still opens correctly, the scrollbar still starts at the
// newest available position, and dragging backward still updates the month
// inputs the way the UI promises.
//
// If this test fails, it usually means one of those user-facing behaviors has
// regressed. A failure might mean the wrong date range is shown, the scrollbar
// is starting in the wrong place, preset scrolling stopped updating the month
// fields, or switching stocks/presets no longer resets the dashboard properly.
// In other words, a failure is a clue that something meaningful changed in the
// behavior of the feature, not just that "the test is unhappy."
//
// To run just this file, use:
// `npm run test:ui -- src/components/__tests__/SharePriceDashboard.test.jsx`

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

// This mock keeps TextField behavior beginner-friendly and DOM-simple:
// the tests only need a label plus a plain input they can type into.
// Real MUI TextField accepts layout props like `fullWidth`, but a raw DOM
// `<input>` does not. If we forward those MUI-only props into the DOM, React
// warns even though the production component is correct, so we strip them here.
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

// The component normally fetches a large backend payload. Keeping a local test
// payload makes the regression deterministic and easier for a beginner to follow.
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

  return {
    identifier: 'AAPL',
    companyName: 'Apple Inc.',
    investmentCategory: 'Profitable Hi Growth',
    priceCurrency: 'USD',
    prices,
    annualMetrics,
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
// This helper gives the test a controllable width and scroll position so we can
// simulate panning to older history without relying on a browser layout engine.
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

// The dashboard does not finish all of its work in one synchronous render.
// One user action can fan out into:
// - promise work from the mocked API
// - microtask-backed requestAnimationFrame callbacks from our browser shim
// - one real timer yield so "wait until the next task" code can finish
//
// This helper is not a substitute for `act(...)`. Its job starts *after* the
// test has already entered React correctly through `act(...)`. A beginner
// should think of it as: "give React and the fake browser a few chances to
// settle before checking the final UI."
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

// These browser shims make JSDOM look enough like a real browser for this
// component's layout logic. We keep them in one place because the same rules
// must apply to both the preset tests and the metrics tests.
function installDashboardBrowserShims() {
  pendingAnimationFrameHandles = new Set();
  nextAnimationFrameHandle = 1;

  originalRequestAnimationFrame = window.requestAnimationFrame;
  originalCancelAnimationFrame = window.cancelAnimationFrame;
  originalMatchMedia = window.matchMedia;
  originalResizeObserver = global.ResizeObserver;
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

// Cleanup is just as important as setup. If a beginner removes this and leaves
// one test's custom browser shims active for the next test, the resulting
// failures look random even though the real problem is shared test state.
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
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  vi.restoreAllMocks();
  currentMatchMediaWidth = 1024;
  activeResizeObservers = [];
  matchMediaListenerRegistry = new Map();
}

// We keep using `createRoot` instead of RTL's `render()` because earlier
// experiments showed that RTL's React 19 path hangs for this component stack.
// The important beginner rule is: even with `createRoot`, mounting and rerendering
// still have to happen inside `act(...)` so React can flush the work safely.
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

// This shared helper keeps the repetitive render/setup work in one place so
// each test can focus on one user-facing behavior.
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

// Row-hiding now belongs to the frozen left rail instead of the annual-value
// cells or a separate button. This helper keeps the row-label lookup readable.
function getMetricRowLeftRail(rowKey = '710::annualData[].forecastData.fy1.ebit') {
  return screen.getAllByTestId('share-price-dashboard-metric-row-left-rail').find((rowNode) => {
    return rowNode.getAttribute('data-row-key') === rowKey;
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

  it('shows the current investment category next to Remove stock and updates it from the dropdown', async () => {
    setViewportWidth(420);

    const { user } = await renderDashboard({ isRemovable: true });

    const categorySelect = screen.getByLabelText('Investment Category');
    const removeStockButton = screen.getByRole('button', { name: 'Remove stock' });
    const investmentCategoryRow = screen.getByTestId('share-price-dashboard-investment-category-row');
    const removeStockRow = screen.getByTestId('share-price-dashboard-remove-stock-row');

    expect(categorySelect.value).toBe('Profitable Hi Growth');
    expect(removeStockButton).toBeTruthy();
    expect(within(removeStockRow).getByRole('button', { name: 'Remove stock' })).toBe(removeStockButton);
    expect(within(investmentCategoryRow).queryByRole('button', { name: 'Remove stock' })).toBeNull();

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
        expect(screen.getByRole('button', { name: 'SHOW METRICS' })).toBeTruthy();

        // Phase 2: open metrics and give React/browser follow-up work time to
        // settle through the shared helper.
        await user.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
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

  it('opens one annual metrics table, keeps non-empty rows visible, and places empty rows under hidden rows', async () => {
    const { user } = await renderDashboard({
      payload: buildMetricsModePayload(),
    });

    expect(screen.queryByText('DETAIL METRICS')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
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
    expect(screen.getByText('$12.00')).not.toBeNull();
    expect(screen.getByText('$18.00')).not.toBeNull();
    expect(screen.getByText('$24.00')).not.toBeNull();
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
                value: 1250000000.99,
                sourceOfTruth: 'system',
                isOverridden: false,
                isOverrideable: true,
                overrideTarget: { kind: 'annual', fiscalYear: 2023, payloadPath: 'forecastData.fy1.ebit' },
              },
              {
                columnKey: 'annual-2024',
                value: 2400000.99,
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
        ],
      }),
    });

    await user.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
    await flushDashboardWork();

    expect(screen.getByText('$1.3B')).not.toBeNull();
    expect(screen.getByText('$2.4M')).not.toBeNull();
    expect(screen.getByText('$3.8K')).not.toBeNull();
    expect(screen.queryByText('$1,250,000,000.99')).toBeNull();
    expect(screen.queryByText('$2,400,000.99')).toBeNull();
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

    await user.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
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

    await user.click(screen.getByTestId('share-price-dashboard-metric-row-hide-action'));
    await flushDashboardWork();

    expect(updateDashboardRowPreference).toHaveBeenCalledWith(
      'AAPL',
      '710::annualData[].forecastData.fy1.ebit',
      false,
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

  it('opens the left-rail row action menu from a touch long press', async () => {
    await renderDashboard({
      payload: buildMetricsModePayload(),
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
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

    expect(screen.getByTestId('share-price-dashboard-metric-row-action-menu')).toBeTruthy();

    await act(async () => {
      fireEvent.touchEnd(metricRowLeftRail, { touches: [] });
    });
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

    await user.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
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

  // This subsection protects the family of React loop bugs that previously froze
  // the stock cards. The historical failure chain looked like this:
  // 1. the user pressed SHOW METRICS
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
    it('does not warn when SHOW METRICS updates parent focus state', async () => {
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
        expect(mountedQueries.getByRole('button', { name: 'SHOW METRICS' })).toBeTruthy();

        // Phase 2: pressing SHOW METRICS asks the parent to flip into focused
        // mode. We use three turns here because this path includes the parent
        // state update plus the dashboard's animated follow-up effects.
        await user.click(mountedQueries.getByRole('button', { name: 'SHOW METRICS' }));
        await flushDashboardWork(3);

        // Phase 3: both the parent-owned state and the user-facing button label
        // should show that focused mode finished cleanly.
        expect(mountedQueries.getByTestId('share-price-dashboard-parent-focus-state').textContent).toBe('focused');
        expect(mountedQueries.getByRole('button', { name: 'HIDE METRICS' })).toBeTruthy();
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
        await user.click(mountedQueries.getByRole('button', { name: 'SHOW METRICS' }));
        await flushDashboardWork(3);

        const labelsBeforeParentRerenders = getRenderedYAxisLabelTexts(mountedQueries);

        expect(labelsBeforeParentRerenders.length).toBeGreaterThan(0);
        expect(mountedQueries.getByRole('button', { name: 'HIDE METRICS' })).toBeTruthy();

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
        expect(mountedQueries.getByRole('button', { name: 'HIDE METRICS' })).toBeTruthy();
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
        await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'SHOW METRICS' }));
        await flushDashboardWork(4);
        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeNull();
        expect(within(getDashboardCard('AAPL')).getByRole('button', { name: 'HIDE METRICS' })).toBeTruthy();

        // Phase 3: hide AAPL metrics so both cards remount.
        await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'HIDE METRICS' }));
        await flushDashboardWork(4);
        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeTruthy();

        // Phase 4: repeat the same flow with MSFT.
        await user.click(within(getDashboardCard('MSFT')).getByRole('button', { name: 'SHOW METRICS' }));
        await flushDashboardWork(4);
        expect(getDashboardCard('AAPL')).toBeNull();
        expect(getDashboardCard('MSFT')).toBeTruthy();
        expect(within(getDashboardCard('MSFT')).getByRole('button', { name: 'HIDE METRICS' })).toBeTruthy();

        // Phase 5: restore both cards once more to prove the remount path stays
        // safe after a second handoff.
        await user.click(within(getDashboardCard('MSFT')).getByRole('button', { name: 'HIDE METRICS' }));
        await flushDashboardWork(4);
        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeTruthy();

        // Phase 6: focus AAPL again. The earlier bug could build up over
        // repeated cycles, so this final repeat guards the cumulative case.
        await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'SHOW METRICS' }));
        await flushDashboardWork(4);
        expect(getDashboardCard('AAPL')).toBeTruthy();
        expect(getDashboardCard('MSFT')).toBeNull();
        expect(within(getDashboardCard('AAPL')).getByRole('button', { name: 'HIDE METRICS' })).toBeTruthy();
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
        await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'SHOW METRICS' }));
        await flushDashboardWork(4);
        await user.click(within(getDashboardCard('AAPL')).getByRole('button', { name: 'HIDE METRICS' }));
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
        await user.click(within(getDashboardCard('MSFT')).getByRole('button', { name: 'SHOW METRICS' }));
        await flushDashboardWork(4);

        expect(getDashboardCard('AAPL')).toBeNull();
        expect(getDashboardCard('MSFT')).toBeTruthy();
        expect(within(getDashboardCard('MSFT')).getByRole('button', { name: 'HIDE METRICS' })).toBeTruthy();
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
        await user.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
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

      await user.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
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

      await user.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
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

    await user.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
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
      fireEvent.click(mountedQueries.getByRole('button', { name: 'SHOW METRICS' }));
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

    await user.click(screen.getByRole('button', { name: 'SHOW METRICS' }));
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

});
