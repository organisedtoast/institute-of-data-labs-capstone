import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SharePriceDashboard from '../SharePriceDashboard';
import {
  fetchDashboardData,
  updateDashboardInvestmentCategory,
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
  return function MockComponent({ children, ...props }) {
    const forwardedProps = { ...props };

    omittedPropNames.forEach((propName) => {
      delete forwardedProps[propName];
    });

    if (tagName === 'button' && !forwardedProps.type) {
      forwardedProps.type = 'button';
    }

    return React.createElement(tagName, forwardedProps, children);
  };
}

vi.mock('../../services/watchlistDashboardApi', () => ({
  fetchDashboardData: vi.fn(),
  updateDashboardInvestmentCategory: vi.fn(),
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

vi.mock('@mui/material/TextField', () => ({
  default: function MockTextField({
    InputLabelProps,
    inputProps,
    label,
    size,
    sx,
    ...props
  }) {
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
let currentMatchMediaWidth = 1024;
let mountedContainer;
let mountedRoot;
let pendingAnimationFrameHandles = new Set();

function setViewportWidth(width) {
  currentMatchMediaWidth = width;
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
    ...overrides,
  };
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
    window.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
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

// The dashboard still has async data loading, passive effects, and a preset
// bootstrap rAF. Once scale animation is disabled through the injected prop,
// one short macrotask turn plus surrounding microtasks is enough to settle it.
async function flushDashboardWork() {
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

function mountDashboard(ui) {
  mountedContainer = document.createElement('div');
  document.body.appendChild(mountedContainer);
  mountedRoot = createRoot(mountedContainer);
  flushSync(() => {
    mountedRoot.render(ui);
  });

  return {
    rerender(nextUi) {
      flushSync(() => {
        mountedRoot.render(nextUi);
      });
    },
  };
}

// This shared helper keeps the repetitive render/setup work in one place so
// each test can focus on one user-facing behavior.
async function renderDashboard(options = {}) {
  const {
    identifier = 'AAPL',
    isRemovable = false,
    name = `${identifier} name`,
    payload = buildDashboardPayload(),
  } = options;

  const deferredResponse = createDeferredResponse();

  // Releasing the API response after mount keeps the async data load separate
  // from the initial render, which makes the component test much more stable.
  fetchDashboardData.mockImplementation(() => deferredResponse.responsePromise);

  const user = userEvent.setup();

  const renderResult = mountDashboard(
    <SharePriceDashboard
      identifier={identifier}
      isRemovable={isRemovable}
      name={name}
      scaleAnimationDurationMs={0}
    />,
  );

  const startInput = screen.getByLabelText('Start month');
  const endInput = screen.getByLabelText('End month');

  await act(async () => {
    deferredResponse.resolveResponse(payload);
    await deferredResponse.responsePromise;
    await Promise.resolve();
  });

  await flushDashboardWork();

  const scrollRegion = screen.getByTestId(DASHBOARD_TEST_ID);
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
    fireEvent.scroll(scrollRegion);
    window.dispatchEvent(new Event('resize'));
  });

  await flushDashboardWork();
  await flushDashboardWork();
}

// Each `it(...)` block below describes one user-facing preset-scroll scenario.
// Together they protect the first-load scrollbar position and the month-range
// updates that should happen when a user drags through history.
describe('SharePriceDashboard preset scrolling', () => {
  beforeEach(() => {
    fetchDashboardData.mockReset();
    updateDashboardInvestmentCategory.mockReset();
    updateDashboardInvestmentCategory.mockResolvedValue({
      identifier: 'AAPL',
      investmentCategory: 'Mature Compounder',
    });
    pendingAnimationFrameHandles = new Set();

    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalMatchMedia = window.matchMedia;

    window.matchMedia = (query) => {
      const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/);
      const matches = maxWidthMatch ? currentMatchMediaWidth <= Number(maxWidthMatch[1]) : false;

      return {
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    };

    window.requestAnimationFrame = (callback) => {
      const handle = window.setTimeout(() => {
        pendingAnimationFrameHandles.delete(handle);
        callback(window.performance.now());
      }, 0);
      pendingAnimationFrameHandles.add(handle);
      return handle;
    };

    window.cancelAnimationFrame = (handle) => {
      pendingAnimationFrameHandles.delete(handle);
      window.clearTimeout(handle);
    };

    globalThis.requestAnimationFrame = window.requestAnimationFrame;
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
  });

  afterEach(() => {
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

    pendingAnimationFrameHandles.forEach((handle) => {
      window.clearTimeout(handle);
    });
    pendingAnimationFrameHandles.clear();

    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    window.matchMedia = originalMatchMedia;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.restoreAllMocks();
    currentMatchMediaWidth = 1024;
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

  it('shows the current investment category next to Remove stock and updates it from the dropdown', async () => {
    const { user } = await renderDashboard({ isRemovable: true });

    const categorySelect = screen.getByLabelText('Investment Category');

    expect(categorySelect.value).toBe('Profitable Hi Growth');
    expect(screen.getByRole('button', { name: 'Remove stock' })).toBeTruthy();

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

  it('renders chart-only fiscal-year bands aligned with the visible table columns', async () => {
    setViewportWidth(1024);

    const { user } = await renderDashboard();

    await user.click(screen.getByRole('button', { name: '10Y' }));
    await flushDashboardWork();

    const fiscalBands = screen.getAllByTestId('share-price-dashboard-fiscal-band');
    const headerCells = screen.getAllByTestId('share-price-dashboard-header-cell');

    expect(fiscalBands).toHaveLength(headerCells.length);

    fiscalBands.forEach((bandNode, index) => {
      expect(bandNode.getAttribute('data-fiscal-year')).toBe(headerCells[index].getAttribute('data-fiscal-year'));
      expect(Number(bandNode.getAttribute('data-center-x'))).toBeCloseTo(
        Number(headerCells[index].getAttribute('data-center-x')),
        6,
      );
      expect(Number(bandNode.getAttribute('data-width'))).toBeCloseTo(
        Number(headerCells[index].getAttribute('data-cell-width')),
        6,
      );
    });

    expect(fiscalBands.some((bandNode) => bandNode.getAttribute('data-is-alternate') === 'true')).toBe(true);
    expect(fiscalBands.some((bandNode) => bandNode.getAttribute('data-is-alternate') === 'false')).toBe(true);
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
