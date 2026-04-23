import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { getShortLabel } from '../utils/responsiveLabelCatalog.js';
import {
  buildRoundedChartScale,
  formatYAxisPrice,
  getPreferredTickCount,
  getRawChartScale,
  getTargetChartScale,
} from './sharePriceChartScale';
import TimeSeriesChartSvg from './TimeSeriesChartSvg';
import {
  DEFAULT_CHART_BOTTOM_PADDING,
  DEFAULT_CHART_TOP_PADDING,
  buildLinearTimeMapper,
  buildSvgPath,
  getChartYPosition,
  getChartPlotHeight,
  getJanuaryPositions,
} from './timeSeriesChartCore';
import {
  fetchDashboardData,
  updateDashboardMetricOverride,
  updateDashboardInvestmentCategory,
  updateDashboardRowPreference,
} from '../services/watchlistDashboardApi';

const CHART_HEIGHT = 280;
const CHART_RIGHT_PADDING = 24;
const CHART_TOP_PADDING = DEFAULT_CHART_TOP_PADDING;
const CHART_BOTTOM_PADDING = DEFAULT_CHART_BOTTOM_PADDING;
const CHART_PLOT_HEIGHT = getChartPlotHeight(CHART_HEIGHT, {
  topPadding: CHART_TOP_PADDING,
  bottomPadding: CHART_BOTTOM_PADDING,
});
const RIGHT_TIMELINE_MIN_WIDTH = 720;
const HEADER_ROW_HEIGHT = 36;
const DATA_ROW_HEIGHT = 32;
const METRICS_DATA_ROW_HEIGHT = 44;
const SCALE_EXPANSION_DURATION_MS = 120;
const SCALE_CONTRACTION_DURATION_MS = 280;
const SCALE_CONTRACTION_DELAY_MS = 160;
const SCALE_WINDOW_STEP_PX = 16;
const PRESET_PAN_STEP_PX = 28;
const Y_AXIS_LABEL_MIN_SPACING_PX = 32;
const MOBILE_LABEL_BREAKPOINT_QUERY = '(max-width: 560px)';
const MOBILE_METRIC_EDITOR_BREAKPOINT_QUERY = '(max-width: 640px)';
const PRESET_MIN_COLUMN_WIDTH = 56;
const PRESET_COMPACT_MIN_COLUMN_WIDTH = 48;
const MIN_FULL_LABEL_LEFT_RAIL_WIDTH = 120;
const MIN_SHORT_LABEL_LEFT_RAIL_WIDTH = 76;
const MIN_COMPACT_SHORT_LABEL_LEFT_RAIL_WIDTH = 68;
const FISCAL_BAND_FILL = 'rgba(148, 163, 184, 0.08)';
const ACTIVE_FISCAL_BAND_FILL = 'rgba(148, 163, 184, 0.12)';
const FY_WATERMARK_OPACITY = 0.9;
const LONG_PRESS_ACTIVATION_MS = 400;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
const EDITABLE_METRIC_UNDERLINE = 'rgba(100, 116, 139, 0.22)';
const EDITABLE_METRIC_UNDERLINE_HOVER = 'rgba(100, 116, 139, 0.34)';
const OVERRIDDEN_METRIC_UNDERLINE = 'rgba(109, 40, 217, 0.44)';
const OVERRIDDEN_METRIC_UNDERLINE_HOVER = 'rgba(109, 40, 217, 0.64)';
const FOCUSED_METRICS_VIEWPORT_MAX_HEIGHT = 'min(48vh, 420px)';

const PRESET_BUTTONS = [
  { key: 'MAX', label: 'MAX', monthCount: null },
  { key: '1M', label: '1M', monthCount: 1 },
  { key: '6M', label: '6M', monthCount: 6 },
  { key: '1Y', label: '1Y', monthCount: 12 },
  { key: '3Y', label: '3Y', monthCount: 36 },
  { key: '5Y', label: '5Y', monthCount: 60 },
  { key: '10Y', label: '10Y', monthCount: 120 },
];

const INVESTMENT_CATEGORY_OPTIONS = [
  'Unprofitable Hi Growth',
  'Profitable Hi Growth',
  'Mature Compounder',
  'Defensive Yield',
  'Cyclical',
  'Lender',
  'Firm Specific Turnaround',
];

const chartButtonStyles = {
  '&:hover': {
    backgroundColor: 'rgba(74, 20, 140, 0.08)',
  },
};

const chartButtonContainedStyles = {
  '&:hover': {
    backgroundColor: '#3f1178',
  },
};

const monthLabelFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function isValidMonthString(monthString) {
  return typeof monthString === 'string' && /^\d{4}-\d{2}$/.test(monthString);
}

function getMonthStringFromDate(dateString) {
  return typeof dateString === 'string' ? dateString.slice(0, 7) : '';
}

function compareMonthStrings(leftMonth, rightMonth) {
  if (!isValidMonthString(leftMonth) || !isValidMonthString(rightMonth)) {
    return 0;
  }

  if (leftMonth === rightMonth) {
    return 0;
  }

  return leftMonth < rightMonth ? -1 : 1;
}

function shiftMonthString(monthString, monthsToShift) {
  if (!isValidMonthString(monthString)) {
    return '';
  }

  const [yearText, monthText] = monthString.split('-');
  const shiftedDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + monthsToShift, 1));

  return `${shiftedDate.getUTCFullYear()}-${String(shiftedDate.getUTCMonth() + 1).padStart(2, '0')}`;
}

function clampMonthString(monthString, minAvailableMonth, maxAvailableMonth) {
  if (!isValidMonthString(monthString)) {
    return '';
  }

  if (isValidMonthString(minAvailableMonth) && compareMonthStrings(monthString, minAvailableMonth) < 0) {
    return minAvailableMonth;
  }

  if (isValidMonthString(maxAvailableMonth) && compareMonthStrings(monthString, maxAvailableMonth) > 0) {
    return maxAvailableMonth;
  }

  return monthString;
}

function getMonthOffset(startMonth, endMonth) {
  if (!isValidMonthString(startMonth) || !isValidMonthString(endMonth)) {
    return 0;
  }

  const [startYearText, startMonthText] = startMonth.split('-');
  const [endYearText, endMonthText] = endMonth.split('-');

  return ((Number(endYearText) - Number(startYearText)) * 12) + (Number(endMonthText) - Number(startMonthText));
}

function getTrailingRange({ monthCount, minAvailableMonth, maxAvailableMonth }) {
  if (!minAvailableMonth || !maxAvailableMonth) {
    return {
      startMonth: '',
      endMonth: '',
    };
  }

  if (!monthCount) {
    return {
      startMonth: minAvailableMonth,
      endMonth: maxAvailableMonth,
    };
  }

  return {
    startMonth: clampMonthString(
      shiftMonthString(maxAvailableMonth, -monthCount),
      minAvailableMonth,
      maxAvailableMonth,
    ),
    endMonth: maxAvailableMonth,
  };
}

function getDefaultDashboardRange(priceRows) {
  if (!Array.isArray(priceRows) || priceRows.length === 0) {
    return {
      startMonth: '',
      endMonth: '',
    };
  }

  const minAvailableMonth = getMonthStringFromDate(priceRows[0].date);
  const maxAvailableMonth = getMonthStringFromDate(priceRows[priceRows.length - 1].date);

  return getTrailingRange({
    monthCount: 60,
    minAvailableMonth,
    maxAvailableMonth,
  });
}

function areScrollMeasurementsEqual(leftMeasurement, rightMeasurement) {
  if (!leftMeasurement || !rightMeasurement) {
    return false;
  }

  return (
    leftMeasurement.containerWidth === rightMeasurement.containerWidth
    && Math.abs((leftMeasurement.scrollLeft || 0) - (rightMeasurement.scrollLeft || 0)) <= 1
    && leftMeasurement.viewportWidth === rightMeasurement.viewportWidth
  );
}

function getMonthEndDate(monthString) {
  if (!isValidMonthString(monthString)) {
    return '';
  }

  const [yearText, monthText] = monthString.split('-');
  const lastDayOfMonth = new Date(Date.UTC(Number(yearText), Number(monthText), 0)).getUTCDate();

  return `${monthString}-${String(lastDayOfMonth).padStart(2, '0')}`;
}

function formatDateLabel(dateString) {
  return monthLabelFormatter.format(new Date(dateString));
}

function formatLongDate(dateString) {
  return longDateFormatter.format(new Date(dateString));
}

function formatCurrency(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: options.compact ? 'compact' : 'standard',
    compactDisplay: options.compact ? 'short' : undefined,
    minimumFractionDigits: options.compact ? 0 : 2,
    maximumFractionDigits: options.compact ? 1 : 2,
  }).format(value);
}

function formatCompactNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }

  return `${Number(value).toFixed(2)}%`;
}

function formatCompactPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }

  return `${Number(value).toFixed(1)}%`;
}

function formatShortCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }

  const absoluteValue = Math.abs(Number(value));

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: absoluteValue < 10 ? 1 : 0,
    maximumFractionDigits: absoluteValue < 10 ? 1 : 0,
  }).format(value);
}

function formatFiscalReleaseLabel(dateString, useCompactLabel = false) {
  if (typeof dateString !== 'string' || dateString.length < 7) {
    return '--';
  }

  return useCompactLabel ? dateString.slice(2, 7) : dateString.slice(0, 7);
}

function areScaleValuesClose(leftScale, rightScale) {
  const referenceRange = Math.max(
    (leftScale?.maxPrice ?? 0) - (leftScale?.minPrice ?? 0),
    (rightScale?.maxPrice ?? 0) - (rightScale?.minPrice ?? 0),
    1,
  );
  const allowedDifference = Math.max(referenceRange * 0.015, 0.02);

  return (
    Math.abs((leftScale?.minPrice ?? 0) - (rightScale?.minPrice ?? 0)) <= allowedDifference &&
    Math.abs((leftScale?.maxPrice ?? 0) - (rightScale?.maxPrice ?? 0)) <= allowedDifference
  );
}

function getScaleSignature(scale) {
  if (!scale) {
    return '0|0|0|';
  }

  return [
    scale.minPrice ?? 0,
    scale.maxPrice ?? 0,
    scale.step ?? 0,
    Array.isArray(scale.ticks) ? scale.ticks.join(',') : '',
  ].join('|');
}

function formatPlainNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(Number(value));
}

function shouldUseCompactMagnitude(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return false;
  }

  return Math.abs(Number(value)) >= 1000;
}

function formatMetricPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }

  const numericValue = Number(value);
  const displayValue = Math.abs(numericValue) <= 1 ? numericValue * 100 : numericValue;
  return `${displayValue.toFixed(1)}%`;
}

function inferMetricDisplayKind(fieldPath) {
  const normalizedFieldPath = String(fieldPath || '').toLowerCase();

  if (normalizedFieldPath.includes('date')) {
    return 'date';
  }

  if (
    normalizedFieldPath.includes('margin')
    || normalizedFieldPath.includes('cagr')
    || normalizedFieldPath.includes('dividendpayout')
    || normalizedFieldPath.includes('returnoninvestedcapital')
    || normalizedFieldPath.includes('revisions')
    || normalizedFieldPath.endsWith('.dy')
    || normalizedFieldPath.includes('dytrailing')
  ) {
    return 'percent';
  }

  if (
    normalizedFieldPath.includes('sharesonissue')
    || normalizedFieldPath.includes('changeinshares')
  ) {
    return 'shares';
  }

  if (
    normalizedFieldPath.includes('evsales')
    || normalizedFieldPath.includes('evebit')
    || normalizedFieldPath.includes('netdebttoebitda')
    || normalizedFieldPath.includes('intercoverage')
    || normalizedFieldPath.includes('leverageratio')
    || normalizedFieldPath.includes('pricetonta')
    || normalizedFieldPath.includes('.pe')
  ) {
    return 'ratio';
  }

  if (
    normalizedFieldPath.includes('shareprice')
    || normalizedFieldPath.includes('marketcap')
    || normalizedFieldPath.includes('enterprisevalue')
    || normalizedFieldPath.includes('revenue')
    || normalizedFieldPath.includes('grossprofit')
    || normalizedFieldPath.includes('cash')
    || normalizedFieldPath.includes('debt')
    || normalizedFieldPath.includes('assets')
    || normalizedFieldPath.includes('liabilities')
    || normalizedFieldPath.includes('equity')
    || normalizedFieldPath.includes('ebit')
    || normalizedFieldPath.includes('ebitda')
    || normalizedFieldPath.includes('npat')
    || normalizedFieldPath.includes('npbt')
    || normalizedFieldPath.includes('fcf')
    || normalizedFieldPath.includes('capex')
    || normalizedFieldPath.includes('earnings')
    || normalizedFieldPath.includes('dps')
    || normalizedFieldPath.includes('eps')
    || normalizedFieldPath.includes('bookvalue')
  ) {
    return 'currency';
  }

  return 'number';
}

function formatMetricCellValue(value, fieldPath, options = {}) {
  const displayKind = inferMetricDisplayKind(fieldPath);

  if (displayKind === 'date') {
    return formatFiscalReleaseLabel(value, options.compact);
  }

  if (displayKind === 'percent') {
    return formatMetricPercent(value);
  }

  if (displayKind === 'shares') {
    return formatCompactNumber(value);
  }

  if (displayKind === 'ratio') {
    return formatPlainNumber(value, options.compact ? 1 : 2);
  }

  if (displayKind === 'currency') {
    // The expanded metrics table should keep the same "read it at a glance"
    // feel as the stock card summary rows. Large money values like revenue or
    // market cap are easier to scan when they use compact units instead of
    // showing every digit and cents that do not add meaning at that scale.
    return (options.compact || shouldUseCompactMagnitude(value))
      ? formatCurrency(value, { compact: true })
      : formatCurrency(value);
  }

  return (options.compact || shouldUseCompactMagnitude(value))
    ? formatCompactNumber(value)
    : formatPlainNumber(value, 2);
}

function getMetricEditorInputType(fieldPath, value) {
  if (inferMetricDisplayKind(fieldPath) === 'date') {
    return 'date';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  return 'text';
}

function coerceMetricEditorValue(rawValue, fieldPath) {
  if (rawValue === '') {
    return null;
  }

  if (inferMetricDisplayKind(fieldPath) === 'date') {
    return rawValue;
  }

  const numericValue = Number(rawValue);
  if (!Number.isNaN(numericValue)) {
    return numericValue;
  }

  return rawValue;
}

function getColumnDensity(columnCount) {
  if (columnCount >= 36) {
    return {
      columnWidth: 58,
      headerFontSize: '9px',
      bodyFontSize: '9px',
    };
  }

  if (columnCount >= 24) {
    return {
      columnWidth: 66,
      headerFontSize: '9px',
      bodyFontSize: '9px',
    };
  }

  if (columnCount >= 14) {
    return {
      columnWidth: 76,
      headerFontSize: '9px',
      bodyFontSize: '9px',
    };
  }

  return {
    columnWidth: 88,
    headerFontSize: '9px',
    bodyFontSize: '9px',
  };
}

function getPresetMinimumColumnWidth(isCompactPresetTable) {
  return isCompactPresetTable ? PRESET_COMPACT_MIN_COLUMN_WIDTH : PRESET_MIN_COLUMN_WIDTH;
}

function interpolateSegment({ startTime, endTime, startX, endX }, value, inputKey, outputKey) {
  const inputRange = endTime - startTime;

  if (Math.abs(inputRange) <= 1e-6) {
    return outputKey === 'x' ? endX : endTime;
  }

  const ratio = (value - startTime) / inputRange;
  const outputRange = endX - startX;

  return outputKey === 'x'
    ? startX + (ratio * outputRange)
    : startTime + (ratio * outputRange);
}

function createChartXGeometry({ filteredPriceRows, tablePoints, plotWidth, yearCellWidth }) {
  if (!filteredPriceRows.length) {
    return {
      anchorPositions: [],
      mapTimeToX: () => 0,
      mapXToTime: () => 0,
      maxTime: 0,
      minTime: 0,
      plotWidth,
      timeRange: 1,
    };
  }

  const minTime = new Date(filteredPriceRows[0].date).getTime();
  const maxTime = new Date(filteredPriceRows[filteredPriceRows.length - 1].date).getTime();
  const linearMapper = buildLinearTimeMapper(minTime, maxTime, plotWidth);

  if (!tablePoints.length || yearCellWidth <= 0) {
    return {
      anchorPositions: [],
      mapTimeToX: linearMapper.mapTimeToX,
      mapXToTime: linearMapper.mapXToTime,
      maxTime,
      minTime,
      plotWidth,
      timeRange: linearMapper.timeRange,
    };
  }

  const anchorPositions = tablePoints.map((annualRow, columnIndex) => {
    const anchorDate = annualRow.earningsReleaseDate || annualRow.fiscalYearEndDate;

    return {
      fiscalYear: annualRow.fiscalYear,
      date: annualRow.fiscalYearEndDate,
      anchorDate,
      fiscalYearEndTime: new Date(annualRow.fiscalYearEndDate).getTime(),
      time: new Date(anchorDate).getTime(),
      x: (columnIndex * yearCellWidth) + (yearCellWidth / 2),
    };
  });

  const segments = [];
  const firstAnchor = anchorPositions[0];
  const lastAnchor = anchorPositions[anchorPositions.length - 1];

  segments.push({
    startTime: minTime,
    endTime: firstAnchor.time,
    startX: 0,
    endX: firstAnchor.x,
  });

  for (let index = 0; index < anchorPositions.length - 1; index += 1) {
    const currentAnchor = anchorPositions[index];
    const nextAnchor = anchorPositions[index + 1];

    segments.push({
      startTime: currentAnchor.time,
      endTime: nextAnchor.time,
      startX: currentAnchor.x,
      endX: nextAnchor.x,
    });
  }

  segments.push({
    startTime: lastAnchor.time,
    endTime: maxTime,
    startX: lastAnchor.x,
    endX: plotWidth,
  });

  const mapTimeToX = (timestamp) => {
    if (!Number.isFinite(timestamp)) {
      return 0;
    }

    if (timestamp <= minTime) {
      return 0;
    }

    if (timestamp >= maxTime) {
      return plotWidth;
    }

    const matchingSegment = segments.find((segment) => {
      return timestamp >= segment.startTime && timestamp <= segment.endTime;
    }) || segments[segments.length - 1];

    return interpolateSegment(matchingSegment, timestamp, 'time', 'x');
  };

  const mapXToTime = (x) => {
    if (!Number.isFinite(x)) {
      return minTime;
    }

    if (x <= 0) {
      return minTime;
    }

    if (x >= plotWidth) {
      return maxTime;
    }

    const matchingSegment = segments.find((segment) => {
      return x >= segment.startX && x <= segment.endX;
    }) || segments[segments.length - 1];

    const xRange = matchingSegment.endX - matchingSegment.startX;

    if (Math.abs(xRange) <= 1e-6) {
      return matchingSegment.endTime;
    }

    const ratio = (x - matchingSegment.startX) / xRange;
    return matchingSegment.startTime + (ratio * (matchingSegment.endTime - matchingSegment.startTime));
  };

  return {
    anchorPositions,
    mapTimeToX,
    mapXToTime,
    maxTime,
    minTime,
    plotWidth,
    timeRange: linearMapper.timeRange,
  };
}

function useMediaQueryMatch(mediaQuery) {
  const subscribe = useCallback((notify) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => {};
    }

    const mediaQueryList = window.matchMedia(mediaQuery);
    const handleChange = () => {
      notify();
    };

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange);

      return () => {
        mediaQueryList.removeEventListener('change', handleChange);
      };
    }

    mediaQueryList.addListener(handleChange);

    return () => {
      mediaQueryList.removeListener(handleChange);
    };
  }, [mediaQuery]);

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia(mediaQuery).matches;
  }, [mediaQuery]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * This dashboard uses a custom SVG line chart because the table columns must line up with
 * exact dates on the chart timeline. For long MAX ranges we split the layout into:
 * 1. a fixed left rail for Y-axis labels and table metric names
 * 2. one shared horizontal scroll region for the chart timeline and yearly table cells
 * The scrollable region must still use one shared X-position calculation for both the chart
 * and table so their columns stay aligned while the user scrolls.
 */
export default function SharePriceDashboard({
  identifier,
  name,
  isRemovable = false,
  onRemove = null,
  scaleAnimationDurationMs = null,
  isFocusedMetricsMode = false,
  onMetricsVisibilityChange = null,
}) {
  const svgRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [investmentCategoryError, setInvestmentCategoryError] = useState('');
  const [metricsActionError, setMetricsActionError] = useState('');
  const [isUpdatingInvestmentCategory, setIsUpdatingInvestmentCategory] = useState(false);
  const [isSavingMetricOverride, setIsSavingMetricOverride] = useState(false);
  const [isUpdatingRowPreference, setIsUpdatingRowPreference] = useState(false);
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);
  const [isHiddenRowsOpen, setIsHiddenRowsOpen] = useState(false);
  const [metricEditorState, setMetricEditorState] = useState(null);
  const [metricEditorValue, setMetricEditorValue] = useState('');
  const [metricRowActionMenuState, setMetricRowActionMenuState] = useState(null);
  const [freeRange, setFreeRange] = useState({
    startMonth: '',
    endMonth: '',
  });
  const [rangeMode, setRangeMode] = useState('preset');
  const [activePreset, setActivePreset] = useState('5Y');
  const [presetPanOffsetMonths, setPresetPanOffsetMonths] = useState(0);
  const [hoverState, setHoverState] = useState({
    date: '',
    price: null,
    x: null,
  });
  const [activeFiscalBand, setActiveFiscalBand] = useState(null);
  const [scrollState, setScrollState] = useState({
    containerWidth: 0,
    scrollLeft: 0,
    viewportWidth: 0,
  });
  const [renderedScale, setRenderedScale] = useState({
    minPrice: 0,
    maxPrice: 0,
    step: 1,
    ticks: [],
  });
  const [isPresetScrollReady, setIsPresetScrollReady] = useState(false);
  const renderedScaleRef = useRef({
    minPrice: 0,
    maxPrice: 0,
    step: 1,
    ticks: [],
  });
  const presetBootstrapFrameRef = useRef(null);
  const measurementFrameRef = useRef(null);
  const postPaintMeasurementFrameRef = useRef(null);
  const publishScrollMeasurementRef = useRef(() => {});
  const lastPublishedScrollMeasurementRef = useRef(null);
  const hasBootstrappedPresetRef = useRef(false);
  const presetBootstrapKeyRef = useRef('');
  const animationFrameRef = useRef(null);
  const contractionTimeoutRef = useRef(null);
  const longPressTimeoutRef = useRef(null);
  const touchLongPressStateRef = useRef({
    isActive: false,
    startClientX: 0,
    startClientY: 0,
  });
  const metricCellLongPressTimeoutRef = useRef(null);
  const metricCellTouchStateRef = useRef({
    isActive: false,
    startClientX: 0,
    startClientY: 0,
  });
  const metricRowLongPressTimeoutRef = useRef(null);
  const metricRowTouchStateRef = useRef({
    isActive: false,
    startClientX: 0,
    startClientY: 0,
  });
  const metricRowActionMenuRef = useRef(null);

  const attachTimelineScrollRef = useCallback((node) => {
    if (timelineScrollRef.current && timelineScrollRef.current !== node) {
      delete timelineScrollRef.current.__sharePriceDashboardPublishMeasurement;
    }

    if (timelineScrollRef.current !== node) {
      lastPublishedScrollMeasurementRef.current = null;
    }

    if (node) {
      node.__sharePriceDashboardPublishMeasurement = () => {
        publishScrollMeasurementRef.current(node);
      };
    }

    timelineScrollRef.current = node;
  }, []);

  const applyMetricsViewUpdate = useCallback((metricsUpdate) => {
    setDashboardData((previousDashboardData) => {
      if (!previousDashboardData) {
        return previousDashboardData;
      }

      return {
        ...previousDashboardData,
        metricsColumns: Array.isArray(metricsUpdate?.metricsColumns)
          ? metricsUpdate.metricsColumns
          : previousDashboardData.metricsColumns,
        metricsRows: Array.isArray(metricsUpdate?.metricsRows)
          ? metricsUpdate.metricsRows
          : previousDashboardData.metricsRows,
      };
    });
  }, []);

  const reloadDashboardPayload = useCallback(async () => {
    const nextDashboardData = await fetchDashboardData(identifier);

    setDashboardData((previousDashboardData) => {
      if (!previousDashboardData) {
        return nextDashboardData;
      }

      return {
        ...nextDashboardData,
        investmentCategory: nextDashboardData.investmentCategory || previousDashboardData.investmentCategory,
      };
    });
  }, [identifier]);

  const setFreeRangeMonths = useCallback((nextRange) => {
    setFreeRange((previousFreeRange) => {
      const normalizedRange = {
        startMonth: nextRange?.startMonth || '',
        endMonth: nextRange?.endMonth || '',
      };

      if (
        previousFreeRange.startMonth === normalizedRange.startMonth
        && previousFreeRange.endMonth === normalizedRange.endMonth
      ) {
        return previousFreeRange;
      }

      return normalizedRange;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadDashboardData = async () => {
      setIsLoading((previousIsLoading) => {
        return previousIsLoading ? previousIsLoading : true;
      });
      setError((previousError) => {
        return previousError ? '' : previousError;
      });

      try {
        const nextDashboardData = await fetchDashboardData(identifier, {
          signal: controller.signal,
        });

        if (!isMounted) {
          return;
        }

        const nextPriceRows = Array.isArray(nextDashboardData?.prices) ? nextDashboardData.prices : [];

        if (nextPriceRows.length === 0) {
          setDashboardData(null);
          setError(`No chart data is available for ${identifier}.`);
          setIsLoading(false);
          return;
        }

        const defaultRange = getDefaultDashboardRange(nextPriceRows);

        setDashboardData(nextDashboardData);
        setInvestmentCategoryError('');
        setMetricsActionError('');
        setMetricEditorState(null);
        setMetricEditorValue('');
        setIsHiddenRowsOpen(false);
        setIsMetricsOpen(false);
        setFreeRangeMonths(defaultRange);
        setRangeMode('preset');
        setActivePreset('5Y');
        // A fixed-length preset only becomes scrollable after the browser has
        // measured the scroll container and we have snapped it to the latest
        // trailing position on the hidden pan track.
        setIsPresetScrollReady(false);
        setPresetPanOffsetMonths(0);
      } catch (requestError) {
        if (!isMounted || requestError.name === 'CanceledError') {
          return;
        }

        setDashboardData(null);
        setError(
          requestError.response?.data?.message ||
            `Unable to load dashboard data for ${identifier}.`,
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDashboardData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [identifier, setFreeRangeMonths]);

  const priceRows = dashboardData?.prices || [];
  const annualMetrics = dashboardData?.annualMetrics || [];
  const metricsColumns = dashboardData?.metricsColumns || [];
  const metricsRows = dashboardData?.metricsRows || [];
  const shouldUseShortLabels = useMediaQueryMatch(MOBILE_LABEL_BREAKPOINT_QUERY);
  const shouldUseBottomSheetMetricEditor = useMediaQueryMatch(MOBILE_METRIC_EDITOR_BREAKPOINT_QUERY);
  const activePresetConfig = PRESET_BUTTONS.find((preset) => preset.key === activePreset) || null;
  const fixedLengthPresetConfigs = PRESET_BUTTONS.filter((preset) => Boolean(preset.monthCount));
  const minAvailableMonth = priceRows.length ? getMonthStringFromDate(priceRows[0].date) : '';
  const maxAvailableMonth = priceRows.length ? getMonthStringFromDate(priceRows[priceRows.length - 1].date) : '';
  const isPresetWindowMode = rangeMode === 'preset' && Boolean(activePresetConfig?.monthCount);
  const latestPresetRange = useMemo(() => {
    if (!isPresetWindowMode) {
      return {
        startMonth: '',
        endMonth: '',
      };
    }

    return getTrailingRange({
      monthCount: activePresetConfig.monthCount,
      minAvailableMonth,
      maxAvailableMonth,
    });
  }, [activePresetConfig, isPresetWindowMode, maxAvailableMonth, minAvailableMonth]);
  const maxPresetPanOffset = useMemo(() => {
    if (!isPresetWindowMode || !latestPresetRange.startMonth || !minAvailableMonth) {
      return 0;
    }

    return Math.max(getMonthOffset(minAvailableMonth, latestPresetRange.startMonth), 0);
  }, [isPresetWindowMode, latestPresetRange.startMonth, minAvailableMonth]);
  const presetBootstrapKey = useMemo(() => {
    if (!isPresetWindowMode || !identifier || !minAvailableMonth || !maxAvailableMonth) {
      return `${identifier || ''}|idle|${rangeMode}|${activePreset || ''}`;
    }

    return [
      identifier,
      rangeMode,
      activePreset || '',
      minAvailableMonth,
      maxAvailableMonth,
      maxPresetPanOffset,
    ].join('|');
  }, [
    activePreset,
    identifier,
    isPresetWindowMode,
    maxAvailableMonth,
    maxPresetPanOffset,
    minAvailableMonth,
    rangeMode,
  ]);
  const clampedPresetPanOffsetMonths = Math.min(
    Math.max(presetPanOffsetMonths, 0),
    maxPresetPanOffset,
  );
  // Preset mode owns one moving value: the month offset from the latest trailing preset.
  // The displayed start/end months are derived from that offset instead of being rewritten by effects.
  const currentStartMonth = isPresetWindowMode
    ? clampMonthString(
        shiftMonthString(latestPresetRange.startMonth, -clampedPresetPanOffsetMonths),
        minAvailableMonth,
        maxAvailableMonth,
      )
    : freeRange.startMonth;
  const currentEndMonth = isPresetWindowMode
    ? clampMonthString(
        shiftMonthString(latestPresetRange.endMonth, -clampedPresetPanOffsetMonths),
        minAvailableMonth,
        maxAvailableMonth,
      )
    : freeRange.endMonth;
  const hasLoadedMonthRange = Boolean(
    priceRows.length
    && minAvailableMonth
    && maxAvailableMonth
    && currentStartMonth
    && currentEndMonth
  );
  const fullHistoryMatchesFixedPreset = useMemo(() => {
    if (!minAvailableMonth || !maxAvailableMonth) {
      return false;
    }

    return fixedLengthPresetConfigs.some((preset) => {
      const presetRange = getTrailingRange({
        monthCount: preset.monthCount,
        minAvailableMonth,
        maxAvailableMonth,
      });

      return presetRange.startMonth === minAvailableMonth && presetRange.endMonth === maxAvailableMonth;
    });
  }, [fixedLengthPresetConfigs, maxAvailableMonth, minAvailableMonth]);
  // MAX keeps free-range scrolling semantics, but short histories that already collapse to a
  // fixed preset should reuse the preset layout so the chart/table geometry stays consistent.
  const usesPresetTimelineLayout = isPresetWindowMode || (
    activePreset === 'MAX'
    && currentStartMonth === minAvailableMonth
    && currentEndMonth === maxAvailableMonth
    && fullHistoryMatchesFixedPreset
  );
  const isRangeValid = !currentStartMonth || !currentEndMonth || compareMonthStrings(currentStartMonth, currentEndMonth) <= 0;
  const startBoundaryDate = currentStartMonth ? `${currentStartMonth}-01` : '';
  const endBoundaryDate = currentEndMonth ? getMonthEndDate(currentEndMonth) : '';

  const filteredPriceRows = useMemo(() => {
    if (!priceRows.length || !startBoundaryDate || !endBoundaryDate || !isRangeValid) {
      return [];
    }

    return priceRows.filter((priceRow) => {
      return priceRow.date >= startBoundaryDate && priceRow.date <= endBoundaryDate;
    });
  }, [endBoundaryDate, isRangeValid, priceRows, startBoundaryDate]);

  const tablePoints = useMemo(() => {
    if (!annualMetrics.length || !startBoundaryDate || !endBoundaryDate || !isRangeValid) {
      return [];
    }

    // The table uses annual points only, while the chart still uses all daily prices.
    // Filtering them separately lets a short date range keep a dense chart without inventing
    // extra fiscal-year rows that the backend does not actually have.
    // The number of columns now comes from every completed year-end row inside the visible
    // chart range, not from a preset-specific cap such as "10Y means 10 table columns".
    return annualMetrics.filter((annualRow) => {
      return annualRow.fiscalYearEndDate >= startBoundaryDate && annualRow.fiscalYearEndDate <= endBoundaryDate;
    });
  }, [annualMetrics, endBoundaryDate, isRangeValid, startBoundaryDate]);
  const visibleMetricRows = useMemo(() => {
    return metricsRows.filter((row) => row.isEnabled !== false);
  }, [metricsRows]);
  const hiddenMetricRows = useMemo(() => {
    return metricsRows.filter((row) => row.isEnabled === false);
  }, [metricsRows]);

  const dashboardFieldRows = useMemo(() => {
    return [
      {
        key: 'fiscalYearEndDate',
        fieldPath: 'annualData[].fiscalYearEndDate',
        label: 'FY end date',
        shortLabel: getShortLabel('FY end date'),
        isHeader: true,
        formatter: (value, options = {}) => formatFiscalReleaseLabel(value, options.compact),
      },
      {
        key: 'fiscalYear',
        fieldPath: 'annualData[].fiscalYear',
        label: 'FY',
        shortLabel: getShortLabel('Fiscal year'),
        formatter: (value) => (Number.isInteger(value) ? String(value) : '--'),
      },
      {
        key: 'earningsReleaseDate',
        fieldPath: 'annualData[].earningsReleaseDate',
        label: 'FY release date',
        shortLabel: getShortLabel('FY release date'),
        formatter: (value, options = {}) => formatFiscalReleaseLabel(value, options.compact),
      },
      {
        key: 'sharePrice',
        fieldPath: 'annualData[].base.sharePrice',
        label: 'Share price',
        shortLabel: getShortLabel('Share price'),
        formatter: (value, options = {}) => (options.compact ? formatShortCurrency(value) : formatCurrency(value)),
      },
      {
        key: 'sharesOnIssue',
        fieldPath: 'annualData[].base.sharesOnIssue',
        label: 'Shares on issue',
        shortLabel: getShortLabel('Shares on issue'),
        formatter: (value) => formatCompactNumber(value),
      },
      {
        key: 'marketCap',
        fieldPath: 'annualData[].base.marketCap',
        label: 'Market cap',
        shortLabel: getShortLabel('Market cap'),
        formatter: (value) => formatCurrency(value, { compact: true }),
      },
    ];
  }, []);

  const tableRowDefinitions = useMemo(() => {
    return dashboardFieldRows.map((metric, metricIndex) => ({
        key: metric.key,
        label: metric.label,
        shortLabel: metric.shortLabel,
        fieldPath: metric.fieldPath,
        height: metric.isHeader ? HEADER_ROW_HEIGHT : DATA_ROW_HEIGHT,
        backgroundColor: metric.isHeader ? '#f8fafc' : metricIndex % 2 === 1 ? '#fafafa' : '#ffffff',
        borderTop: 'none',
        borderBottom: metric.isHeader
          ? '2px solid #e2e8f0'
          : metricIndex < dashboardFieldRows.length - 1
            ? '1px solid #f1f5f9'
            : 'none',
        isHeader: Boolean(metric.isHeader),
        formatter: metric.formatter,
      }));
  }, [dashboardFieldRows]);
  const supplementalMetricsColumns = useMemo(() => {
    if (!isMetricsOpen) {
      return [];
    }

    return metricsColumns.filter((column) => column.kind !== 'annual');
  }, [isMetricsOpen, metricsColumns]);
  const metricsRowDefinitions = useMemo(() => {
    if (!isMetricsOpen) {
      return [];
    }

    const firstRowKeyBySection = new Map();
    metricsRows.forEach((metricRow) => {
      if (!firstRowKeyBySection.has(metricRow.section)) {
        firstRowKeyBySection.set(metricRow.section, metricRow.rowKey);
      }
    });

    return visibleMetricRows.map((metricRow, metricIndex) => ({
      startsVisibleSection: metricIndex === 0 || metricRow.section !== visibleMetricRows[metricIndex - 1]?.section,
      key: metricRow.rowKey,
      label: metricRow.label,
      shortLabel: metricRow.shortLabel,
      section: metricRow.section,
      shortSection: metricRow.shortSection,
      showSectionLabel:
        (metricIndex === 0 || metricRow.section !== visibleMetricRows[metricIndex - 1]?.section) &&
        firstRowKeyBySection.get(metricRow.section) === metricRow.rowKey,
      fieldPath: metricRow.fieldPath,
      height: METRICS_DATA_ROW_HEIGHT,
      backgroundColor: metricIndex % 2 === 0 ? '#ffffff' : '#fafafa',
      borderTop:
        ((!(isMetricsOpen && isFocusedMetricsMode) && metricIndex === 0) ||
          ((metricRow.section !== visibleMetricRows[metricIndex - 1]?.section) &&
            firstRowKeyBySection.get(metricRow.section) === metricRow.rowKey))
          ? '2px solid #e2e8f0'
          : 'none',
      borderBottom: metricIndex < visibleMetricRows.length - 1 ? '1px solid #f1f5f9' : 'none',
      isHeader: false,
      cells: metricRow.cells,
    }));
  }, [isFocusedMetricsMode, isMetricsOpen, metricsRows, visibleMetricRows]);

  const columnDensity = useMemo(() => {
    return getColumnDensity(tablePoints.length);
  }, [tablePoints.length]);

  const shortLabelLeftRailWidth = useMemo(() => {
    const allVisibleRows = isMetricsOpen
      ? [...dashboardFieldRows, ...visibleMetricRows]
      : dashboardFieldRows;
    const longestShortLabelLength = allVisibleRows.reduce((maximumLength, fieldRow) => {
      return Math.max(maximumLength, String(fieldRow.shortLabel || '').length);
    }, 0);

    // Keep the short-label rail only as wide as the current short labels need,
    // while leaving a small buffer so the text does not kiss the column edge.
    return Math.max(
      MIN_SHORT_LABEL_LEFT_RAIL_WIDTH,
      Math.ceil(longestShortLabelLength * 6.5) + 18,
    );
  }, [dashboardFieldRows, isMetricsOpen, visibleMetricRows]);

  const fullLabelLeftRailWidth = useMemo(() => {
    const allVisibleRows = isMetricsOpen
      ? [...dashboardFieldRows, ...visibleMetricRows]
      : dashboardFieldRows;
    const longestFullLabelLength = allVisibleRows.reduce((maximumLength, fieldRow) => {
      return Math.max(maximumLength, String(fieldRow.label || '').length);
    }, 0);

    // Wide layouts should still hug the active full labels instead of keeping
    // a stale oversized fixed rail. The small buffer preserves breathing room
    // between the text and the column divider.
    return Math.max(
      MIN_FULL_LABEL_LEFT_RAIL_WIDTH,
      Math.ceil(longestFullLabelLength * 6.6) + 18,
    );
  }, [dashboardFieldRows, isMetricsOpen, visibleMetricRows]);

  const compactShortLabelLeftRailWidth = useMemo(() => {
    return Math.max(
      MIN_COMPACT_SHORT_LABEL_LEFT_RAIL_WIDTH,
      shortLabelLeftRailWidth - 8,
    );
  }, [shortLabelLeftRailWidth]);

  const isCompactPresetTable = usesPresetTimelineLayout
    && tablePoints.length >= 8
    && Boolean(scrollState.containerWidth)
    && scrollState.containerWidth < 560;
  // MAX already gets readable spacing from its wider scrollable timeline. Narrow preset windows
  // do not have that extra width, so we switch to a compact presentation before the columns
  // become unreadable on mobile.
  const fixedLeftRailWidth = isCompactPresetTable
    ? (shouldUseShortLabels ? compactShortLabelLeftRailWidth : 136)
    : (shouldUseShortLabels ? shortLabelLeftRailWidth : fullLabelLeftRailWidth);
  const publishScrollMeasurement = useCallback((scrollElement) => {
    if (!scrollElement) {
      return;
    }

    const measuredContainerWidth = scrollElement.clientWidth;
    const nextMeasurement = {
      containerWidth: measuredContainerWidth,
      scrollLeft: scrollElement.scrollLeft,
      viewportWidth: Math.max(measuredContainerWidth - fixedLeftRailWidth, 0),
    };

    if (
      areScrollMeasurementsEqual(lastPublishedScrollMeasurementRef.current, nextMeasurement)
    ) {
      return;
    }

    lastPublishedScrollMeasurementRef.current = nextMeasurement;

    setScrollState((previousScrollState) => {
      return areScrollMeasurementsEqual(previousScrollState, nextMeasurement)
        ? previousScrollState
        : nextMeasurement;
    });
  }, [fixedLeftRailWidth]);
  publishScrollMeasurementRef.current = publishScrollMeasurement;

  const timelineLayout = useMemo(() => {
    if (usesPresetTimelineLayout) {
      const timelineViewportWidth = Math.max(
        (scrollState.containerWidth || (fixedLeftRailWidth + RIGHT_TIMELINE_MIN_WIDTH)) - fixedLeftRailWidth,
        1,
      );
      const minimumColumnWidth = getPresetMinimumColumnWidth(isCompactPresetTable);
      const minimumIntrinsicPlotWidth = tablePoints.length
        ? tablePoints.length * minimumColumnWidth
        : minimumColumnWidth;
      const minimumIntrinsicContentWidth = minimumIntrinsicPlotWidth + CHART_RIGHT_PADDING;
      const chartContentWidth = Math.max(timelineViewportWidth, minimumIntrinsicContentWidth, 1);
      const plotWidth = Math.max(chartContentWidth - CHART_RIGHT_PADDING, 1);
      const yearCellWidth = tablePoints.length
        ? Math.max(Math.floor(plotWidth / tablePoints.length), minimumColumnWidth)
        : minimumColumnWidth;
      const contentWidth = chartContentWidth + (supplementalMetricsColumns.length * yearCellWidth);

      return {
        plotWidth,
        chartContentWidth,
        contentWidth,
        yearCellWidth,
        headerFontSize: isCompactPresetTable ? { xs: '10px', sm: '11px' } : { xs: '11px', sm: '12px' },
        bodyFontSize: isCompactPresetTable ? { xs: '10px', sm: '11px', md: '12px' } : { xs: '11px', sm: '12px', md: '13px' },
      };
    }

    const plotWidth = Math.max(RIGHT_TIMELINE_MIN_WIDTH, tablePoints.length * columnDensity.columnWidth);
    const chartContentWidth = plotWidth + CHART_RIGHT_PADDING;
    const contentWidth = chartContentWidth + (supplementalMetricsColumns.length * columnDensity.columnWidth);

    return {
      plotWidth,
      chartContentWidth,
      contentWidth,
      yearCellWidth: columnDensity.columnWidth,
      headerFontSize: { xs: '11px', sm: '12px' },
      bodyFontSize: { xs: '11px', sm: '12px', md: '13px' },
    };
  }, [
    columnDensity,
    fixedLeftRailWidth,
    isCompactPresetTable,
    scrollState.containerWidth,
    supplementalMetricsColumns.length,
    tablePoints.length,
    usesPresetTimelineLayout,
  ]);

  useLayoutEffect(() => {
    if (presetBootstrapKeyRef.current !== presetBootstrapKey) {
      presetBootstrapKeyRef.current = presetBootstrapKey;
      hasBootstrappedPresetRef.current = false;
    }
  }, [presetBootstrapKey]);

  useLayoutEffect(() => {
    const scrollElement = timelineScrollRef.current;

    if (!scrollElement) {
      return undefined;
    }

    const updateScrollWindow = () => {
      publishScrollMeasurementRef.current(scrollElement);
    };

    // Preset windows and free-range windows share the same DOM scroller, but not the same meaning.
    // Fixed-length presets use scroll to PAN the selected month range itself, while MAX/custom
    // ranges use scroll inside the already-selected range for long-history chart/table layouts.
    updateScrollWindow();
    // Some cards report their final width one frame after mount, so we re-measure once more
    // on the next frame instead of waiting for the user to manually resize the browser.
    measurementFrameRef.current = requestAnimationFrame(() => {
      measurementFrameRef.current = null;
      updateScrollWindow();

      // Short-history preset cards can mount their scroll region before the browser has
      // finalized the real card width. One extra post-paint recheck closes that gap
      // without relying on the user to manually resize the window.
      postPaintMeasurementFrameRef.current = requestAnimationFrame(() => {
        postPaintMeasurementFrameRef.current = null;
        updateScrollWindow();
      });
    });

    scrollElement.addEventListener('scroll', updateScrollWindow, { passive: true });

    let resizeObserver = null;

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollWindow();
      });
      resizeObserver.observe(scrollElement);
    } else {
      window.addEventListener('resize', updateScrollWindow);
    }

    return () => {
      scrollElement.removeEventListener('scroll', updateScrollWindow);

      if (measurementFrameRef.current) {
        cancelAnimationFrame(measurementFrameRef.current);
        measurementFrameRef.current = null;
      }

      if (postPaintMeasurementFrameRef.current) {
        cancelAnimationFrame(postPaintMeasurementFrameRef.current);
        postPaintMeasurementFrameRef.current = null;
      }

      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateScrollWindow);
      }
    };
  // Re-run when data loads (priceRows.length 0→N) so the scroll element — which only
  // renders after loading finishes — gets its ResizeObserver and initial measurement.
  // publishScrollMeasurementRef.current is always kept current so we never need to
  // re-run this effect just because fixedLeftRailWidth changed; the ResizeObserver
  // naturally picks up the new viewportWidth on the next layout pass.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceRows.length]);

  useLayoutEffect(() => {
    if (!isPresetWindowMode || isPresetScrollReady || hasBootstrappedPresetRef.current) {
      return undefined;
    }

    const scrollElement = timelineScrollRef.current;

    if (!scrollElement || scrollState.containerWidth <= 0) {
      return undefined;
    }

    const nextScrollLeft = maxPresetPanOffset * PRESET_PAN_STEP_PX;

    hasBootstrappedPresetRef.current = true;
    scrollElement.scrollLeft = nextScrollLeft;
    publishScrollMeasurementRef.current(scrollElement);

    if (presetBootstrapFrameRef.current) {
      cancelAnimationFrame(presetBootstrapFrameRef.current);
    }

    // The hidden preset pan track is wider than the visible chart area so
    // users can drag backward through older history. On first load we
    // always park the scrollbar at the far-right edge, which represents
    // the newest trailing preset window such as the latest available 5Y.
    presetBootstrapFrameRef.current = requestAnimationFrame(() => {
      presetBootstrapFrameRef.current = null;
      scrollElement.scrollLeft = nextScrollLeft;
      publishScrollMeasurementRef.current(scrollElement);
    });

    if (presetPanOffsetMonths !== 0) {
      setPresetPanOffsetMonths(0);
    }

    setIsPresetScrollReady(true);

    return () => {
      if (presetBootstrapFrameRef.current) {
        cancelAnimationFrame(presetBootstrapFrameRef.current);
        presetBootstrapFrameRef.current = null;
      }
    };
  }, [
    isPresetScrollReady,
    isPresetWindowMode,
    maxPresetPanOffset,
    presetPanOffsetMonths,
    presetBootstrapKey,
    scrollState.containerWidth,
  ]);

  useLayoutEffect(() => {
    if (!isPresetWindowMode || !isPresetScrollReady) {
      return;
    }

    const scrollElement = timelineScrollRef.current;

    if (!scrollElement) {
      return;
    }

    if (!maxPresetPanOffset) {
      if (presetPanOffsetMonths !== 0) {
        setPresetPanOffsetMonths(0);
      }
      return;
    }

    const currentPresetScrollLeft = scrollElement.scrollLeft;
    const nextPresetPanOffset = Math.min(
      Math.max(maxPresetPanOffset - Math.round(currentPresetScrollLeft / PRESET_PAN_STEP_PX), 0),
      maxPresetPanOffset,
    );

    if (nextPresetPanOffset !== presetPanOffsetMonths) {
      setPresetPanOffsetMonths(nextPresetPanOffset);
    }
  }, [isPresetScrollReady, isPresetWindowMode, maxPresetPanOffset, presetPanOffsetMonths, scrollState.scrollLeft, scrollState.viewportWidth]);

  useEffect(() => {
    return () => {
      if (presetBootstrapFrameRef.current) {
        cancelAnimationFrame(presetBootstrapFrameRef.current);
        presetBootstrapFrameRef.current = null;
      }

      if (measurementFrameRef.current) {
        cancelAnimationFrame(measurementFrameRef.current);
        measurementFrameRef.current = null;
      }

      if (postPaintMeasurementFrameRef.current) {
        cancelAnimationFrame(postPaintMeasurementFrameRef.current);
        postPaintMeasurementFrameRef.current = null;
      }

    };
  }, []);

  const visibleWindow = useMemo(() => {
    if (usesPresetTimelineLayout) {
      return {
        left: 0,
        right: timelineLayout.plotWidth,
        width: timelineLayout.plotWidth,
      };
    }

    const quantizedScrollLeft = Math.round(scrollState.scrollLeft / SCALE_WINDOW_STEP_PX) * SCALE_WINDOW_STEP_PX;
    const viewportWidth = Math.min(
      Math.max(scrollState.viewportWidth || 0, 0),
      timelineLayout.plotWidth,
    );

    if (!viewportWidth) {
      return {
        left: 0,
        right: timelineLayout.plotWidth,
        width: timelineLayout.plotWidth,
      };
    }

    const maxScrollLeft = Math.max(timelineLayout.contentWidth - viewportWidth, 0);
    const clampedScrollLeft = Math.min(Math.max(quantizedScrollLeft, 0), maxScrollLeft);
    const rightEdge = Math.min(clampedScrollLeft + viewportWidth, timelineLayout.plotWidth);

    return {
      left: Math.min(clampedScrollLeft, timelineLayout.plotWidth),
      right: rightEdge,
      width: Math.max(rightEdge - clampedScrollLeft, 1),
    };
  }, [scrollState.scrollLeft, scrollState.viewportWidth, timelineLayout.contentWidth, timelineLayout.plotWidth, usesPresetTimelineLayout]);

  const chartXGeometry = useMemo(() => {
    return createChartXGeometry({
      filteredPriceRows,
      tablePoints,
      plotWidth: timelineLayout.plotWidth,
      yearCellWidth: timelineLayout.yearCellWidth,
    });
  }, [filteredPriceRows, tablePoints, timelineLayout.plotWidth, timelineLayout.yearCellWidth]);

  const visiblePriceRows = useMemo(() => {
    if (!filteredPriceRows.length) {
      return [];
    }

    if (filteredPriceRows.length === 1) {
      return filteredPriceRows;
    }

    const visibleStartTime = chartXGeometry.mapXToTime(visibleWindow.left);
    const visibleEndTime = chartXGeometry.mapXToTime(visibleWindow.right);

    const rowsInView = filteredPriceRows.filter((priceRow) => {
      const pointTime = new Date(priceRow.date).getTime();
      return pointTime >= visibleStartTime && pointTime <= visibleEndTime;
    });

    return rowsInView.length > 0 ? rowsInView : filteredPriceRows;
  }, [chartXGeometry, filteredPriceRows, visibleWindow.left, visibleWindow.right]);

  const rawVisibleScale = useMemo(() => {
    return getRawChartScale(visiblePriceRows);
  }, [visiblePriceRows]);

  const preferredYAxisTickCount = useMemo(() => {
    return getPreferredTickCount(CHART_PLOT_HEIGHT);
  }, []);

  const targetChartScale = useMemo(() => {
    return getTargetChartScale(rawVisibleScale, {
      preferredTickCount: preferredYAxisTickCount,
    });
  }, [preferredYAxisTickCount, rawVisibleScale]);
  const targetChartScaleSignature = useMemo(() => {
    return getScaleSignature(targetChartScale);
  }, [targetChartScale]);

  useEffect(() => {
    renderedScaleRef.current = renderedScale;
  }, [renderedScale]);

  useEffect(() => {
    if (!filteredPriceRows.length) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (contractionTimeoutRef.current) {
        clearTimeout(contractionTimeoutRef.current);
        contractionTimeoutRef.current = null;
      }

      setRenderedScale({
        minPrice: 0,
        maxPrice: 0,
        step: 1,
        ticks: [],
      });
      renderedScaleRef.current = {
        minPrice: 0,
        maxPrice: 0,
        step: 1,
        ticks: [],
      };
      return undefined;
    }

    const currentScale = renderedScaleRef.current;

    if (
      currentScale.minPrice === 0 &&
      currentScale.maxPrice === 0 &&
      currentScale.ticks.length === 0
    ) {
      if (!areScaleValuesClose(currentScale, targetChartScale)) {
        setRenderedScale(targetChartScale);
        renderedScaleRef.current = targetChartScale;
      }
      return undefined;
    }

    if (areScaleValuesClose(currentScale, targetChartScale)) {
      return undefined;
    }

    const shouldDisableScaleAnimation =
      scaleAnimationDurationMs !== null
      && scaleAnimationDurationMs !== undefined
      && scaleAnimationDurationMs <= 0;

    if (shouldDisableScaleAnimation) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (contractionTimeoutRef.current) {
        clearTimeout(contractionTimeoutRef.current);
        contractionTimeoutRef.current = null;
      }

      if (!areScaleValuesClose(renderedScaleRef.current, targetChartScale)) {
        setRenderedScale(targetChartScale);
        renderedScaleRef.current = targetChartScale;
      }
      return undefined;
    }

    const isExpandingDown = targetChartScale.minPrice < currentScale.minPrice;
    const isExpandingUp = targetChartScale.maxPrice > currentScale.maxPrice;
    const shouldExpandImmediately = isExpandingDown || isExpandingUp;
    const transitionDelay = shouldExpandImmediately ? 0 : SCALE_CONTRACTION_DELAY_MS;
    const transitionDuration = shouldExpandImmediately
      ? (scaleAnimationDurationMs ?? SCALE_EXPANSION_DURATION_MS)
      : (scaleAnimationDurationMs ?? SCALE_CONTRACTION_DURATION_MS);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (contractionTimeoutRef.current) {
      clearTimeout(contractionTimeoutRef.current);
    }

    const animateToScale = () => {
      const animationStartScale = renderedScaleRef.current;
      const animationStartTime = performance.now();

      const step = (currentTime) => {
        const elapsed = currentTime - animationStartTime;
        const progress = Math.min(elapsed / transitionDuration, 1);
        const easedProgress = 1 - ((1 - progress) ** 3);
        const nextScale = buildRoundedChartScale(
          animationStartScale.minPrice + ((targetChartScale.minPrice - animationStartScale.minPrice) * easedProgress),
          animationStartScale.maxPrice + ((targetChartScale.maxPrice - animationStartScale.maxPrice) * easedProgress),
          {
            preferredTickCount: preferredYAxisTickCount,
          },
        );

        if (!areScaleValuesClose(renderedScaleRef.current, nextScale)) {
          renderedScaleRef.current = nextScale;
          setRenderedScale(nextScale);
        }

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(step);
        } else {
          renderedScaleRef.current = targetChartScale;
          animationFrameRef.current = null;
        }
      };

      animationFrameRef.current = requestAnimationFrame(step);
    };

    contractionTimeoutRef.current = window.setTimeout(animateToScale, transitionDelay);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (contractionTimeoutRef.current) {
        clearTimeout(contractionTimeoutRef.current);
        contractionTimeoutRef.current = null;
      }
    };
  }, [
    filteredPriceRows.length,
    preferredYAxisTickCount,
    scaleAnimationDurationMs,
    targetChartScale,
    targetChartScaleSignature,
  ]);

  const chartGeometry = useMemo(() => {
    if (!filteredPriceRows.length) {
      return {
        anchorPositions: [],
        fiscalYearBands: [],
        svgPath: '',
        pointPositions: [],
        januaryPositions: [],
        minPrice: 0,
        maxPrice: 0,
        ticks: [],
        mapTimeToX: () => 0,
        mapXToTime: () => 0,
      };
    }

    // The visible window tells us which prices are onscreen right now.
    // The raw visible scale reacts immediately to that data, but the rendered scale
    // expands quickly and contracts more slowly so scroll-driven re-scaling feels calmer.
    const { minPrice, maxPrice, ticks } = renderedScale;
    // We intentionally use two date systems here:
    // release dates place the fixed column/tick centers, but FY end dates define the
    // actual fiscal periods that the hover bands and watermark should cover.
    const fiscalYearBands = chartXGeometry.anchorPositions.map((anchorPosition, index) => {
      const previousAnchor = index > 0 ? chartXGeometry.anchorPositions[index - 1] : null;
      const startX = previousAnchor
        ? chartXGeometry.mapTimeToX(previousAnchor.fiscalYearEndTime)
        : 0;
      const endX = chartXGeometry.mapTimeToX(anchorPosition.fiscalYearEndTime);
      const clampedStartX = Math.max(startX, 0);
      const clampedEndX = Math.min(Math.max(endX, clampedStartX), timelineLayout.plotWidth);

      return {
        fiscalYear: anchorPosition.fiscalYear,
        centerX: clampedStartX + ((clampedEndX - clampedStartX) / 2),
        startX: clampedStartX,
        endX: clampedEndX,
        width: Math.max(clampedEndX - clampedStartX, 0),
        isAlternate: index % 2 === 1,
      };
    }).filter((band) => band && band.width > 0);

    return {
      anchorPositions: chartXGeometry.anchorPositions,
      fiscalYearBands,
      svgPath: buildSvgPath(
        filteredPriceRows,
        minPrice,
        maxPrice,
        chartXGeometry.mapTimeToX,
        CHART_HEIGHT,
        {
          topPadding: CHART_TOP_PADDING,
          bottomPadding: CHART_BOTTOM_PADDING,
        },
      ),
      pointPositions: chartXGeometry.anchorPositions,
      januaryPositions: getJanuaryPositions(
        filteredPriceRows,
        chartXGeometry.minTime,
        chartXGeometry.maxTime,
        chartXGeometry.mapTimeToX,
      ),
      minPrice,
      maxPrice,
      ticks,
      mapTimeToX: chartXGeometry.mapTimeToX,
      mapXToTime: chartXGeometry.mapXToTime,
    };
  }, [chartXGeometry, filteredPriceRows, renderedScale, timelineLayout.plotWidth, timelineLayout.yearCellWidth]);

  const visibleYAxisLabels = useMemo(() => {
    if (chartGeometry.ticks.length <= 2) {
      return chartGeometry.ticks;
    }

    const maxVisibleLabelCount = Math.max(
      2,
      Math.floor(CHART_PLOT_HEIGHT / Y_AXIS_LABEL_MIN_SPACING_PX) + 1,
    );

    if (chartGeometry.ticks.length <= maxVisibleLabelCount) {
      return chartGeometry.ticks;
    }

    const labelEveryN = Math.ceil((chartGeometry.ticks.length - 1) / (maxVisibleLabelCount - 1));

    return chartGeometry.ticks.filter((tickValue, index) => {
      return index === 0 || index === chartGeometry.ticks.length - 1 || index % labelEveryN === 0;
    });
  }, [chartGeometry.ticks]);

  const baseSurfaceWidth = fixedLeftRailWidth + timelineLayout.contentWidth;
  const presetPanTrackWidth = Math.max(scrollState.containerWidth || baseSurfaceWidth, baseSurfaceWidth) + (maxPresetPanOffset * PRESET_PAN_STEP_PX);
  const scrollSurfaceWidth = isPresetWindowMode ? presetPanTrackWidth : baseSurfaceWidth;
  // Focused metrics mode is intentionally a second visual mode of the same card.
  // The page decides *which* stock is in focus, while the card decides *how*
  // to render the focused layout once that mode is active.
  const usesFocusedMetricsViewport = isMetricsOpen && isFocusedMetricsMode;
  const visibleAnnualMetricColumnKeys = useMemo(() => {
    return new Set(tablePoints.map((annualRow) => `annual-${annualRow.fiscalYear}`));
  }, [tablePoints]);
  const renderedMetricsColumns = useMemo(() => {
    const visibleHistoricalColumns = metricsColumns.filter((column) => {
      return column.kind === 'annual' && visibleAnnualMetricColumnKeys.has(column.key);
    });

    return [...visibleHistoricalColumns, ...supplementalMetricsColumns];
  }, [metricsColumns, supplementalMetricsColumns, visibleAnnualMetricColumnKeys]);
  const renderedMetricCellByRowKey = useMemo(() => {
    const cellMap = new Map();

    visibleMetricRows.forEach((metricRow) => {
      cellMap.set(
        metricRow.rowKey,
        new Map((metricRow.cells || []).map((cell) => [cell.columnKey, cell])),
      );
    });

    return cellMap;
  }, [visibleMetricRows]);
  const metricsColumnCenterByKey = useMemo(() => {
    const columnCenters = new Map();

    chartGeometry.pointPositions.forEach((position, index) => {
      const annualRow = tablePoints[index];
      if (!annualRow) {
        return;
      }

      columnCenters.set(`annual-${annualRow.fiscalYear}`, position.x);
    });

    supplementalMetricsColumns.forEach((column, index) => {
      const centerX = timelineLayout.plotWidth + CHART_RIGHT_PADDING + ((index + 0.5) * timelineLayout.yearCellWidth);
      columnCenters.set(column.key, centerX);
    });

    return columnCenters;
  }, [chartGeometry.pointPositions, supplementalMetricsColumns, tablePoints, timelineLayout.plotWidth, timelineLayout.yearCellWidth]);

  const handlePresetClick = (preset) => {
    const nextRange = getTrailingRange({
      monthCount: preset.monthCount,
      minAvailableMonth,
      maxAvailableMonth,
    });

    setFreeRangeMonths(nextRange);
    setRangeMode(preset.monthCount ? 'preset' : 'free');
    setActivePreset(preset.key);
    setIsPresetScrollReady(false);
    setPresetPanOffsetMonths(0);
  };

  const handleMetricsVisibilityToggle = () => {
    // We keep the page-level "which stock is focused?" decision outside this
    // component, but this card still owns the local open/closed state for the
    // metrics surface itself. The callback bridges those two layers.
    const nextIsMetricsOpen = !isMetricsOpen;

    setMetricsActionError('');
    setMetricEditorState(null);
    setMetricEditorValue('');
    setIsMetricsOpen(nextIsMetricsOpen);

    if (typeof onMetricsVisibilityChange === 'function') {
      onMetricsVisibilityChange(nextIsMetricsOpen);
    }
  };

  const clearHoverState = () => {
    setHoverState({
      date: '',
      price: null,
      x: null,
    });
  };

  const clearActiveFiscalBand = () => {
    setActiveFiscalBand(null);
  };

  const clearLongPressTimeout = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const clearMetricCellLongPressTimeout = () => {
    if (metricCellLongPressTimeoutRef.current) {
      clearTimeout(metricCellLongPressTimeoutRef.current);
      metricCellLongPressTimeoutRef.current = null;
    }
  };

  const clearMetricRowLongPressTimeout = () => {
    if (metricRowLongPressTimeoutRef.current) {
      clearTimeout(metricRowLongPressTimeoutRef.current);
      metricRowLongPressTimeoutRef.current = null;
    }
  };

  const openMetricEditor = (cell, fieldPath, anchorRect) => {
    if (!cell?.isOverrideable || !cell?.overrideTarget) {
      return;
    }

    setMetricsActionError('');
    setMetricEditorState({
      overrideTarget: cell.overrideTarget,
      fieldPath,
      anchorRect,
    });
    setMetricEditorValue(cell.value === null || cell.value === undefined ? '' : String(cell.value));
  };

  const closeMetricEditor = () => {
    setMetricEditorState(null);
    setMetricEditorValue('');
  };

  const openMetricRowActionMenu = (metricRow, anchorRect) => {
    if (!metricRow?.key) {
      return;
    }

    setMetricsActionError('');
    closeMetricEditor();
    setMetricRowActionMenuState({
      rowKey: metricRow.key,
      rowLabel: metricRow.label,
      anchorRect,
    });
  };

  const closeMetricRowActionMenu = () => {
    setMetricRowActionMenuState(null);
  };

  const suppressContextMenuEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent?.stopImmediatePropagation?.();
  };

  const handleMetricCellContextMenu = (event, metricRow, cell) => {
    if (!cell?.isOverrideable) {
      return;
    }

    suppressContextMenuEvent(event);
    closeMetricRowActionMenu();
    openMetricEditor(cell, metricRow.fieldPath, event.currentTarget.getBoundingClientRect());
  };

  const handleMetricCellMouseDown = (event, cell) => {
    if (!cell?.isOverrideable || event.button !== 2) {
      return;
    }

    suppressContextMenuEvent(event);
  };

  const handleMetricCellTouchStart = (event, metricRow, cell) => {
    if (!cell?.isOverrideable || !event.touches?.length) {
      return;
    }

    const touch = event.touches[0];
    const anchorRect = event.currentTarget?.getBoundingClientRect?.();
    metricCellTouchStateRef.current = {
      isActive: false,
      startClientX: touch.clientX,
      startClientY: touch.clientY,
    };

    clearMetricCellLongPressTimeout();
    metricCellLongPressTimeoutRef.current = window.setTimeout(() => {
      metricCellTouchStateRef.current.isActive = true;
      closeMetricRowActionMenu();
      openMetricEditor(cell, metricRow.fieldPath, anchorRect);
    }, LONG_PRESS_ACTIVATION_MS + 150);
  };

  const handleMetricCellTouchMove = (event) => {
    if (!event.touches?.length) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - metricCellTouchStateRef.current.startClientX);
    const deltaY = Math.abs(touch.clientY - metricCellTouchStateRef.current.startClientY);

    if (deltaX > LONG_PRESS_MOVE_TOLERANCE_PX || deltaY > LONG_PRESS_MOVE_TOLERANCE_PX) {
      clearMetricCellLongPressTimeout();
    }
  };

  const handleMetricCellTouchEnd = () => {
    clearMetricCellLongPressTimeout();
    metricCellTouchStateRef.current.isActive = false;
  };

  const handleMetricRowContextMenu = (event, metricRow) => {
    suppressContextMenuEvent(event);
    openMetricRowActionMenu(metricRow, event.currentTarget.getBoundingClientRect());
  };

  const handleMetricRowMouseDown = (event) => {
    if (event.button !== 2) {
      return;
    }

    suppressContextMenuEvent(event);
  };

  const handleMetricRowTouchStart = (event, metricRow) => {
    if (!event.touches?.length) {
      return;
    }

    const touch = event.touches[0];
    const anchorRect = event.currentTarget?.getBoundingClientRect?.();
    metricRowTouchStateRef.current = {
      isActive: false,
      startClientX: touch.clientX,
      startClientY: touch.clientY,
    };

    clearMetricRowLongPressTimeout();
    metricRowLongPressTimeoutRef.current = window.setTimeout(() => {
      metricRowTouchStateRef.current.isActive = true;
      openMetricRowActionMenu(metricRow, anchorRect);
    }, LONG_PRESS_ACTIVATION_MS + 150);
  };

  const handleMetricRowTouchMove = (event) => {
    if (!event.touches?.length) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - metricRowTouchStateRef.current.startClientX);
    const deltaY = Math.abs(touch.clientY - metricRowTouchStateRef.current.startClientY);

    if (deltaX > LONG_PRESS_MOVE_TOLERANCE_PX || deltaY > LONG_PRESS_MOVE_TOLERANCE_PX) {
      clearMetricRowLongPressTimeout();
    }
  };

  const handleMetricRowTouchEnd = () => {
    clearMetricRowLongPressTimeout();
    metricRowTouchStateRef.current.isActive = false;
  };

  const handleSaveMetricOverride = async () => {
    if (!metricEditorState?.overrideTarget) {
      return;
    }

    setIsSavingMetricOverride(true);
    setMetricsActionError('');

    try {
      await updateDashboardMetricOverride(
        identifier,
        metricEditorState.overrideTarget,
        coerceMetricEditorValue(metricEditorValue, metricEditorState.fieldPath),
      );
      await reloadDashboardPayload();
      closeMetricEditor();
    } catch (requestError) {
      setMetricsActionError(
        requestError.response?.data?.message
          || requestError.response?.data?.error
          || 'Unable to save that override right now.',
      );
    } finally {
      setIsSavingMetricOverride(false);
    }
  };

  const handleClearMetricOverride = async () => {
    if (!metricEditorState?.overrideTarget) {
      return;
    }

    setIsSavingMetricOverride(true);
    setMetricsActionError('');

    try {
      await updateDashboardMetricOverride(
        identifier,
        metricEditorState.overrideTarget,
        null,
      );
      await reloadDashboardPayload();
      closeMetricEditor();
    } catch (requestError) {
      setMetricsActionError(
        requestError.response?.data?.message
          || requestError.response?.data?.error
          || 'Unable to clear that override right now.',
      );
    } finally {
      setIsSavingMetricOverride(false);
    }
  };

  const handleMetricRowEnabledState = async (rowKey, isEnabled) => {
    setIsUpdatingRowPreference(true);
    setMetricsActionError('');

    try {
      const response = await updateDashboardRowPreference(identifier, rowKey, isEnabled);
      applyMetricsViewUpdate(response);
      return true;
    } catch (requestError) {
      setMetricsActionError(
        requestError.response?.data?.message
          || requestError.response?.data?.error
          || 'Unable to save row visibility right now.',
      );
      return false;
    } finally {
      setIsUpdatingRowPreference(false);
    }
  };

  const handleHideMetricRow = async () => {
    if (!metricRowActionMenuState?.rowKey) {
      return;
    }

    const didHideRow = await handleMetricRowEnabledState(metricRowActionMenuState.rowKey, false);

    if (didHideRow) {
      closeMetricRowActionMenu();
    }
  };

  const getSvgXFromClientX = (clientX) => {
    const svgRect = svgRef.current?.getBoundingClientRect?.();

    if (!svgRect || !svgRect.width || !Number.isFinite(clientX)) {
      return null;
    }

    return ((clientX - svgRect.left) / svgRect.width) * timelineLayout.contentWidth;
  };

  const resolveFiscalBandForSvgX = (svgX) => {
    if (!Number.isFinite(svgX) || svgX < 0 || svgX > timelineLayout.plotWidth) {
      return null;
    }

    return chartGeometry.fiscalYearBands.find((band) => {
      return svgX >= band.startX && svgX <= band.endX;
    }) || null;
  };

  const updateHoverStateFromSvgX = (svgX) => {
    if (!filteredPriceRows.length || svgX === null || svgX < 0 || svgX > timelineLayout.plotWidth) {
      clearHoverState();
      return;
    }

    const targetTime = chartGeometry.mapXToTime(svgX);

    let closestPoint = filteredPriceRows[0];
    let smallestDifference = Math.abs(new Date(filteredPriceRows[0].date).getTime() - targetTime);

    for (let index = 1; index < filteredPriceRows.length; index += 1) {
      const point = filteredPriceRows[index];
      const difference = Math.abs(new Date(point.date).getTime() - targetTime);

      if (difference < smallestDifference) {
        closestPoint = point;
        smallestDifference = difference;
      }
    }

    setHoverState({
      date: formatLongDate(closestPoint.date),
      price: closestPoint.close,
      x: chartGeometry.mapTimeToX(new Date(closestPoint.date).getTime()),
    });
  };

  const handleMouseMove = (event) => {
    if (!svgRef.current || !filteredPriceRows.length) {
      return;
    }

    const svgX = getSvgXFromClientX(event.clientX);
    updateHoverStateFromSvgX(svgX);
    setActiveFiscalBand(resolveFiscalBandForSvgX(svgX));
  };

  const handleMouseLeave = () => {
    clearHoverState();
    clearActiveFiscalBand();
  };

  const handleTouchStart = (event) => {
    if (!event.touches?.length) {
      return;
    }

    const touch = event.touches[0];
    touchLongPressStateRef.current = {
      isActive: false,
      startClientX: touch.clientX,
      startClientY: touch.clientY,
    };

    clearLongPressTimeout();
    longPressTimeoutRef.current = window.setTimeout(() => {
      touchLongPressStateRef.current.isActive = true;
      const svgX = getSvgXFromClientX(touch.clientX);
      setActiveFiscalBand(resolveFiscalBandForSvgX(svgX));
    }, LONG_PRESS_ACTIVATION_MS);
  };

  const handleTouchMove = (event) => {
    if (!event.touches?.length) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - touchLongPressStateRef.current.startClientX);
    const deltaY = Math.abs(touch.clientY - touchLongPressStateRef.current.startClientY);

    if (!touchLongPressStateRef.current.isActive) {
      if (deltaX > LONG_PRESS_MOVE_TOLERANCE_PX || deltaY > LONG_PRESS_MOVE_TOLERANCE_PX) {
        clearLongPressTimeout();
      }
      return;
    }

    const svgX = getSvgXFromClientX(touch.clientX);
    setActiveFiscalBand(resolveFiscalBandForSvgX(svgX));
  };

  const handleTouchEnd = () => {
    clearLongPressTimeout();
    touchLongPressStateRef.current.isActive = false;
    clearActiveFiscalBand();
  };

  useEffect(() => {
    return () => {
      clearLongPressTimeout();
      clearMetricCellLongPressTimeout();
      clearMetricRowLongPressTimeout();
    };
  }, []);

  useEffect(() => {
    if (!metricRowActionMenuState) {
      return undefined;
    }

    const handleOutsideInteraction = (event) => {
      if (metricRowActionMenuRef.current?.contains?.(event.target)) {
        return;
      }

      closeMetricRowActionMenu();
    };

    document.addEventListener('mousedown', handleOutsideInteraction);
    document.addEventListener('touchstart', handleOutsideInteraction);

    return () => {
      document.removeEventListener('mousedown', handleOutsideInteraction);
      document.removeEventListener('touchstart', handleOutsideInteraction);
    };
  }, [metricRowActionMenuState]);

  useEffect(() => {
    if (isMetricsOpen) {
      return;
    }

    closeMetricEditor();
    closeMetricRowActionMenu();
  }, [isMetricsOpen]);

  const handleInvestmentCategoryChange = async (event) => {
    const nextInvestmentCategory = event.target.value;

    if (!identifier || !nextInvestmentCategory || nextInvestmentCategory === dashboardData?.investmentCategory) {
      return;
    }

    setInvestmentCategoryError('');
    setIsUpdatingInvestmentCategory(true);

    try {
      const updatedCategory = await updateDashboardInvestmentCategory(identifier, nextInvestmentCategory);
      await reloadDashboardPayload();
      setDashboardData((previousDashboardData) => {
        if (!previousDashboardData) {
          return previousDashboardData;
        }

        return {
          ...previousDashboardData,
          investmentCategory: updatedCategory.investmentCategory,
        };
      });
    } catch (requestError) {
      setInvestmentCategoryError(
        requestError.response?.data?.message ||
          requestError.response?.data?.error ||
          'Unable to update the investment category right now.',
      );
    } finally {
      setIsUpdatingInvestmentCategory(false);
    }
  };

  let cardBody = null;

  if (isLoading) {
    cardBody = (
      <Box
        sx={{
          minHeight: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          px: 3,
        }}
      >
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Loading dashboard data...
        </Typography>
      </Box>
    );
  } else if (error) {
    cardBody = (
      <Box
        sx={{
          minHeight: 420,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
        }}
      >
        <Typography variant="body2" color="error" align="center">
          {error}
        </Typography>
      </Box>
    );
  } else if (!isRangeValid) {
    cardBody = (
      <Box
        sx={{
          minHeight: 420,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
        }}
      >
        <Typography variant="body2" color="error" align="center">
          Start month must be earlier than or equal to end month.
        </Typography>
      </Box>
    );
  } else if (filteredPriceRows.length === 0) {
    cardBody = (
      <Box
        sx={{
          minHeight: 420,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
        }}
      >
        <Typography variant="body2" color="text.secondary" align="center">
          No chart data is available for the selected month range.
        </Typography>
      </Box>
    );
  } else {
    // The detail metrics rows already share the same annual-column geometry as
    // the chart and base rows above them. Pulling that markup into one reusable
    // block lets us render it either:
    // 1. inline in the normal dashboard mode, or
    // 2. inside its own vertical viewport in focused metrics mode.
    const detailMetricsHeaderContent = (
      <Box
        key="detail-metrics-header"
        data-testid="share-price-dashboard-detail-metrics-header"
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          width: baseSurfaceWidth,
          height: `${HEADER_ROW_HEIGHT}px`,
          backgroundColor: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          borderBottom: usesFocusedMetricsViewport ? 'none' : '2px solid #e2e8f0',
          position: 'relative',
          zIndex: 'auto',
        }}
      >
        <Box
          sx={{
            position: 'sticky',
            left: 0,
            zIndex: 5,
            width: fixedLeftRailWidth,
            flexShrink: 0,
            px: 1.25,
            fontSize: { xs: '11px', sm: '12px' },
            fontWeight: 600,
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
            borderRight: '1px solid #e2e8f0',
            whiteSpace: 'nowrap',
          }}
        >
          DETAIL METRICS
        </Box>

        <Box
          sx={{
            position: 'relative',
            width: `${timelineLayout.contentWidth}px`,
            flexShrink: 0,
            height: `${HEADER_ROW_HEIGHT}px`,
            backgroundColor: '#f8fafc',
          }}
        />
      </Box>
    );

    const detailMetricsRows = (
      <>
        {detailMetricsHeaderContent}
        {metricsRowDefinitions.map((tableRow) => (
          <Box
            key={tableRow.key}
            data-testid="share-price-dashboard-metric-row"
            data-section-start={tableRow.startsVisibleSection ? 'true' : 'false'}
            sx={{
              position: 'relative',
              display: 'flex',
              alignItems: 'stretch',
              width: baseSurfaceWidth,
              height: `${tableRow.height}px`,
              backgroundColor: tableRow.backgroundColor,
              borderTop: tableRow.borderTop,
              borderBottom: tableRow.borderBottom,
            }}
          >
            <Box
              data-testid="share-price-dashboard-metric-row-left-rail"
              data-row-key={tableRow.key}
              title={shouldUseShortLabels ? tableRow.label : undefined}
              aria-label={tableRow.label}
              onContextMenu={(event) => handleMetricRowContextMenu(event, tableRow)}
              onMouseDown={handleMetricRowMouseDown}
              onTouchStart={(event) => handleMetricRowTouchStart(event, tableRow)}
              onTouchMove={handleMetricRowTouchMove}
              onTouchEnd={handleMetricRowTouchEnd}
              onTouchCancel={handleMetricRowTouchEnd}
              sx={{
                position: 'sticky',
                left: 0,
                zIndex: 2,
                width: fixedLeftRailWidth,
                flexShrink: 0,
                px: 1.25,
                py: 0.5,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'flex-start',
                gap: tableRow.showSectionLabel ? 0.2 : 0,
                backgroundColor: tableRow.backgroundColor,
                borderRight: '1px solid #e2e8f0',
                textAlign: 'left',
              }}
            >
              {tableRow.showSectionLabel ? (
                <Box
                  sx={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  {shouldUseShortLabels ? tableRow.shortSection : tableRow.section}
                </Box>
              ) : null}
              <Box
                sx={{
                  fontSize: { xs: '11px', sm: '12px', md: '13px' },
                  fontWeight: 400,
                  color: '#475569',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                {shouldUseShortLabels ? tableRow.shortLabel : tableRow.label}
              </Box>
            </Box>

            <Box
              data-testid="share-price-dashboard-metric-row-values"
              sx={{
                position: 'relative',
                width: `${timelineLayout.contentWidth}px`,
                flexShrink: 0,
                height: `${tableRow.height}px`,
                backgroundColor: tableRow.backgroundColor,
              }}
            >
              {renderedMetricsColumns.map((column) => {
                const metricCell = renderedMetricCellByRowKey.get(tableRow.key)?.get(column.key);
                const centerX = metricsColumnCenterByKey.get(column.key);

                if (!metricCell || !Number.isFinite(centerX)) {
                  return null;
                }

                return (
                  <Box
                    key={`${tableRow.key}-${column.key}`}
                    role={metricCell.isOverrideable ? 'button' : undefined}
                    tabIndex={metricCell.isOverrideable ? 0 : undefined}
                    data-testid="share-price-dashboard-metric-cell"
                    data-row-key={tableRow.key}
                    data-column-key={column.key}
                    data-is-overridden={metricCell.isOverridden ? 'true' : 'false'}
                    onContextMenu={(event) => handleMetricCellContextMenu(event, tableRow, metricCell)}
                    onMouseDown={(event) => handleMetricCellMouseDown(event, metricCell)}
                    onTouchStart={(event) => handleMetricCellTouchStart(event, tableRow, metricCell)}
                    onTouchMove={handleMetricCellTouchMove}
                    onTouchEnd={handleMetricCellTouchEnd}
                    onTouchCancel={handleMetricCellTouchEnd}
                    sx={{
                      position: 'absolute',
                      left: `${centerX}px`,
                      transform: 'translateX(-50%)',
                      height: `${tableRow.height}px`,
                      fontSize: timelineLayout.bodyFontSize,
                      fontWeight: metricCell.isOverridden ? 600 : 400,
                      color: metricCell.isOverridden ? '#6d28d9' : '#334155',
                      textAlign: 'center',
                      width: `${timelineLayout.yearCellWidth}px`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.1,
                      px: 0.35,
                      cursor: metricCell.isOverrideable ? 'context-menu' : 'default',
                      userSelect: 'none',
                      ...(metricCell.isOverrideable ? {
                        '&:hover .share-price-dashboard-metric-value, &:focus-visible .share-price-dashboard-metric-value': {
                          borderBottomColor: metricCell.isOverridden
                            ? OVERRIDDEN_METRIC_UNDERLINE_HOVER
                            : EDITABLE_METRIC_UNDERLINE_HOVER,
                        },
                      } : null),
                    }}
                  >
                    <Box
                      component="span"
                      className="share-price-dashboard-metric-value"
                      sx={{
                        display: 'inline-block',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.1,
                        paddingBottom: metricCell.isOverrideable ? '1px' : 0,
                        borderBottom: metricCell.isOverrideable
                          ? `${metricCell.isOverridden ? 1.5 : 1}px solid ${metricCell.isOverridden
                            ? OVERRIDDEN_METRIC_UNDERLINE
                            : EDITABLE_METRIC_UNDERLINE}`
                          : '1px solid transparent',
                      }}
                    >
                      {formatMetricCellValue(metricCell.value, tableRow.fieldPath, { compact: isCompactPresetTable })}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </>
    );

    cardBody = (
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          backgroundColor: 'background.paper',
        }}
      >
        <Box
          sx={{
            width: '100%',
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
          }}
          data-testid="share-price-dashboard-scroll-region"
          data-scroll-mode={isPresetWindowMode ? 'preset' : 'range'}
          data-surface-width={String(baseSurfaceWidth)}
          data-scroll-surface-width={String(scrollSurfaceWidth)}
          data-content-width={String(timelineLayout.contentWidth)}
          data-plot-width={String(timelineLayout.plotWidth)}
          data-year-cell-width={String(timelineLayout.yearCellWidth)}
          data-left-rail-width={String(fixedLeftRailWidth)}
          ref={attachTimelineScrollRef}
        >
          {/*
            The fixed-length presets reuse this same horizontal scroller, but they map scroll
            position to a month offset instead of an internal chart offset. MAX and custom ranges
            keep the long-history internal scrolling behavior.
          */}
          <Box sx={{ width: scrollSurfaceWidth, position: 'relative' }}>
            <Box
              data-testid={usesFocusedMetricsViewport ? 'share-price-dashboard-top-rails' : undefined}
              sx={{
                width: baseSurfaceWidth,
                position: isPresetWindowMode ? 'sticky' : 'relative',
                left: isPresetWindowMode ? 0 : 'auto',
                top: 0,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'stretch',
                  width: baseSurfaceWidth,
                  backgroundColor: '#ffffff',
                }}
              >
                <Box
                  sx={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 3,
                    width: fixedLeftRailWidth,
                    flexShrink: 0,
                    px: 1,
                    py: `${CHART_TOP_PADDING}px`,
                    color: '#64748b',
                    fontSize: '10px',
                    backgroundColor: '#ffffff',
                    borderRight: '1px solid #e2e8f0',
                  }}
                >
                  {/* We draw every rounded gridline, but only show a readable subset of
                    labels so the left rail stays legible when the scale chooses many ticks. */}
                  {visibleYAxisLabels.map((tickValue) => (
                    <Box
                      key={tickValue}
                      data-testid="share-price-dashboard-y-axis-label"
                      sx={{
                        position: 'absolute',
                        right: 8,
                        top: `${getChartYPosition(
                          tickValue,
                          chartGeometry.minPrice,
                          chartGeometry.maxPrice,
                          CHART_HEIGHT,
                          {
                            topPadding: CHART_TOP_PADDING,
                            bottomPadding: CHART_BOTTOM_PADDING,
                          },
                        )}px`,
                        transform: 'translateY(-50%)',
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatYAxisPrice(tickValue, chartGeometry.ticks)}
                    </Box>
                  ))}
                </Box>

                <Box sx={{ width: timelineLayout.contentWidth, flexShrink: 0 }}>
                  <Box sx={{ width: timelineLayout.contentWidth, pb: 0 }}>
                    <TimeSeriesChartSvg
                      svgRef={svgRef}
                      chartHeight={CHART_HEIGHT}
                      contentWidth={timelineLayout.contentWidth}
                      plotWidth={timelineLayout.plotWidth}
                      backgroundBands={chartGeometry.fiscalYearBands.map((band) => ({
                        key: `fiscal-band-${band.fiscalYear}`,
                        testId: 'share-price-dashboard-fiscal-band',
                        startX: band.startX,
                        width: band.width,
                        fill: activeFiscalBand?.fiscalYear === band.fiscalYear
                          ? ACTIVE_FISCAL_BAND_FILL
                          : (band.isAlternate ? FISCAL_BAND_FILL : 'transparent'),
                        dataAttributes: {
                          'fiscal-year': band.fiscalYear,
                          'start-x': band.startX,
                          width: band.width,
                          'center-x': band.centerX,
                          'is-alternate': band.isAlternate,
                        },
                      }))}
                      horizontalGridLines={chartGeometry.ticks.map((tickValue) => ({
                        key: tickValue,
                        testId: 'share-price-dashboard-y-gridline',
                        y: getChartYPosition(
                          tickValue,
                          chartGeometry.minPrice,
                          chartGeometry.maxPrice,
                          CHART_HEIGHT,
                          {
                            topPadding: CHART_TOP_PADDING,
                            bottomPadding: CHART_BOTTOM_PADDING,
                          },
                        ),
                      }))}
                      verticalMarkers={chartGeometry.januaryPositions.map((position) => ({
                        key: position.year,
                        x: position.x,
                      }))}
                      linePath={chartGeometry.svgPath}
                      lineColor="#f97316"
                      lineWidth={5}
                      bottomMarkers={chartGeometry.pointPositions.map((position) => ({
                        key: position.date,
                        testId: 'share-price-dashboard-fiscal-tick',
                        x: position.x,
                        dataAttributes: {
                          'fiscal-year': position.fiscalYear,
                          date: position.date,
                          x: position.x,
                        },
                      }))}
                      hoverState={hoverState.x !== null && hoverState.price !== null ? {
                        x: hoverState.x,
                        label: hoverState.date,
                        value: hoverState.price,
                      } : null}
                      hoverValueFormatter={(value) => formatCurrency(value)}
                      watermark={activeFiscalBand ? {
                        testId: 'share-price-dashboard-fiscal-watermark',
                        x: activeFiscalBand.centerX,
                        y: CHART_TOP_PADDING + CHART_PLOT_HEIGHT - 12,
                        text: `FY ${activeFiscalBand.fiscalYear}`,
                        fontSize: 16,
                        fontWeight: 700,
                        fill: '#dc2626',
                        opacity: FY_WATERMARK_OPACITY,
                        stroke: 'rgba(255, 255, 255, 0.95)',
                        strokeWidth: 2,
                        paintOrder: 'stroke',
                        dataAttributes: {
                          'fiscal-year': activeFiscalBand.fiscalYear,
                        },
                      } : null}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                    />
                  </Box>
                </Box>
              </Box>

              <Box sx={{ width: baseSurfaceWidth }}>
                {tableRowDefinitions.map((tableRow) => (
                  <Box
                    key={tableRow.key}
                    sx={{
                      display: 'flex',
                      alignItems: 'stretch',
                      width: baseSurfaceWidth,
                      height: `${tableRow.height}px`,
                      backgroundColor: tableRow.backgroundColor,
                      borderTop: tableRow.borderTop,
                      borderBottom: tableRow.borderBottom,
                    }}
                  >
                    <Box
                      title={shouldUseShortLabels ? tableRow.label : undefined}
                      aria-label={tableRow.label}
                      sx={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        width: fixedLeftRailWidth,
                        flexShrink: 0,
                        px: 1.25,
                        fontSize: tableRow.isHeader
                          ? { xs: '11px', sm: '12px' }
                          : { xs: '11px', sm: '12px', md: '13px' },
                        fontWeight: tableRow.isHeader ? 600 : 400,
                        color: tableRow.isHeader ? '#64748b' : '#475569',
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: tableRow.backgroundColor,
                        borderRight: '1px solid #e2e8f0',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {shouldUseShortLabels ? tableRow.shortLabel : tableRow.label}
                    </Box>

                    <Box
                      sx={{
                        position: 'relative',
                        width: timelineLayout.contentWidth,
                        flexShrink: 0,
                        height: `${tableRow.height}px`,
                      }}
                    >
                      {tablePoints.map((annualRow, columnIndex) => {
                        const position = chartGeometry.pointPositions[columnIndex];

                        if (!position) {
                          return null;
                        }

                        return (
                          <Box
                            key={`${tableRow.key}-${annualRow.fiscalYear}`}
                            data-testid={tableRow.isHeader ? 'share-price-dashboard-header-cell' : undefined}
                            data-fiscal-year={String(annualRow.fiscalYear)}
                            data-date={annualRow.fiscalYearEndDate}
                            data-center-x={String(position.x)}
                            data-cell-width={String(timelineLayout.yearCellWidth)}
                            sx={{
                              position: 'absolute',
                              left: `${position.x}px`,
                              transform: 'translateX(-50%)',
                              height: `${tableRow.height}px`,
                              fontSize: tableRow.isHeader ? timelineLayout.headerFontSize : timelineLayout.bodyFontSize,
                              fontWeight: tableRow.isHeader ? 600 : 400,
                              color: tableRow.isHeader ? '#64748b' : '#334155',
                              textAlign: 'center',
                              width: `${timelineLayout.yearCellWidth}px`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              lineHeight: 1.1,
                              px: 0.25,
                            }}
                          >
                            {tableRow.isHeader
                              ? tableRow.formatter(annualRow[tableRow.key], { compact: isCompactPresetTable })
                              : tableRow.formatter(annualRow[tableRow.key], { compact: isCompactPresetTable })}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                ))}

                {isMetricsOpen ? (
                  usesFocusedMetricsViewport ? (
                    <Box
                      data-testid="share-price-dashboard-metrics-viewport"
                      data-vertical-scroll="true"
                      sx={{
                        width: baseSurfaceWidth,
                        maxHeight: FOCUSED_METRICS_VIEWPORT_MAX_HEIGHT,
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        borderTop: '1px solid #e2e8f0',
                      }}
                    >
                      <Box
                        data-testid="share-price-dashboard-detail-metrics-header-wrapper"
                        sx={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 4,
                          width: '100%',
                          backgroundColor: '#f8fafc',
                          borderBottom: '2px solid #e2e8f0',
                        }}
                      >
                        {detailMetricsHeaderContent}
                      </Box>
                      {/* The chart and base rows stay above this viewport so the
                          learner can keep their main context visible while they
                          scroll only through the dense detail metrics. */}
                      <Box
                        sx={{
                          width: `${baseSurfaceWidth}px`,
                        }}
                      >
                        {metricsRowDefinitions.map((tableRow) => (
                          <Box
                            key={tableRow.key}
                            data-testid="share-price-dashboard-metric-row"
                            data-section-start={tableRow.startsVisibleSection ? 'true' : 'false'}
                            sx={{
                              position: 'relative',
                              display: 'flex',
                              alignItems: 'stretch',
                              width: baseSurfaceWidth,
                              height: `${tableRow.height}px`,
                              backgroundColor: tableRow.backgroundColor,
                              borderTop: tableRow.borderTop,
                              borderBottom: tableRow.borderBottom,
                            }}
                          >
                            <Box
                              data-testid="share-price-dashboard-metric-row-left-rail"
                              data-row-key={tableRow.key}
                              title={shouldUseShortLabels ? tableRow.label : undefined}
                              aria-label={tableRow.label}
                              onContextMenu={(event) => handleMetricRowContextMenu(event, tableRow)}
                              onMouseDown={handleMetricRowMouseDown}
                              onTouchStart={(event) => handleMetricRowTouchStart(event, tableRow)}
                              onTouchMove={handleMetricRowTouchMove}
                              onTouchEnd={handleMetricRowTouchEnd}
                              onTouchCancel={handleMetricRowTouchEnd}
                              sx={{
                                position: 'sticky',
                                left: 0,
                                zIndex: 2,
                                width: fixedLeftRailWidth,
                                flexShrink: 0,
                                px: 1.25,
                                py: 0.5,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'flex-start',
                                gap: tableRow.showSectionLabel ? 0.2 : 0,
                                backgroundColor: tableRow.backgroundColor,
                                borderRight: '1px solid #e2e8f0',
                                textAlign: 'left',
                              }}
                            >
                              {tableRow.showSectionLabel ? (
                                <Box
                                  sx={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    color: '#94a3b8',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    width: '100%',
                                    textAlign: 'left',
                                  }}
                                >
                                  {shouldUseShortLabels ? tableRow.shortSection : tableRow.section}
                                </Box>
                              ) : null}
                              <Box
                                sx={{
                                  fontSize: { xs: '11px', sm: '12px', md: '13px' },
                                  fontWeight: 400,
                                  color: '#475569',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  width: '100%',
                                  textAlign: 'left',
                                }}
                              >
                                {shouldUseShortLabels ? tableRow.shortLabel : tableRow.label}
                              </Box>
                            </Box>

                            <Box
                              data-testid="share-price-dashboard-metric-row-values"
                              sx={{
                                position: 'relative',
                                width: `${timelineLayout.contentWidth}px`,
                                flexShrink: 0,
                                height: `${tableRow.height}px`,
                                backgroundColor: tableRow.backgroundColor,
                              }}
                            >
                              {renderedMetricsColumns.map((column) => {
                                const metricCell = renderedMetricCellByRowKey.get(tableRow.key)?.get(column.key);
                                const centerX = metricsColumnCenterByKey.get(column.key);

                                if (!metricCell || !Number.isFinite(centerX)) {
                                  return null;
                                }

                                return (
                                  <Box
                                    key={`${tableRow.key}-${column.key}`}
                                    role={metricCell.isOverrideable ? 'button' : undefined}
                                    tabIndex={metricCell.isOverrideable ? 0 : undefined}
                                    data-testid="share-price-dashboard-metric-cell"
                                    data-row-key={tableRow.key}
                                    data-column-key={column.key}
                                    data-is-overridden={metricCell.isOverridden ? 'true' : 'false'}
                                    onContextMenu={(event) => handleMetricCellContextMenu(event, tableRow, metricCell)}
                                    onMouseDown={(event) => handleMetricCellMouseDown(event, metricCell)}
                                    onTouchStart={(event) => handleMetricCellTouchStart(event, tableRow, metricCell)}
                                    onTouchMove={handleMetricCellTouchMove}
                                    onTouchEnd={handleMetricCellTouchEnd}
                                    onTouchCancel={handleMetricCellTouchEnd}
                                    sx={{
                                      position: 'absolute',
                                      left: `${centerX}px`,
                                      transform: 'translateX(-50%)',
                                      height: `${tableRow.height}px`,
                                      fontSize: timelineLayout.bodyFontSize,
                                      fontWeight: metricCell.isOverridden ? 600 : 400,
                                      color: metricCell.isOverridden ? '#6d28d9' : '#334155',
                                      textAlign: 'center',
                                      width: `${timelineLayout.yearCellWidth}px`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      lineHeight: 1.1,
                                      px: 0.35,
                                      cursor: metricCell.isOverrideable ? 'context-menu' : 'default',
                                      userSelect: 'none',
                                      ...(metricCell.isOverrideable ? {
                                        '&:hover .share-price-dashboard-metric-value, &:focus-visible .share-price-dashboard-metric-value': {
                                          borderBottomColor: metricCell.isOverridden
                                            ? OVERRIDDEN_METRIC_UNDERLINE_HOVER
                                            : EDITABLE_METRIC_UNDERLINE_HOVER,
                                        },
                                      } : {}),
                                    }}
                                    >
                                      <Box
                                        className="share-price-dashboard-metric-value"
                                      sx={{
                                        minWidth: 0,
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        borderBottom: metricCell.isOverrideable
                                          ? `1px solid ${metricCell.isOverridden ? OVERRIDDEN_METRIC_UNDERLINE : EDITABLE_METRIC_UNDERLINE}`
                                          : '1px solid transparent',
                                      }}
                                    >
                                      {formatMetricCellValue(metricCell.value, tableRow.fieldPath, {
                                        compact: isCompactPresetTable,
                                      })}
                                    </Box>
                                  </Box>
                                );
                              })}
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  ) : detailMetricsRows
                ) : null}
              </Box>
            </Box>
          </Box>
        </Box>

        {tablePoints.length === 0 ? (
          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #f1f5f9' }}>
            <Typography variant="body2" color="text.secondary" align="center">
              Annual metric rows only appear when a fiscal year-end falls inside the selected month range.
            </Typography>
          </Box>
        ) : null}

        {isMetricsOpen && hiddenMetricRows.length > 0 ? (
          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #f1f5f9' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: isHiddenRowsOpen ? 1.5 : 0 }}>
              <Button
                size="small"
                onClick={() => setIsHiddenRowsOpen((previousState) => !previousState)}
              >
                {isHiddenRowsOpen ? 'HIDE HIDDEN ROWS' : `HIDDEN ROWS (${hiddenMetricRows.length})`}
              </Button>
            </Box>

            {/* Hidden rows stay outside the scrollable metrics viewport on purpose.
                They are a separate management area, not part of the dense
                "read down the table" flow of the focused metrics pane. */}
            {isHiddenRowsOpen ? (
              <Box
                data-testid="share-price-dashboard-hidden-rows"
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                {hiddenMetricRows.map((metricRow) => (
                  <Box
                    key={metricRow.rowKey}
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 1,
                      border: '1px solid #e2e8f0',
                      borderRadius: 1.5,
                      px: 1.5,
                      py: 1,
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {metricRow.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {metricRow.section}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      disabled={isUpdatingRowPreference}
                      onClick={() => handleMetricRowEnabledState(metricRow.rowKey, true)}
                    >
                      SHOW ROW
                    </Button>
                  </Box>
                ))}
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Box>
    );
  }

  return (
    <Card
      sx={{
        width: '100%',
        maxWidth: isFocusedMetricsMode ? 1360 : 1200,
        display: 'flex',
        flexDirection: 'column',
        margin: 0,
        borderRadius: 2,
      }}
    >
      <CardContent
        sx={{
          paddingBottom: '16px !important',
          paddingTop: '18px !important',
          px: { xs: 2, sm: 2.5, lg: 3 },
        }}
      >
        <Typography
          gutterBottom
          sx={{
            color: 'text.secondary',
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}
        >
          Stock
        </Typography>
        <Typography variant="h5" component="div" sx={{ marginBottom: 0, marginTop: 0 }}>
          {name || dashboardData?.companyName || identifier}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {identifier}
        </Typography>
      </CardContent>

      {!isLoading && dashboardData ? (
        <CardActions
          sx={{
            pt: 0,
            px: { xs: 2, sm: 2.5, lg: 3 },
            pb: 2,
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 1,
          }}
        >
          <Box
            data-testid="share-price-dashboard-investment-category-row"
            sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}
          >
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                backgroundColor: 'background.paper',
                px: 1.5,
                py: 0.75,
                minWidth: 210,
              }}
            >
              <select
                aria-label="Investment Category"
                value={dashboardData.investmentCategory || ''}
                onChange={handleInvestmentCategoryChange}
                disabled={isUpdatingInvestmentCategory}
                style={{
                  width: '100%',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#1e293b',
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  outline: 'none',
                }}
              >
                {INVESTMENT_CATEGORY_OPTIONS.map((categoryName) => (
                  <option key={categoryName} value={categoryName}>
                    {categoryName}
                  </option>
                ))}
              </select>
            </Box>
          </Box>

          {isRemovable ? (
            <Box
              data-testid="share-price-dashboard-remove-stock-row"
              sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}
            >
              <Button
                color="error"
                size="small"
                onClick={onRemove}
                sx={{
                  color: 'error.main',
                }}
              >
                Remove stock
              </Button>
            </Box>
          ) : null}

          <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <Button
              size="small"
              onClick={handleMetricsVisibilityToggle}
            >
              {isMetricsOpen ? 'HIDE METRICS' : 'SHOW METRICS'}
            </Button>
          </Box>

          {investmentCategoryError ? (
            <Typography variant="body2" color="error" align="center">
              {investmentCategoryError}
            </Typography>
          ) : null}

          {metricsActionError ? (
            <Typography variant="body2" color="error" align="center">
              {metricsActionError}
            </Typography>
          ) : null}
        </CardActions>
      ) : null}

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          px: { xs: 1, sm: 2, lg: 2.5 },
          pb: 2,
          pt: 0,
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, sm: 2 }, justifyContent: 'center' }}>
          {hasLoadedMonthRange ? (
            <>
              <TextField
                label="Start month"
                type="month"
                size="small"
                value={currentStartMonth}
                onChange={(event) => {
                  setFreeRangeMonths({
                    startMonth: event.target.value,
                    endMonth: currentEndMonth,
                  });
                  setRangeMode('free');
                  setActivePreset('');
                  setIsPresetScrollReady(false);
                  setPresetPanOffsetMonths(0);
                }}
                inputProps={{
                  min: minAvailableMonth || undefined,
                  max: currentEndMonth || maxAvailableMonth || undefined,
                }}
                disabled={!priceRows.length}
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                label="End month"
                type="month"
                size="small"
                value={currentEndMonth}
                onChange={(event) => {
                  setFreeRangeMonths({
                    startMonth: currentStartMonth,
                    endMonth: event.target.value,
                  });
                  setRangeMode('free');
                  setActivePreset('');
                  setIsPresetScrollReady(false);
                  setPresetPanOffsetMonths(0);
                }}
                inputProps={{
                  min: currentStartMonth || minAvailableMonth || undefined,
                  max: maxAvailableMonth || undefined,
                }}
                disabled={!priceRows.length}
                InputLabelProps={{ shrink: true }}
              />
            </>
          ) : (
            <Box
              data-testid="share-price-dashboard-month-controls-placeholder"
              sx={{
                width: '100%',
                minHeight: 40,
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 0.5, sm: 1 }, justifyContent: 'center' }}>
          {PRESET_BUTTONS.map((preset) => (
            <Button
              key={preset.key}
              variant={activePreset === preset.key ? 'contained' : 'outlined'}
              size="small"
              sx={{
                ...(activePreset === preset.key ? chartButtonContainedStyles : chartButtonStyles),
                fontSize: { xs: '0.75rem', sm: '0.875rem' },
                minWidth: { xs: '40px', sm: '64px' },
                padding: { xs: '4px 8px', sm: '6px 16px' },
              }}
              onClick={() => handlePresetClick(preset)}
              disabled={!priceRows.length}
            >
              {preset.label}
            </Button>
          ))}
        </Box>

        {cardBody}
      </Box>

      {metricRowActionMenuState ? (
        <Box
          ref={metricRowActionMenuRef}
          data-testid="share-price-dashboard-metric-row-action-menu"
          sx={{
            position: 'fixed',
            zIndex: 1400,
            left: shouldUseBottomSheetMetricEditor
              ? 12
              : Math.max((metricRowActionMenuState.anchorRect?.left || 0) - 8, 12),
            right: shouldUseBottomSheetMetricEditor ? 12 : 'auto',
            top: shouldUseBottomSheetMetricEditor
              ? 'auto'
              : Math.min(
                  (metricRowActionMenuState.anchorRect?.bottom || 0) + 8,
                  ((typeof window !== 'undefined' ? window.innerHeight : 800) - 180),
                ),
            bottom: shouldUseBottomSheetMetricEditor ? 12 : 'auto',
            width: shouldUseBottomSheetMetricEditor ? 'auto' : 260,
            border: '1px solid #cbd5e1',
            borderRadius: shouldUseBottomSheetMetricEditor ? 2 : 1.5,
            backgroundColor: '#ffffff',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
            p: 1.5,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>
            Row actions
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
            Right click or long press the frozen metric label to hide this row.
          </Typography>
          <Typography variant="body2" sx={{ color: '#334155', mb: 1.5 }}>
            {metricRowActionMenuState.rowLabel}
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 1 }}>
            <Button size="small" onClick={closeMetricRowActionMenu} disabled={isUpdatingRowPreference}>
              CANCEL
            </Button>
            <Button
              size="small"
              data-testid="share-price-dashboard-metric-row-hide-action"
              onClick={handleHideMetricRow}
              disabled={isUpdatingRowPreference}
            >
              HIDE ROW
            </Button>
          </Box>
        </Box>
      ) : null}

      {metricEditorState ? (
        <Box
          data-testid="share-price-dashboard-metric-editor"
          sx={{
            position: 'fixed',
            zIndex: 1400,
            left: shouldUseBottomSheetMetricEditor
              ? 12
              : Math.max((metricEditorState.anchorRect?.left || 0) - 16, 12),
            right: shouldUseBottomSheetMetricEditor ? 12 : 'auto',
            top: shouldUseBottomSheetMetricEditor
              ? 'auto'
              : Math.min(
                  (metricEditorState.anchorRect?.bottom || 0) + 8,
                  ((typeof window !== 'undefined' ? window.innerHeight : 800) - 220),
                ),
            bottom: shouldUseBottomSheetMetricEditor ? 12 : 'auto',
            width: shouldUseBottomSheetMetricEditor ? 'auto' : 280,
            border: '1px solid #cbd5e1',
            borderRadius: shouldUseBottomSheetMetricEditor ? 2 : 1.5,
            backgroundColor: '#ffffff',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
            p: 1.5,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
            Edit metric override
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 1 }}>
            Right click on desktop or long press on touch to edit overrideable values.
          </Typography>
          <TextField
            fullWidth
            label="Override value"
            size="small"
            type={getMetricEditorInputType(metricEditorState.fieldPath, metricEditorValue)}
            value={metricEditorValue}
            onChange={(event) => setMetricEditorValue(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
            <Button size="small" onClick={closeMetricEditor} disabled={isSavingMetricOverride}>
              CANCEL
            </Button>
            <Button size="small" onClick={handleClearMetricOverride} disabled={isSavingMetricOverride}>
              CLEAR OVERRIDE
            </Button>
            <Button size="small" onClick={handleSaveMetricOverride} disabled={isSavingMetricOverride}>
              SAVE OVERRIDE
            </Button>
          </Box>
        </Box>
      ) : null}
    </Card>
  );
}
