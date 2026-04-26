function roundScaleValue(value) {
  return Number(value.toFixed(4));
}

function getNiceStepSize(targetStep) {
  if (!Number.isFinite(targetStep) || targetStep <= 0) {
    return 1;
  }

  const niceStepMultipliers = [1, 2, 2.5, 5, 10];
  const stepMagnitude = 10 ** Math.floor(Math.log10(targetStep));
  const normalizedStep = targetStep / stepMagnitude;
  const nextNiceMultiplier = niceStepMultipliers.find((multiplier) => normalizedStep <= multiplier) ?? 10;

  return nextNiceMultiplier * stepMagnitude;
}

function getNextNiceStepSize(currentStep) {
  const niceStepMultipliers = [1, 2, 2.5, 5, 10];
  const stepMagnitude = 10 ** Math.floor(Math.log10(currentStep));
  const normalizedStep = roundScaleValue(currentStep / stepMagnitude);
  const currentMultiplierIndex = niceStepMultipliers.findIndex((multiplier) => {
    return Math.abs(multiplier - normalizedStep) < 0.0001;
  });

  if (currentMultiplierIndex >= 0 && currentMultiplierIndex < niceStepMultipliers.length - 1) {
    return niceStepMultipliers[currentMultiplierIndex + 1] * stepMagnitude;
  }

  return niceStepMultipliers[0] * stepMagnitude * 10;
}

function getPreviousNiceStepSize(currentStep) {
  const niceStepMultipliers = [1, 2, 2.5, 5, 10];
  const stepMagnitude = 10 ** Math.floor(Math.log10(currentStep));
  const normalizedStep = roundScaleValue(currentStep / stepMagnitude);
  const currentMultiplierIndex = niceStepMultipliers.findIndex((multiplier) => {
    return Math.abs(multiplier - normalizedStep) < 0.0001;
  });

  if (currentMultiplierIndex > 0) {
    return niceStepMultipliers[currentMultiplierIndex - 1] * stepMagnitude;
  }

  return niceStepMultipliers[niceStepMultipliers.length - 1] * (stepMagnitude / 10);
}

function getMinimumVisibleRange(minPrice, maxPrice) {
  const scaleMagnitude = Math.max(Math.abs(maxPrice), Math.abs(minPrice), 1);

  if (maxPrice >= 100) {
    return Math.max(scaleMagnitude * 0.12, 8);
  }

  if (maxPrice >= 10) {
    return Math.max(scaleMagnitude * 0.12, 4);
  }

  return Math.max(scaleMagnitude * 0.18, 0.12);
}

function buildTicks(minPrice, maxPrice, step) {
  const tickCount = Math.max(Math.round((maxPrice - minPrice) / step), 0) + 1;

  return Array.from({ length: tickCount }, (_, index) => {
    return roundScaleValue(minPrice + (step * index));
  });
}

function buildAxisFromStep(paddedMinPrice, paddedMaxPrice, step) {
  const roundedMinPrice = roundScaleValue(Math.floor(paddedMinPrice / step) * step);
  const roundedMaxPrice = roundScaleValue(Math.ceil(paddedMaxPrice / step) * step);

  return {
    minPrice: roundedMinPrice,
    maxPrice: roundedMaxPrice,
    step: roundScaleValue(step),
    ticks: buildTicks(roundedMinPrice, roundedMaxPrice, step),
  };
}

// Charts are easier to read when the Y-axis lands on "nice" rounded values.
// Instead of returning only top/middle/bottom, the helper now builds a full
// tick array so the chart can draw more gridlines while keeping one source of truth.
export function buildRoundedChartScale(minPrice, maxPrice, options = {}) {
  const {
    preferredTickCount = 6,
    minTickCount = 5,
    maxTickCount = 7,
  } = options;

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
    return {
      minPrice: 0,
      maxPrice: 5,
      step: 1,
      ticks: [0, 1, 2, 3, 4, 5],
    };
  }

  let nextMinPrice = minPrice;
  let nextMaxPrice = maxPrice;

  if (nextMinPrice === nextMaxPrice) {
    const flatPadding = Math.max(Math.abs(nextMinPrice) * 0.05, nextMinPrice >= 10 ? 1 : 0.1);
    nextMinPrice -= flatPadding;
    nextMaxPrice += flatPadding;
  }

  const rawRange = Math.max(nextMaxPrice - nextMinPrice, 0);
  const expandedRange = Math.max(rawRange, getMinimumVisibleRange(nextMinPrice, nextMaxPrice));
  const centerPrice = (nextMinPrice + nextMaxPrice) / 2;
  const paddingAmount = Math.max(expandedRange * 0.14, nextMaxPrice >= 10 ? 2 : 0.02);
  let paddedMinPrice = centerPrice - (expandedRange / 2) - paddingAmount;
  let paddedMaxPrice = centerPrice + (expandedRange / 2) + paddingAmount;

  if (nextMinPrice >= 0) {
    paddedMinPrice = Math.max(0, paddedMinPrice);
  }

  const desiredIntervalCount = Math.max(preferredTickCount - 1, 1);
  let tickStep = getNiceStepSize((paddedMaxPrice - paddedMinPrice) / desiredIntervalCount);
  let axisScale = buildAxisFromStep(paddedMinPrice, paddedMaxPrice, tickStep);

  while (axisScale.ticks.length > maxTickCount) {
    tickStep = getNextNiceStepSize(tickStep);
    axisScale = buildAxisFromStep(paddedMinPrice, paddedMaxPrice, tickStep);
  }

  while (axisScale.ticks.length < minTickCount) {
    const previousStep = getPreviousNiceStepSize(tickStep);

    if (!Number.isFinite(previousStep) || previousStep <= 0 || previousStep === tickStep) {
      break;
    }

    tickStep = previousStep;
    const expandedAxisScale = buildAxisFromStep(paddedMinPrice, paddedMaxPrice, tickStep);

    if (expandedAxisScale.ticks.length > maxTickCount + 1) {
      break;
    }

    axisScale = expandedAxisScale;
  }

  return axisScale;
}

export function getRawChartScale(priceRows) {
  if (!priceRows.length) {
    return {
      minPrice: 0,
      maxPrice: 0,
    };
  }

  let minPrice = Math.min(...priceRows.map((priceRow) => priceRow.close));
  let maxPrice = Math.max(...priceRows.map((priceRow) => priceRow.close));

  if (minPrice === maxPrice) {
    minPrice -= 1;
    maxPrice += 1;
  }

  return {
    minPrice,
    maxPrice,
  };
}

export function getTargetChartScale(rawScale, options) {
  if (!rawScale) {
    return buildRoundedChartScale(0, 0, options);
  }

  return buildRoundedChartScale(rawScale.minPrice, rawScale.maxPrice, options);
}

export function getPreferredTickCount(plotHeight) {
  return Math.min(Math.max(Math.round(plotHeight / 42), 5), 7);
}

export function getYAxisDecimalPlaces(tickValues) {
  return Math.min(
    Math.max(
      ...tickValues.map((tickValue) => {
        const decimalSection = roundScaleValue(tickValue).toString().split('.')[1] || '';
        return decimalSection.length;
      }),
      0,
    ),
    4,
  );
}

const PLAIN_VALUE_NO_DECIMALS_THRESHOLD = 100;

export function formatYAxisPrice(value, tickValues) {
  void tickValues;
  // Stock-card Y-axis labels are easier for beginners to scan when sub-100
  // prices always keep two decimals, even if the rounded tick step itself
  // could be displayed with fewer decimal places.
  const decimalPlaces = Math.abs(Number(value)) >= PLAIN_VALUE_NO_DECIMALS_THRESHOLD ? 0 : 2;

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value);
}

export function buildRoundedIntegerChartScale(minValue, maxValue, options = {}) {
  const roundedScale = buildRoundedChartScale(minValue, maxValue, options);
  const roundedMinValue = Math.max(0, Math.floor(roundedScale.minPrice));
  const roundedMaxValue = Math.ceil(roundedScale.maxPrice);
  const valueRange = Math.max(roundedMaxValue - roundedMinValue, 1);
  const preferredTickCount = Math.max(options.preferredTickCount ?? 6, 2);
  const desiredStep = Math.max(Math.ceil(valueRange / (preferredTickCount - 1)), 1);
  const step = Math.max(Math.ceil(getNiceStepSize(desiredStep)), 1);
  const axisScale = buildAxisFromStep(roundedMinValue, roundedMaxValue, step);

  return {
    minPrice: Math.max(0, Math.round(axisScale.minPrice)),
    maxPrice: Math.round(axisScale.maxPrice),
    step: Math.max(Math.round(axisScale.step), 1),
    ticks: axisScale.ticks.map((tickValue) => Math.round(tickValue)),
  };
}

export function formatYAxisInteger(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}
