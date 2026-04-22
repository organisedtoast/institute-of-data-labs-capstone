// Purpose of this test file:
// These tests protect the small data-shaping helpers used by the investment
// category cards feature. They verify how daily prices are condensed into
// monthly points, how individual stocks are re-indexed for fair comparison,
// how multiple constituents are averaged into one aggregate series, and how
// the default visible month range is chosen.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAggregateSeries,
  buildIndexedSeriesForStock,
  convertDailyPricesToMonthlyPrices,
  getTrailingMonthRange,
} = require("../services/investmentCategoryCardsService");

test("convertDailyPricesToMonthlyPrices keeps the last trading day of each month", () => {
  // The raw price feed is daily, but the category chart works with one point
  // per month. This helper should keep the final trading day we saw inside
  // each month, because that best represents the month-end close.
  const monthlyPrices = convertDailyPricesToMonthlyPrices([
    { date: "2024-01-02", close: 10 },
    { date: "2024-01-31", close: 12 },
    { date: "2024-02-01", close: 13 },
    { date: "2024-02-29", close: 14 },
  ]);

  // January keeps 31 Jan instead of 2 Jan, and February keeps 29 Feb instead
  // of 1 Feb. That proves the function is taking the last seen trading day in
  // each month, not the first.
  assert.deepEqual(monthlyPrices, [
    { month: "2024-01", date: "2024-01-31", close: 12 },
    { month: "2024-02", date: "2024-02-29", close: 14 },
  ]);
});

test("buildIndexedSeriesForStock reindexes the first visible month to 100", () => {
  // Indexing lets us compare stocks with very different share prices on the
  // same chart. The first visible month becomes the common starting point of
  // 100, and later months are scaled relative to that base.
  const indexedSeries = buildIndexedSeriesForStock(
    [
      { month: "2024-01", date: "2024-01-31", close: 20 },
      { month: "2024-02", date: "2024-02-29", close: 25 },
      { month: "2024-03", date: "2024-03-28", close: 30 },
    ],
    ["2024-01", "2024-02", "2024-03"]
  );

  // If January is the base month at 20, then:
  // - 20 becomes 100
  // - 25 becomes 125
  // - 30 becomes 150
  // This makes performance easier to compare than using raw dollar prices.
  assert.deepEqual(indexedSeries, [
    { month: "2024-01", date: "2024-01-31", indexedValue: 100 },
    { month: "2024-02", date: "2024-02-29", indexedValue: 125 },
    { month: "2024-03", date: "2024-03-28", indexedValue: 150 },
  ]);
});

test("buildIndexedSeriesForStock excludes a stock when the first visible month is missing", () => {
  // A stock is not allowed into the indexed comparison if it is missing the
  // first month in the visible window. Otherwise it would join the chart late
  // and unfairly distort the comparison.
  const indexedSeries = buildIndexedSeriesForStock(
    [
      { month: "2024-02", date: "2024-02-29", close: 25 },
      { month: "2024-03", date: "2024-03-28", close: 30 },
    ],
    ["2024-01", "2024-02", "2024-03"]
  );

  // Returning `null` is the service's way of saying:
  // "do not include this stock in the indexed chart for this window".
  assert.equal(indexedSeries, null);
});

test("buildAggregateSeries averages active indexed constituents equally", () => {
  // Each constituent already has an indexed monthly series.
  // The aggregate category line should give each active stock equal weight and
  // average their indexed values month by month.
  const aggregateSeries = buildAggregateSeries(
    [
      {
        indexedSeriesByMonth: new Map([
          ["2024-01", 100],
          ["2024-02", 125],
          ["2024-03", 150],
        ]),
      },
      {
        indexedSeriesByMonth: new Map([
          ["2024-01", 100],
          ["2024-02", 110],
          ["2024-03", 120],
        ]),
      },
    ],
    ["2024-01", "2024-02", "2024-03"]
  );

  // Month-by-month average:
  // - Jan: (100 + 100) / 2 = 100
  // - Feb: (125 + 110) / 2 = 117.5
  // - Mar: (150 + 120) / 2 = 135
  //
  // The service emits the result as a chart-friendly `{ date, close }` series.
  assert.deepEqual(aggregateSeries, [
    { date: "2024-01-01", close: 100 },
    { date: "2024-02-01", close: 117.5 },
    { date: "2024-03-01", close: 135 },
  ]);
});

test("getTrailingMonthRange defaults to a trailing 5Y window and clamps to available bounds", () => {
  // The UI asks for a trailing window, but the backend should not return months
  // outside the data we actually have. So this helper both picks a default
  // range and clamps it to the available min/max months.
  assert.deepEqual(
    getTrailingMonthRange({
      monthCount: 60,
      minAvailableMonth: "2021-01",
      maxAvailableMonth: "2024-03",
    }),
    {
      startMonth: "2021-01",
      endMonth: "2024-03",
    }
  );
});
