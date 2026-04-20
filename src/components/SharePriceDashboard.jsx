import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { fetchDashboardData } from '../services/watchlistDashboardApi';

const CHART_HEIGHT = 280;
const FIXED_LEFT_RAIL_WIDTH = 190;
const CHART_RIGHT_PADDING = 24;
const CHART_TOP_PADDING = 20;
const CHART_BOTTOM_PADDING = 20;
const CHART_PLOT_HEIGHT = CHART_HEIGHT - CHART_TOP_PADDING - CHART_BOTTOM_PADDING;
const RIGHT_TIMELINE_MIN_WIDTH = 720;
const HEADER_ROW_HEIGHT = 36;
const DATA_ROW_HEIGHT = 32;
const SCALE_EXPANSION_DURATION_MS = 120;
const SCALE_CONTRACTION_DURATION_MS = 280;
const SCALE_CONTRACTION_DELAY_MS = 160;
const SCALE_WINDOW_STEP_PX = 16;
const PRESET_PAN_STEP_PX = 28;
const Y_AXIS_LABEL_MIN_SPACING_PX = 32;
const MOBILE_LABEL_BREAKPOINT_QUERY = '(max-width: 560px)';

const PRESET_BUTTONS = [
  { key: 'MAX', label: 'MAX', monthCount: null },
  { key: '1M', label: '1M', monthCount: 1 },
  { key: '6M', label: '6M', monthCount: 6 },
  { key: '1Y', label: '1Y', monthCount: 12 },
  { key: '3Y', label: '3Y', monthCount: 36 },
  { key: '5Y', label: '5Y', monthCount: 60 },
  { key: '10Y', label: '10Y', monthCount: 120 },
];

const chartButtonStyles = {
  color: '#4a148c',
  borderColor: '#4a148c',
  '&:hover': {
    borderColor: '#6a1b9a',
    backgroundColor: 'rgba(74, 20, 140, 0.08)',
  },
};

const chartButtonContainedStyles = {
  backgroundColor: '#4a148c',
  color: '#ffffff',
  '&:hover': {
    backgroundColor: '#6a1b9a',
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

function buildSvgPath(priceRows, minPrice, maxPrice, minTime, timeRange, plotWidth) {
  if (!priceRows.length) {
    return '';
  }

  const priceRange = maxPrice - minPrice || 1;

  const points = priceRows.map((priceRow) => {
    const x = ((new Date(priceRow.date).getTime() - minTime) / timeRange) * plotWidth;
    const y = CHART_TOP_PADDING + CHART_PLOT_HEIGHT - (((priceRow.close - minPrice) / priceRange) * CHART_PLOT_HEIGHT);

    return `${x},${y}`;
  });

  return points.length === 1 ? `M ${points[0]} L ${points[0]}` : `M ${points.join(' L ')}`;
}

function getChartYPosition(priceValue, minPrice, maxPrice) {
  const priceRange = maxPrice - minPrice || 1;

  return CHART_TOP_PADDING + CHART_PLOT_HEIGHT - (((priceValue - minPrice) / priceRange) * CHART_PLOT_HEIGHT);
}

function getJanuaryPositions(priceRows, minTime, timeRange, plotWidth) {
  if (!priceRows.length) {
    return [];
  }

  const startYear = new Date(priceRows[0].date).getFullYear();
  const endYear = new Date(priceRows[priceRows.length - 1].date).getFullYear();
  const positions = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const januaryFirstTime = new Date(`${year}-01-01T00:00:00Z`).getTime();

    if (januaryFirstTime < minTime || januaryFirstTime > minTime + timeRange) {
      continue;
    }

    positions.push({
      year,
      x: ((januaryFirstTime - minTime) / timeRange) * plotWidth,
    });
  }

  return positions;
}

function useMediaQueryMatch(mediaQuery) {
  const getMatches = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    return window.matchMedia(mediaQuery).matches;
  };

  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQueryList = window.matchMedia(mediaQuery);
    const handleChange = (event) => {
      setMatches((previousMatches) => {
        return previousMatches === event.matches ? previousMatches : event.matches;
      });
    };

    setMatches((previousMatches) => {
      return previousMatches === mediaQueryList.matches ? previousMatches : mediaQueryList.matches;
    });
    mediaQueryList.addEventListener('change', handleChange);

    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [mediaQuery]);

  return matches;
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
}) {
  const svgRef = useRef(null);
  const timelineScrollRef = useRef(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [freeRangeStartMonth, setFreeRangeStartMonth] = useState('');
  const [freeRangeEndMonth, setFreeRangeEndMonth] = useState('');
  const [rangeMode, setRangeMode] = useState('preset');
  const [activePreset, setActivePreset] = useState('5Y');
  const [presetPanOffsetMonths, setPresetPanOffsetMonths] = useState(0);
  const [hoverState, setHoverState] = useState({
    date: '',
    price: null,
    x: null,
  });
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
  const animationFrameRef = useRef(null);
  const contractionTimeoutRef = useRef(null);

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

        const minAvailableMonth = getMonthStringFromDate(nextPriceRows[0].date);
        const maxAvailableMonth = getMonthStringFromDate(nextPriceRows[nextPriceRows.length - 1].date);
        const defaultRange = getTrailingRange({
          monthCount: 60,
          minAvailableMonth,
          maxAvailableMonth,
        });

        setDashboardData(nextDashboardData);
        setFreeRangeStartMonth(defaultRange.startMonth);
        setFreeRangeEndMonth(defaultRange.endMonth);
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
  }, [identifier]);

  const priceRows = dashboardData?.prices || [];
  const annualMetrics = dashboardData?.annualMetrics || [];
  const shouldUseShortLabels = useMediaQueryMatch(MOBILE_LABEL_BREAKPOINT_QUERY);
  const activePresetConfig = PRESET_BUTTONS.find((preset) => preset.key === activePreset) || null;
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
    : freeRangeStartMonth;
  const currentEndMonth = isPresetWindowMode
    ? clampMonthString(
        shiftMonthString(latestPresetRange.endMonth, -clampedPresetPanOffsetMonths),
        minAvailableMonth,
        maxAvailableMonth,
      )
    : freeRangeEndMonth;
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
        key: 'sharePrice',
        fieldPath: 'annualData[].base.sharePrice',
        label: 'Share price (at FY release date)',
        shortLabel: getShortLabel('Share price (at FY release date)'),
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

  const columnDensity = useMemo(() => {
    return getColumnDensity(tablePoints.length);
  }, [tablePoints.length]);

  const isCompactPresetTable = isPresetWindowMode
    && tablePoints.length >= 8
    && Boolean(scrollState.containerWidth)
    && scrollState.containerWidth < 560;
  // MAX already gets readable spacing from its wider scrollable timeline. Narrow preset windows
  // do not have that extra width, so we switch to a compact presentation before the columns
  // become unreadable on mobile.
  const fixedLeftRailWidth = isCompactPresetTable
    ? (shouldUseShortLabels ? 112 : 136)
    : (shouldUseShortLabels ? 132 : FIXED_LEFT_RAIL_WIDTH);

  const timelineLayout = useMemo(() => {
    if (isPresetWindowMode) {
      const timelineViewportWidth = Math.max(
        (scrollState.containerWidth || (fixedLeftRailWidth + RIGHT_TIMELINE_MIN_WIDTH)) - fixedLeftRailWidth,
        1,
      );
      const contentWidth = Math.max(timelineViewportWidth, 1);
      const plotWidth = Math.max(contentWidth - CHART_RIGHT_PADDING, 1);
      const yearCellWidth = tablePoints.length
        ? Math.max(Math.floor(plotWidth / tablePoints.length), isCompactPresetTable ? 32 : 42)
        : 56;

      return {
        plotWidth,
        contentWidth,
        yearCellWidth,
        headerFontSize: isCompactPresetTable ? { xs: '8px', sm: '9px' } : { xs: '9px', sm: '10px' },
        bodyFontSize: isCompactPresetTable ? { xs: '8px', sm: '9px', md: '10px' } : { xs: '9px', sm: '10px', md: '11px' },
      };
    }

    const plotWidth = Math.max(RIGHT_TIMELINE_MIN_WIDTH, tablePoints.length * columnDensity.columnWidth);

    return {
      plotWidth,
      contentWidth: plotWidth + CHART_RIGHT_PADDING,
      yearCellWidth: columnDensity.columnWidth,
      headerFontSize: { xs: columnDensity.headerFontSize, sm: '10px' },
      bodyFontSize: { xs: columnDensity.bodyFontSize, sm: '10px', md: '11px' },
    };
  }, [columnDensity, fixedLeftRailWidth, isCompactPresetTable, isPresetWindowMode, scrollState.containerWidth, tablePoints.length]);

  useLayoutEffect(() => {
    const scrollElement = timelineScrollRef.current;

    if (!scrollElement) {
      return undefined;
    }

    const updateScrollWindow = () => {
      const measuredContainerWidth = scrollElement.clientWidth;
      const measuredViewportWidth = Math.max(measuredContainerWidth - fixedLeftRailWidth, 0);
      let nextScrollLeft = scrollElement.scrollLeft;
      const shouldBootstrapPreset = isPresetWindowMode && !isPresetScrollReady && measuredContainerWidth > 0;

      if (shouldBootstrapPreset) {
        nextScrollLeft = maxPresetPanOffset * PRESET_PAN_STEP_PX;
        scrollElement.scrollLeft = nextScrollLeft;

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
          setScrollState((previousScrollState) => {
            if (
              previousScrollState.containerWidth === measuredContainerWidth
              && Math.abs(previousScrollState.scrollLeft - nextScrollLeft) <= 1
              && previousScrollState.viewportWidth === measuredViewportWidth
            ) {
              return previousScrollState;
            }

            return {
              containerWidth: measuredContainerWidth,
              scrollLeft: nextScrollLeft,
              viewportWidth: measuredViewportWidth,
            };
          });
        });

        if (presetPanOffsetMonths !== 0) {
          setPresetPanOffsetMonths(0);
        }

        setIsPresetScrollReady(true);
      }

      setScrollState((previousScrollState) => {
        if (
          previousScrollState.containerWidth === measuredContainerWidth
          && Math.abs(previousScrollState.scrollLeft - nextScrollLeft) <= 1
          && previousScrollState.viewportWidth === measuredViewportWidth
        ) {
          return previousScrollState;
        }

        return {
          containerWidth: measuredContainerWidth,
          scrollLeft: nextScrollLeft,
          viewportWidth: measuredViewportWidth,
        };
      });
    };

    // Preset windows and free-range windows share the same DOM scroller, but not the same meaning.
    // Fixed-length presets use scroll to PAN the selected month range itself, while MAX/custom
    // ranges use scroll inside the already-selected range for long-history chart/table layouts.
    updateScrollWindow();
    scrollElement.addEventListener('scroll', updateScrollWindow, { passive: true });
    window.addEventListener('resize', updateScrollWindow);

    return () => {
      scrollElement.removeEventListener('scroll', updateScrollWindow);
      window.removeEventListener('resize', updateScrollWindow);
    };
  }, [
    activePreset,
    fixedLeftRailWidth,
    identifier,
    isPresetScrollReady,
    isPresetWindowMode,
    maxPresetPanOffset,
    presetPanOffsetMonths,
    timelineLayout.contentWidth,
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
    };
  }, []);

  const visibleWindow = useMemo(() => {
    if (isPresetWindowMode) {
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
  }, [isPresetWindowMode, scrollState.scrollLeft, scrollState.viewportWidth, timelineLayout.contentWidth, timelineLayout.plotWidth]);

  const visiblePriceRows = useMemo(() => {
    if (!filteredPriceRows.length) {
      return [];
    }

    if (filteredPriceRows.length === 1) {
      return filteredPriceRows;
    }

    const minTime = new Date(filteredPriceRows[0].date).getTime();
    const maxTime = new Date(filteredPriceRows[filteredPriceRows.length - 1].date).getTime();
    const timeRange = Math.max(maxTime - minTime, 1);
    const visibleStartTime = minTime + ((visibleWindow.left / timelineLayout.plotWidth) * timeRange);
    const visibleEndTime = minTime + ((visibleWindow.right / timelineLayout.plotWidth) * timeRange);

    const rowsInView = filteredPriceRows.filter((priceRow) => {
      const pointTime = new Date(priceRow.date).getTime();
      return pointTime >= visibleStartTime && pointTime <= visibleEndTime;
    });

    return rowsInView.length > 0 ? rowsInView : filteredPriceRows;
  }, [filteredPriceRows, timelineLayout.plotWidth, visibleWindow.left, visibleWindow.right]);

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
      setRenderedScale(targetChartScale);
      renderedScaleRef.current = targetChartScale;
      return undefined;
    }

    if (areScaleValuesClose(currentScale, targetChartScale)) {
      return undefined;
    }

    const isExpandingDown = targetChartScale.minPrice < currentScale.minPrice;
    const isExpandingUp = targetChartScale.maxPrice > currentScale.maxPrice;
    const shouldExpandImmediately = isExpandingDown || isExpandingUp;
    const transitionDelay = shouldExpandImmediately ? 0 : SCALE_CONTRACTION_DELAY_MS;
    const transitionDuration = shouldExpandImmediately
      ? SCALE_EXPANSION_DURATION_MS
      : SCALE_CONTRACTION_DURATION_MS;

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

        renderedScaleRef.current = nextScale;
        setRenderedScale(nextScale);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(step);
        } else {
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
  }, [filteredPriceRows.length, preferredYAxisTickCount, targetChartScale]);

  const chartGeometry = useMemo(() => {
    if (!filteredPriceRows.length) {
      return {
        svgPath: '',
        pointPositions: [],
        januaryPositions: [],
        minPrice: 0,
        maxPrice: 0,
        ticks: [],
        minTime: 0,
        timeRange: 1,
      };
    }

    const minTime = new Date(filteredPriceRows[0].date).getTime();
    const maxTime = new Date(filteredPriceRows[filteredPriceRows.length - 1].date).getTime();
    const timeRange = Math.max(maxTime - minTime, 1);
    // The visible window tells us which prices are onscreen right now.
    // The raw visible scale reacts immediately to that data, but the rendered scale
    // expands quickly and contracts more slowly so scroll-driven re-scaling feels calmer.
    const { minPrice, maxPrice, ticks } = renderedScale;

    const pointPositions = tablePoints.map((annualRow) => {
      const pointTime = new Date(annualRow.fiscalYearEndDate).getTime();

      return {
        fiscalYear: annualRow.fiscalYear,
        date: annualRow.fiscalYearEndDate,
        x: ((pointTime - minTime) / timeRange) * timelineLayout.plotWidth,
      };
    });

    return {
      svgPath: buildSvgPath(
        filteredPriceRows,
        minPrice,
        maxPrice,
        minTime,
        timeRange,
        timelineLayout.plotWidth,
      ),
      pointPositions,
      januaryPositions: getJanuaryPositions(
        filteredPriceRows,
        minTime,
        timeRange,
        timelineLayout.plotWidth,
      ),
      minPrice,
      maxPrice,
      ticks,
      minTime,
      timeRange,
    };
  }, [filteredPriceRows, renderedScale, tablePoints, timelineLayout.plotWidth]);

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

  const handlePresetClick = (preset) => {
    const nextRange = getTrailingRange({
      monthCount: preset.monthCount,
      minAvailableMonth,
      maxAvailableMonth,
    });

    setFreeRangeStartMonth(nextRange.startMonth);
    setFreeRangeEndMonth(nextRange.endMonth);
    setRangeMode(preset.monthCount ? 'preset' : 'free');
    setActivePreset(preset.key);
    setIsPresetScrollReady(false);
    setPresetPanOffsetMonths(0);
  };

  const handleMouseMove = (event) => {
    if (!svgRef.current || !filteredPriceRows.length) {
      return;
    }

    const svgRect = svgRef.current.getBoundingClientRect();
    const mouseX = event.clientX - svgRect.left;
    const svgX = (mouseX / svgRect.width) * timelineLayout.contentWidth;

    if (svgX < 0 || svgX > timelineLayout.plotWidth) {
      setHoverState({
        date: '',
        price: null,
        x: null,
      });
      return;
    }

    const ratio = svgX / Math.max(timelineLayout.plotWidth, 1);
    const targetTime = chartGeometry.minTime + (ratio * chartGeometry.timeRange);

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
      x: svgX,
    });
  };

  const handleMouseLeave = () => {
    setHoverState({
      date: '',
      price: null,
      x: null,
    });
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
    cardBody = (
      <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden', backgroundColor: '#fff' }}>
        <Box
          sx={{
            width: '100%',
            overflowX: 'auto',
            overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch',
          }}
          data-testid="share-price-dashboard-scroll-region"
          ref={timelineScrollRef}
        >
          {/*
            The fixed-length presets reuse this same horizontal scroller, but they map scroll
            position to a month offset instead of an internal chart offset. MAX and custom ranges
            keep the long-history internal scrolling behavior.
          */}
          <Box sx={{ width: scrollSurfaceWidth, position: 'relative' }}>
            <Box
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
                        top: `${getChartYPosition(tickValue, chartGeometry.minPrice, chartGeometry.maxPrice)}px`,
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
                  <Box sx={{ width: timelineLayout.contentWidth, p: { xs: 1, sm: 2 }, pb: 0 }}>
                    <svg
                      ref={svgRef}
                      viewBox={`0 0 ${timelineLayout.contentWidth} ${CHART_HEIGHT}`}
                      style={{ width: `${timelineLayout.contentWidth}px`, height: `${CHART_HEIGHT}px`, cursor: 'crosshair', display: 'block' }}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                    >
                      <rect x="0" y={CHART_TOP_PADDING} width={timelineLayout.plotWidth} height={CHART_PLOT_HEIGHT} fill="white" />

                      {/* The gridlines come from the full rounded tick list so the
                        horizontal guides always match the scale values exactly. */}
                      {chartGeometry.ticks.map((tickValue) => {
                        const yPosition = getChartYPosition(
                          tickValue,
                          chartGeometry.minPrice,
                          chartGeometry.maxPrice,
                        );

                        return (
                          <line
                            key={tickValue}
                            data-testid="share-price-dashboard-y-gridline"
                            x1="0"
                            y1={yPosition}
                            x2={timelineLayout.plotWidth}
                            y2={yPosition}
                            stroke="#f1f5f9"
                          />
                        );
                      })}

                      {chartGeometry.januaryPositions.map((position) => (
                        <line
                          key={position.year}
                          x1={position.x}
                          y1={CHART_TOP_PADDING}
                          x2={position.x}
                          y2={CHART_TOP_PADDING + CHART_PLOT_HEIGHT}
                          stroke="#e2e8f0"
                        />
                      ))}

                      <path
                        d={chartGeometry.svgPath}
                        fill="none"
                        stroke="#c2410c"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {chartGeometry.pointPositions.map((position) => (
                        <line
                          key={position.date}
                          x1={position.x}
                          y1={CHART_TOP_PADDING + CHART_PLOT_HEIGHT}
                          x2={position.x}
                          y2={CHART_TOP_PADDING + CHART_PLOT_HEIGHT + 10}
                          stroke="#cbd5e1"
                          strokeWidth="2"
                        />
                      ))}

                      {hoverState.x !== null && hoverState.price !== null ? (
                        <g>
                          <line
                            x1={hoverState.x}
                            y1={CHART_TOP_PADDING}
                            x2={hoverState.x}
                            y2={CHART_TOP_PADDING + CHART_PLOT_HEIGHT}
                            stroke="#3b82f6"
                            strokeWidth="1.5"
                            strokeDasharray="4 4"
                            opacity="0.8"
                          />
                          <rect
                            x={Math.max(0, Math.min(hoverState.x - 60, timelineLayout.plotWidth - 120))}
                            y="5"
                            width="120"
                            height="36"
                            fill="white"
                            stroke="#3b82f6"
                            rx="4"
                            opacity="0.95"
                          />
                          <text x={hoverState.x} y="18" textAnchor="middle" fontSize="8" fontWeight="600" fill="#64748b">
                            {hoverState.date}
                          </text>
                          <text x={hoverState.x} y="32" textAnchor="middle" fontSize="10" fontWeight="700" fill="#c2410c">
                            {formatCurrency(hoverState.price)}
                          </text>
                        </g>
                      ) : null}

                      <line x1="0" y1={CHART_TOP_PADDING} x2="0" y2={CHART_TOP_PADDING + CHART_PLOT_HEIGHT} stroke="#cbd5e1" />
                    </svg>
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
                          ? { xs: '9px', sm: '10px' }
                          : { xs: '9px', sm: '10px', md: '11px' },
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
      </Box>
    );
  }

  return (
    <Card
      sx={{
        width: '100%',
        maxWidth: 1200,
        display: 'flex',
        flexDirection: 'column',
        margin: 0,
      }}
    >
      <CardContent sx={{ paddingBottom: '16px !important', paddingTop: '16px !important' }}>
        <Typography gutterBottom sx={{ color: 'text.secondary', fontSize: 14, marginBottom: '8px' }}>
          Stock
        </Typography>
        <Typography variant="h5" component="div" sx={{ marginBottom: 0, marginTop: 0 }}>
          {name || dashboardData?.companyName || identifier}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {identifier}
        </Typography>
      </CardContent>

      {isRemovable ? (
        <CardActions sx={{ pt: 0, px: 2 }}>
          <Button color="error" size="small" onClick={onRemove}>
            Remove stock
          </Button>
        </CardActions>
      ) : null}

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          px: { xs: 1, sm: 2 },
          pb: 2,
          pt: 0,
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, sm: 2 }, justifyContent: 'center' }}>
          <TextField
            label="Start month"
            type="month"
            size="small"
            value={currentStartMonth}
            onChange={(event) => {
              setFreeRangeStartMonth(event.target.value);
              setFreeRangeEndMonth(currentEndMonth);
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
              setFreeRangeStartMonth(currentStartMonth);
              setFreeRangeEndMonth(event.target.value);
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
    </Card>
  );
}
