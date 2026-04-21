const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAggregateSeries,
  buildIndexedSeriesForStock,
  convertDailyPricesToMonthlyPrices,
  getTrailingMonthRange,
} = require("../services/investmentCategoryCardsService");

test("convertDailyPricesToMonthlyPrices keeps the last trading day of each month", () => {
  const monthlyPrices = convertDailyPricesToMonthlyPrices([
    { date: "2024-01-02", close: 10 },
    { date: "2024-01-31", close: 12 },
    { date: "2024-02-01", close: 13 },
    { date: "2024-02-29", close: 14 },
  ]);

  assert.deepEqual(monthlyPrices, [
    { month: "2024-01", date: "2024-01-31", close: 12 },
    { month: "2024-02", date: "2024-02-29", close: 14 },
  ]);
});

test("buildIndexedSeriesForStock reindexes the first visible month to 100", () => {
  const indexedSeries = buildIndexedSeriesForStock(
    [
      { month: "2024-01", date: "2024-01-31", close: 20 },
      { month: "2024-02", date: "2024-02-29", close: 25 },
      { month: "2024-03", date: "2024-03-28", close: 30 },
    ],
    ["2024-01", "2024-02", "2024-03"]
  );

  assert.deepEqual(indexedSeries, [
    { month: "2024-01", date: "2024-01-31", indexedValue: 100 },
    { month: "2024-02", date: "2024-02-29", indexedValue: 125 },
    { month: "2024-03", date: "2024-03-28", indexedValue: 150 },
  ]);
});

test("buildIndexedSeriesForStock excludes a stock when the first visible month is missing", () => {
  const indexedSeries = buildIndexedSeriesForStock(
    [
      { month: "2024-02", date: "2024-02-29", close: 25 },
      { month: "2024-03", date: "2024-03-28", close: 30 },
    ],
    ["2024-01", "2024-02", "2024-03"]
  );

  assert.equal(indexedSeries, null);
});

test("buildAggregateSeries averages active indexed constituents equally", () => {
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

  assert.deepEqual(aggregateSeries, [
    { date: "2024-01-01", close: 100 },
    { date: "2024-02-01", close: 117.5 },
    { date: "2024-03-01", close: 135 },
  ]);
});

test("getTrailingMonthRange defaults to a trailing 5Y window and clamps to available bounds", () => {
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
