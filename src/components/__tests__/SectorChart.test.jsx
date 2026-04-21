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

vi.mock('@mui/material/TextField', () => ({
  default: function MockTextField({
    InputLabelProps,
    inputProps,
    label,
    ...props
  }) {
    void InputLabelProps;

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
});
