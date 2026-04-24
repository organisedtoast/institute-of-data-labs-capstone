import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SectorChart from '../SectorChart';
import {
  ENHANCED_INTERNAL_SCROLLBAR_COLORS,
  ENHANCED_INTERNAL_SCROLLBAR_SIZE,
  ENHANCED_INTERNAL_SCROLLBAR_THUMB_BORDER,
  enhancedInternalScrollbarSx,
} from '../sharedScrollbarStyles.js';

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

vi.mock('@mui/material/Box', () => ({
  default: createMockComponent('div', ['sx']),
}));

vi.mock('@mui/material/Button', () => ({
  default: createMockComponent('button', ['size', 'sx', 'variant']),
}));

vi.mock('@mui/material/Typography', () => ({
  default: createMockComponent('div', ['align', 'color', 'component', 'gutterBottom', 'sx', 'variant']),
}));

// This mock intentionally keeps only the input behavior the tests need.
// MUI-specific layout props such as `fullWidth` are valid on the real
// component, but they should not be forwarded to a plain DOM `<input>` because
// React will warn about unknown attributes. We discard those props here.
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

let originalResizeObserver;

const baseProps = {
  series: [
    { date: '2024-01-01', close: 100 },
    { date: '2024-02-01', close: 115 },
    { date: '2024-03-01', close: 125 },
  ],
  startDate: '2024-01',
  endDate: '2024-03',
  onStartDateChange: vi.fn(),
  onEndDateChange: vi.fn(),
  minAvailableMonth: '2024-01',
  maxAvailableMonth: '2024-03',
  activePreset: '1Y',
  onApplyMaxRange: vi.fn(),
  onApplyTrailingRange: vi.fn(),
};

function buildMonthlySeries(startYear, endYear) {
  const rows = [];

  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      rows.push({
        date: `${year}-${String(month).padStart(2, '0')}-01`,
        close: 80 + ((year - startYear) * 6) + month,
      });
    }
  }

  return rows;
}

beforeEach(() => {
  originalResizeObserver = global.ResizeObserver;
  global.ResizeObserver = undefined;
});

afterEach(() => {
  global.ResizeObserver = originalResizeObserver;
  vi.clearAllMocks();
});

describe('SectorChart', () => {
  it('renders a controlled series with whole-number y-axis labels', async () => {
    render(<SectorChart {...baseProps} />);

    const svg = await screen.findByTestId('sector-chart-svg');
    expect(svg).toBeTruthy();

    const yAxisLabels = screen.getAllByTestId('sector-chart-y-axis-label');
    expect(yAxisLabels.length).toBeGreaterThan(0);

    yAxisLabels.forEach((labelNode) => {
      expect(labelNode.textContent).not.toMatch(/\$/);
      expect(labelNode.textContent).not.toMatch(/\.\d/);
    });

    const xAxisLabels = screen.getAllByTestId('sector-chart-x-axis-label');
    expect(xAxisLabels.length).toBeGreaterThan(0);
    expect(xAxisLabels[0].textContent).toBe('2024');
  });

  it('shows a custom invalid range message for reversed month inputs', async () => {
    render(
      <SectorChart
        {...baseProps}
        startDate="2024-03"
        endDate="2024-01"
        invalidRangeMessage="Range is invalid."
      />,
    );

    expect(await screen.findByText('Range is invalid.')).toBeTruthy();
  });

  it('shows a custom empty state message when the series is empty', async () => {
    render(
      <SectorChart
        {...baseProps}
        series={[]}
        emptyRangeMessage="No constituents are active in this range."
      />,
    );

    expect(await screen.findByText('No constituents are active in this range.')).toBeTruthy();
  });

  it('maps preset scroll movement into a month pan callback', async () => {
    const onPresetPanOffsetChange = vi.fn();

    render(
      <SectorChart
        {...baseProps}
        isPresetWindowMode
        maxPresetPanOffset={6}
        presetPanOffsetMonths={0}
        onPresetPanOffsetChange={onPresetPanOffsetChange}
      />,
    );

    const scrollRegion = await screen.findByTestId('sector-chart-scroll-region');
    scrollRegion.scrollLeft = 56;
    fireEvent.scroll(scrollRegion);

    expect(onPresetPanOffsetChange).toHaveBeenCalledWith(4);
  });

  it('marks the sector chart scroller with the shared enhanced scrollbar contract', async () => {
    // This protects the shared scrollbar rule itself, not the chart math.
    render(<SectorChart {...baseProps} isPresetWindowMode maxPresetPanOffset={6} presetPanOffsetMonths={0} />);

    const scrollRegion = await screen.findByTestId('sector-chart-scroll-region');
    expect(scrollRegion.getAttribute('data-scrollbar-style')).toBe('enhanced');
  });

  it('publishes a visibly wider shared scrollbar size contract', () => {
    // The older test only proved the chart opted into the shared rule.
    // This one protects the actual width values so "styled but not wider"
    // cannot sneak back in during a future refactor.
    expect(enhancedInternalScrollbarSx['@supports selector(::-webkit-scrollbar)']['&::-webkit-scrollbar'].width).toBe(ENHANCED_INTERNAL_SCROLLBAR_SIZE);
    expect(enhancedInternalScrollbarSx['@supports selector(::-webkit-scrollbar)']['&::-webkit-scrollbar'].height).toBe(ENHANCED_INTERNAL_SCROLLBAR_SIZE);
    expect(enhancedInternalScrollbarSx['@supports selector(::-webkit-scrollbar)']['&::-webkit-scrollbar-thumb'].border).toBe(ENHANCED_INTERNAL_SCROLLBAR_THUMB_BORDER);
    expect(enhancedInternalScrollbarSx['@supports not selector(::-webkit-scrollbar)'].scrollbarWidth).toBe('auto');
    expect(enhancedInternalScrollbarSx['@supports not selector(::-webkit-scrollbar)'].scrollbarColor).toBe(ENHANCED_INTERNAL_SCROLLBAR_COLORS);
  });

  it('uses a sticky left rail for the Y-axis during preset scrolling', async () => {
    render(
      <SectorChart
        {...baseProps}
        isPresetWindowMode
        maxPresetPanOffset={6}
        presetPanOffsetMonths={0}
      />,
    );

    const scrollRegion = await screen.findByTestId('sector-chart-scroll-region');
    const yAxisRail = screen.getByTestId('sector-chart-y-axis-rail');
    const yAxisLabels = screen.getAllByTestId('sector-chart-y-axis-label');
    const visibleSurface = screen.getByTestId('sector-chart-visible-surface');
    const svg = screen.getByTestId('sector-chart-svg');

    expect(scrollRegion).toBeTruthy();
    expect(yAxisLabels.length).toBeGreaterThan(0);
    expect(yAxisRail.getAttribute('data-sticky-behavior')).toBe('left-rail');
    expect(visibleSurface.contains(yAxisRail)).toBe(true);
    expect(visibleSurface.contains(svg)).toBe(true);
    expect(yAxisRail.nextElementSibling?.contains(svg)).toBe(true);
  });

  it('renders calendar-year x-axis labels from January positions', async () => {
    render(
      <SectorChart
        {...baseProps}
        series={buildMonthlySeries(2022, 2025)}
        startDate="2022-01"
        endDate="2025-12"
        minAvailableMonth="2022-01"
        maxAvailableMonth="2025-12"
      />,
    );

    const xAxisLabels = await screen.findAllByTestId('sector-chart-x-axis-label');
    const renderedYears = xAxisLabels.map((labelNode) => labelNode.textContent);

    expect(renderedYears).toContain('2022');
    expect(renderedYears).toContain('2023');
    expect(renderedYears).toContain('2024');
    expect(renderedYears).toContain('2025');
  });

  it('filters long-range calendar-year x-axis labels for readability', async () => {
    render(
      <SectorChart
        {...baseProps}
        series={buildMonthlySeries(2010, 2025)}
        startDate="2010-01"
        endDate="2025-12"
        minAvailableMonth="2010-01"
        maxAvailableMonth="2025-12"
      />,
    );

    const xAxisLabels = await screen.findAllByTestId('sector-chart-x-axis-label');
    const renderedYears = xAxisLabels.map((labelNode) => labelNode.textContent);

    expect(renderedYears).toContain('2010');
    expect(renderedYears).toContain('2025');
    expect(renderedYears.length).toBeLessThan(16);
  });

  it('filters the rendered series to the visible month range before building axis labels', async () => {
    render(
      <SectorChart
        {...baseProps}
        series={buildMonthlySeries(2022, 2025)}
        startDate="2024-01"
        endDate="2024-12"
        minAvailableMonth="2022-01"
        maxAvailableMonth="2025-12"
      />,
    );

    const xAxisLabels = await screen.findAllByTestId('sector-chart-x-axis-label');
    const renderedYears = xAxisLabels.map((labelNode) => labelNode.textContent);

    expect(renderedYears).toEqual(['2024']);
  });

  it('keeps the shared hover tooltip fully inside the chart near both x-axis edges', async () => {
    render(<SectorChart {...baseProps} />);

    const svg = await screen.findByTestId('sector-chart-svg');
    const [, , contentWidthText] = svg.getAttribute('viewBox').split(' ');
    const contentWidth = Number(contentWidthText);
    const plotWidth = contentWidth - 16;

    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: contentWidth,
        height: 360,
        right: contentWidth,
        bottom: 360,
      }),
    });

    // This protects the real bug: near-edge hovers used to clamp the box but
    // leave the text behind, which let the tooltip content get clipped.
    await fireEvent.mouseMove(svg, { clientX: 1, clientY: 140 });

    const leftHoverBox = screen.getByTestId('time-series-chart-hover-box');
    const leftHoverLabel = screen.getByTestId('time-series-chart-hover-label');
    const leftHoverValue = screen.getByTestId('time-series-chart-hover-value');
    const leftBoxX = Number(leftHoverBox.getAttribute('x'));
    const leftBoxWidth = Number(leftHoverBox.getAttribute('width'));
    const leftLabelX = Number(leftHoverLabel.getAttribute('x'));
    const leftValueX = Number(leftHoverValue.getAttribute('x'));

    expect(leftHoverLabel.textContent).toBe('Jan 2024');
    expect(leftHoverValue.textContent).toBe('100');
    expect(leftBoxX).toBeGreaterThanOrEqual(0);
    expect(leftBoxX + leftBoxWidth).toBeLessThanOrEqual(plotWidth);
    expect(leftLabelX).toBeGreaterThanOrEqual(leftBoxX);
    expect(leftLabelX).toBeLessThanOrEqual(leftBoxX + leftBoxWidth);
    expect(leftValueX).toBeGreaterThanOrEqual(leftBoxX);
    expect(leftValueX).toBeLessThanOrEqual(leftBoxX + leftBoxWidth);

    await fireEvent.mouseMove(svg, { clientX: plotWidth - 1, clientY: 140 });

    const rightHoverBox = screen.getByTestId('time-series-chart-hover-box');
    const rightHoverLabel = screen.getByTestId('time-series-chart-hover-label');
    const rightHoverValue = screen.getByTestId('time-series-chart-hover-value');
    const rightBoxX = Number(rightHoverBox.getAttribute('x'));
    const rightBoxWidth = Number(rightHoverBox.getAttribute('width'));
    const rightLabelX = Number(rightHoverLabel.getAttribute('x'));
    const rightValueX = Number(rightHoverValue.getAttribute('x'));

    expect(rightHoverLabel.textContent).toBe('Mar 2024');
    expect(rightHoverValue.textContent).toBe('125');
    expect(rightBoxX).toBeGreaterThanOrEqual(0);
    expect(rightBoxX + rightBoxWidth).toBeLessThanOrEqual(plotWidth);
    expect(rightLabelX).toBeGreaterThanOrEqual(rightBoxX);
    expect(rightLabelX).toBeLessThanOrEqual(rightBoxX + rightBoxWidth);
    expect(rightValueX).toBeGreaterThanOrEqual(rightBoxX);
    expect(rightValueX).toBeLessThanOrEqual(rightBoxX + rightBoxWidth);
  });
});
