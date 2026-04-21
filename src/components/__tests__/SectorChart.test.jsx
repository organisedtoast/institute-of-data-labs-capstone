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

let originalResizeObserver;

beforeEach(() => {
  originalResizeObserver = global.ResizeObserver;
  global.ResizeObserver = undefined;
});

afterEach(() => {
  global.ResizeObserver = originalResizeObserver;
});

describe('SectorChart', () => {
  it('renders through the custom svg chart core with whole-number y-axis labels and no fiscal overlays', async () => {
    render(<SectorChart />);

    const svg = await screen.findByTestId('sector-chart-svg');
    expect(svg).toBeTruthy();
    expect(screen.queryByTestId('share-price-dashboard-fiscal-band')).toBeNull();
    expect(screen.queryByTestId('share-price-dashboard-fiscal-tick')).toBeNull();
    expect(screen.queryByTestId('share-price-dashboard-fiscal-watermark')).toBeNull();

    const yAxisLabels = screen.getAllByTestId('sector-chart-y-axis-label');
    expect(yAxisLabels.length).toBeGreaterThan(0);

    yAxisLabels.forEach((labelNode) => {
      expect(labelNode.textContent).not.toMatch(/\$/);
      expect(labelNode.textContent).not.toMatch(/\.\d/);
    });
  });

  it('shows whole-number hover values without currency formatting', async () => {
    render(<SectorChart />);

    const svg = await screen.findByTestId('sector-chart-svg');
    svg.getBoundingClientRect = vi.fn(() => ({
      width: 540,
      left: 0,
      top: 0,
      right: 540,
      bottom: 360,
      height: 360,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    fireEvent.mouseMove(svg, { clientX: 240 });

    expect(svg.textContent).not.toMatch(/\$/);
    expect(svg.textContent).not.toMatch(/\d+\.\d+/);
  });

  it('keeps the invalid range state', async () => {
    render(<SectorChart />);

    const startInput = await screen.findByLabelText('Start month');
    const endInput = screen.getByLabelText('End month');

    fireEvent.change(startInput, { target: { value: '2026-03' } });
    fireEvent.change(endInput, { target: { value: '2025-01' } });

    expect(screen.getByText('Start month must be earlier than or equal to end month.')).toBeTruthy();
  });

  it('keeps the empty range state', async () => {
    render(<SectorChart />);

    const startInput = await screen.findByLabelText('Start month');
    const endInput = screen.getByLabelText('End month');

    fireEvent.change(startInput, { target: { value: '2010-01' } });
    fireEvent.change(endInput, { target: { value: '2010-02' } });

    expect(screen.getByText('No sector chart data matches the selected month range.')).toBeTruthy();
  });
});
