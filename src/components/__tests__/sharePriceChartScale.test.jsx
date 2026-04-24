import { describe, expect, it } from 'vitest';

import { buildRoundedChartScale, formatYAxisPrice } from '../sharePriceChartScale';

// This file tests the small chart-scale helper directly. That gives us a fast,
// focused way to verify the Y-axis math without needing to mount the full stock
// dashboard UI every time we change the scale logic.
describe('sharePriceChartScale', () => {
  it('builds a larger rounded axis with more than three ticks', () => {
    const scale = buildRoundedChartScale(121, 188);

    expect(scale.minPrice).toBe(100);
    expect(scale.maxPrice).toBe(200);
    expect(scale.step).toBe(20);
    expect(scale.ticks).toEqual([100, 120, 140, 160, 180, 200]);
  });

  it('keeps evenly spaced rounded ticks for medium price ranges', () => {
    const scale = buildRoundedChartScale(8.3, 12.7);

    expect(scale.step).toBe(2);
    expect(scale.ticks).toEqual([6, 8, 10, 12, 14, 16]);
  });

  it('keeps readable decimal ticks for small price ranges', () => {
    const scale = buildRoundedChartScale(0.31, 0.47);

    expect(scale.step).toBe(0.05);
    expect(scale.ticks).toEqual([0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55]);
  });

  it('still returns a valid multi-tick axis for a flat range', () => {
    const scale = buildRoundedChartScale(42, 42);

    expect(scale.ticks.length).toBeGreaterThan(3);
    expect(scale.step).toBe(2);
    expect(scale.ticks).toEqual([36, 38, 40, 42, 44, 46, 48]);
  });

  it('formats Y-axis prices with only the decimals the rounded step needs', () => {
    // The stock chart keeps the same decimal rules, but it no longer assumes
    // the visible values should always show a USD symbol.
    expect(formatYAxisPrice(12.5, [7.5, 10, 12.5, 15, 17.5])).toBe('12.5');
    expect(formatYAxisPrice(0.4, [0.25, 0.3, 0.35, 0.4, 0.45, 0.5])).toBe('0.40');
    expect(formatYAxisPrice(160, [100, 120, 140, 160, 180, 200])).toBe('160');
  });
});
