import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SectorChart from '../SectorChart';

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
});
