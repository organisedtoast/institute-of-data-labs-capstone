export const DEFAULT_CHART_TOP_PADDING = 20;
export const DEFAULT_CHART_BOTTOM_PADDING = 20;

export function getChartPlotHeight(chartHeight, options = {}) {
  const {
    topPadding = DEFAULT_CHART_TOP_PADDING,
    bottomPadding = DEFAULT_CHART_BOTTOM_PADDING,
  } = options;

  return Math.max(chartHeight - topPadding - bottomPadding, 1);
}

export function buildLinearTimeMapper(minTime, maxTime, plotWidth) {
  const safePlotWidth = Math.max(Number(plotWidth) || 0, 1);
  const safeMinTime = Number.isFinite(minTime) ? minTime : 0;
  const safeMaxTime = Number.isFinite(maxTime) ? maxTime : safeMinTime;
  const timeRange = Math.max(safeMaxTime - safeMinTime, 1);

  return {
    minTime: safeMinTime,
    maxTime: safeMaxTime,
    timeRange,
    mapTimeToX(timeValue) {
      if (!Number.isFinite(timeValue)) {
        return 0;
      }

      return ((timeValue - safeMinTime) / timeRange) * safePlotWidth;
    },
    mapXToTime(xValue) {
      if (!Number.isFinite(xValue)) {
        return safeMinTime;
      }

      return safeMinTime + ((xValue / safePlotWidth) * timeRange);
    },
  };
}

export function getChartYPosition(
  value,
  minValue,
  maxValue,
  chartHeight,
  options = {},
) {
  const {
    topPadding = DEFAULT_CHART_TOP_PADDING,
    bottomPadding = DEFAULT_CHART_BOTTOM_PADDING,
  } = options;
  const plotHeight = getChartPlotHeight(chartHeight, { topPadding, bottomPadding });
  const valueRange = maxValue - minValue || 1;

  return topPadding + plotHeight - (((value - minValue) / valueRange) * plotHeight);
}

export function buildSvgPath(
  dataRows,
  minValue,
  maxValue,
  mapTimeToX,
  chartHeight,
  options = {},
) {
  const {
    getXTime = (dataRow) => new Date(dataRow.date).getTime(),
    getYValue = (dataRow) => dataRow.close,
    topPadding = DEFAULT_CHART_TOP_PADDING,
    bottomPadding = DEFAULT_CHART_BOTTOM_PADDING,
  } = options;

  if (!Array.isArray(dataRows) || dataRows.length === 0) {
    return '';
  }

  const plotHeight = getChartPlotHeight(chartHeight, { topPadding, bottomPadding });
  const valueRange = maxValue - minValue || 1;

  const points = dataRows.map((dataRow) => {
    const x = mapTimeToX(getXTime(dataRow));
    const y = topPadding + plotHeight - (((getYValue(dataRow) - minValue) / valueRange) * plotHeight);

    return `${x},${y}`;
  });

  return points.length === 1 ? `M ${points[0]} L ${points[0]}` : `M ${points.join(' L ')}`;
}

export function getJanuaryPositions(dataRows, minTime, maxTime, mapTimeToX) {
  if (!Array.isArray(dataRows) || dataRows.length === 0) {
    return [];
  }

  const startYear = new Date(dataRows[0].date).getFullYear();
  const endYear = new Date(dataRows[dataRows.length - 1].date).getFullYear();
  const positions = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const januaryFirstTime = new Date(`${year}-01-01T00:00:00Z`).getTime();

    if (januaryFirstTime < minTime || januaryFirstTime > maxTime) {
      continue;
    }

    positions.push({
      year,
      x: mapTimeToX(januaryFirstTime),
    });
  }

  return positions;
}

export function getClosestDataPoint(dataRows, targetTime, options = {}) {
  const {
    getXTime = (dataRow) => new Date(dataRow.date).getTime(),
  } = options;

  if (!Array.isArray(dataRows) || dataRows.length === 0 || !Number.isFinite(targetTime)) {
    return null;
  }

  let closestPoint = dataRows[0];
  let smallestDifference = Math.abs(getXTime(closestPoint) - targetTime);

  for (let index = 1; index < dataRows.length; index += 1) {
    const point = dataRows[index];
    const difference = Math.abs(getXTime(point) - targetTime);

    if (difference < smallestDifference) {
      closestPoint = point;
      smallestDifference = difference;
    }
  }

  return closestPoint;
}
