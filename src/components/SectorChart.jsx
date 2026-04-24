import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { filterDataByMonthRange } from '../dataset/SharePrice';
import ChartDateRangeControls from './ChartDateRangeControls';
import {
  buildRoundedIntegerChartScale,
  formatYAxisInteger,
  getPreferredTickCount,
  getRawChartScale,
} from './sharePriceChartScale';
import TimeSeriesChartSvg from './TimeSeriesChartSvg';
import {
  DEFAULT_CHART_TOP_PADDING,
  buildLinearTimeMapper,
  buildSvgPath,
  getChartPlotHeight,
  getChartYPosition,
  getClosestDataPoint,
  getJanuaryPositions,
} from './timeSeriesChartCore';

const SECTOR_CHART_HEIGHT = 360;
const SECTOR_CHART_RIGHT_PADDING = 16;
const SECTOR_Y_AXIS_WIDTH = 68;
const SECTOR_CHART_FALLBACK_WIDTH = 540;
const SECTOR_CHART_BOTTOM_PADDING = 36;
const PRESET_PAN_STEP_PX = 28;
const SECTOR_X_AXIS_MIN_LABEL_SPACING_PX = 56;

const sectorHoverDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

function formatSectorHoverDate(dateString) {
  return sectorHoverDateFormatter.format(new Date(dateString));
}

function buildVisibleSectorXAxisLabels(januaryPositions) {
  if (!Array.isArray(januaryPositions) || januaryPositions.length === 0) {
    return [];
  }

  if (januaryPositions.length <= 2) {
    return januaryPositions;
  }

  // We keep every January guide line for time reference, but filter the text labels
  // separately so long ranges stay readable instead of collapsing into overlapping years.
  const firstPosition = januaryPositions[0];
  const lastPosition = januaryPositions[januaryPositions.length - 1];
  const visibleLabels = [firstPosition];

  for (let index = 1; index < januaryPositions.length - 1; index += 1) {
    const candidate = januaryPositions[index];
    const previousVisibleLabel = visibleLabels[visibleLabels.length - 1];

    if ((candidate.x - previousVisibleLabel.x) >= SECTOR_X_AXIS_MIN_LABEL_SPACING_PX) {
      visibleLabels.push(candidate);
    }
  }

  if ((lastPosition.x - visibleLabels[visibleLabels.length - 1].x) < SECTOR_X_AXIS_MIN_LABEL_SPACING_PX) {
    visibleLabels[visibleLabels.length - 1] = lastPosition;
  } else {
    visibleLabels.push(lastPosition);
  }

  return visibleLabels;
}

export default function SectorChart({
  series = [],
  startDate = '',
  endDate = '',
  onStartDateChange,
  onEndDateChange,
  minAvailableMonth = '',
  maxAvailableMonth = '',
  activePreset = '',
  onApplyMaxRange,
  onApplyTrailingRange,
  disabled = false,
  isPresetWindowMode = false,
  maxPresetPanOffset = 0,
  presetPanOffsetMonths = 0,
  onPresetPanOffsetChange = () => {},
  invalidRangeMessage = 'Start month must be earlier than or equal to end month.',
  emptyRangeMessage = 'No sector chart data matches the selected month range.',
}) {
  const svgRef = useRef(null);
  const chartViewportRef = useRef(null);
  const hasBootstrappedPresetRef = useRef(false);
  const presetBootstrapKeyRef = useRef('');
  const presetBootstrapFrameRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [hoverState, setHoverState] = useState({
    label: '',
    value: null,
    x: null,
  });
  const isRangeValid = !startDate || !endDate || startDate <= endDate;
  const presetBootstrapKey = useMemo(() => {
    if (!isPresetWindowMode) {
      return `idle|${activePreset}|${maxPresetPanOffset}`;
    }

    return `${activePreset}|${maxPresetPanOffset}|${minAvailableMonth}|${maxAvailableMonth}`;
  }, [activePreset, isPresetWindowMode, maxAvailableMonth, maxPresetPanOffset, minAvailableMonth]);

  useLayoutEffect(() => {
    const updateChartWidth = () => {
      setChartWidth(Math.max((chartViewportRef.current?.clientWidth || 0) - SECTOR_Y_AXIS_WIDTH, 0));
    };

    updateChartWidth();

    if (typeof ResizeObserver === 'function' && chartViewportRef.current) {
      const observer = new ResizeObserver((entries) => {
        const nextWidth = entries[0]?.contentRect?.width ?? chartViewportRef.current?.clientWidth ?? 0;
        // The scroll viewport also contains the sticky Y-axis rail. Subtracting
        // it keeps the plotted SVG matched to the user-visible chart area.
        setChartWidth(Math.max(nextWidth - SECTOR_Y_AXIS_WIDTH, 0));
      });

      observer.observe(chartViewportRef.current);

      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener('resize', updateChartWidth);

    return () => {
      window.removeEventListener('resize', updateChartWidth);
    };
  }, []);

  useLayoutEffect(() => {
    const scrollElement = chartViewportRef.current;

    if (!scrollElement || !isPresetWindowMode) {
      return undefined;
    }

    const handleScroll = () => {
      const nextPresetPanOffset = Math.min(
        Math.max(maxPresetPanOffset - Math.round(scrollElement.scrollLeft / PRESET_PAN_STEP_PX), 0),
        maxPresetPanOffset,
      );

      if (nextPresetPanOffset !== presetPanOffsetMonths) {
        onPresetPanOffsetChange(nextPresetPanOffset);
      }
    };

    scrollElement.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
    };
  }, [
    isPresetWindowMode,
    maxPresetPanOffset,
    onPresetPanOffsetChange,
    presetPanOffsetMonths,
  ]);

  useLayoutEffect(() => {
    if (presetBootstrapKeyRef.current !== presetBootstrapKey) {
      presetBootstrapKeyRef.current = presetBootstrapKey;
      hasBootstrappedPresetRef.current = false;
    }
  }, [presetBootstrapKey]);

  useLayoutEffect(() => {
    if (!isPresetWindowMode || hasBootstrappedPresetRef.current) {
      return undefined;
    }

    const scrollElement = chartViewportRef.current;

    if (!scrollElement) {
      return undefined;
    }

    const desiredScrollLeft = Math.max(maxPresetPanOffset, 0) * PRESET_PAN_STEP_PX;

    // This ref only protects one-time preset scroll setup. It is bookkeeping
    // for the chart viewport, not user-visible state the card needs to render.
    hasBootstrappedPresetRef.current = true;
    scrollElement.scrollLeft = desiredScrollLeft;

    if (presetPanOffsetMonths !== 0) {
      onPresetPanOffsetChange(0);
    }

    if (presetBootstrapFrameRef.current) {
      cancelAnimationFrame(presetBootstrapFrameRef.current);
    }

    presetBootstrapFrameRef.current = requestAnimationFrame(() => {
      presetBootstrapFrameRef.current = null;
      scrollElement.scrollLeft = desiredScrollLeft;
    });

    return () => {
      if (presetBootstrapFrameRef.current) {
        cancelAnimationFrame(presetBootstrapFrameRef.current);
        presetBootstrapFrameRef.current = null;
      }
    };
  }, [isPresetWindowMode, maxPresetPanOffset, onPresetPanOffsetChange, presetPanOffsetMonths, presetBootstrapKey]);

  useEffect(() => {
    return () => {
      if (presetBootstrapFrameRef.current) {
        cancelAnimationFrame(presetBootstrapFrameRef.current);
        presetBootstrapFrameRef.current = null;
      }
    };
  }, []);

  const filteredSectorData = useMemo(() => {
    return filterDataByMonthRange(Array.isArray(series) ? series : [], startDate, endDate);
  }, [endDate, series, startDate]);
  const effectiveChartWidth = chartWidth || SECTOR_CHART_FALLBACK_WIDTH;
  const plotWidth = Math.max(effectiveChartWidth - SECTOR_CHART_RIGHT_PADDING, 1);
  const contentWidth = plotWidth + SECTOR_CHART_RIGHT_PADDING;
  const plotHeight = getChartPlotHeight(SECTOR_CHART_HEIGHT, {
    topPadding: DEFAULT_CHART_TOP_PADDING,
    bottomPadding: SECTOR_CHART_BOTTOM_PADDING,
  });

  const chartGeometry = useMemo(() => {
    if (!filteredSectorData.length) {
      return {
        januaryPositions: [],
        xAxisLabels: [],
        mapTimeToX: () => 0,
        mapXToTime: () => 0,
        maxPrice: 5,
        minPrice: 0,
        svgPath: '',
        ticks: [0, 1, 2, 3, 4, 5],
      };
    }

    const rawScale = getRawChartScale(filteredSectorData);
    const roundedScale = buildRoundedIntegerChartScale(
      rawScale.minPrice,
      rawScale.maxPrice,
      { preferredTickCount: getPreferredTickCount(plotHeight) },
    );
    const minTime = new Date(filteredSectorData[0].date).getTime();
    const maxTime = new Date(filteredSectorData[filteredSectorData.length - 1].date).getTime();
    const linearMapper = buildLinearTimeMapper(minTime, maxTime, plotWidth);
    const januaryPositions = getJanuaryPositions(
      filteredSectorData,
      minTime,
      maxTime,
      linearMapper.mapTimeToX,
    );

    return {
      januaryPositions,
      xAxisLabels: buildVisibleSectorXAxisLabels(januaryPositions),
      mapTimeToX: linearMapper.mapTimeToX,
      mapXToTime: linearMapper.mapXToTime,
      maxPrice: roundedScale.maxPrice,
      minPrice: roundedScale.minPrice,
      svgPath: buildSvgPath(
        filteredSectorData,
        roundedScale.minPrice,
        roundedScale.maxPrice,
        linearMapper.mapTimeToX,
        SECTOR_CHART_HEIGHT,
        {
          topPadding: DEFAULT_CHART_TOP_PADDING,
          bottomPadding: SECTOR_CHART_BOTTOM_PADDING,
        },
      ),
      ticks: roundedScale.ticks,
    };
  }, [filteredSectorData, plotHeight, plotWidth]);

  const clearHoverState = () => {
    setHoverState({
      label: '',
      value: null,
      x: null,
    });
  };

  const getSvgXFromClientX = (clientX) => {
    const svgRect = svgRef.current?.getBoundingClientRect?.();

    if (!svgRect || !svgRect.width || !Number.isFinite(clientX)) {
      return null;
    }

    return ((clientX - svgRect.left) / svgRect.width) * contentWidth;
  };

  const updateHoverStateFromSvgX = (svgX) => {
    if (!filteredSectorData.length || svgX === null || svgX < 0 || svgX > plotWidth) {
      clearHoverState();
      return;
    }

    const targetTime = chartGeometry.mapXToTime(svgX);
    const closestPoint = getClosestDataPoint(filteredSectorData, targetTime);

    if (!closestPoint) {
      clearHoverState();
      return;
    }

    setHoverState({
      label: formatSectorHoverDate(closestPoint.date),
      value: closestPoint.close,
      x: chartGeometry.mapTimeToX(new Date(closestPoint.date).getTime()),
    });
  };

  const handleMouseMove = (event) => {
    updateHoverStateFromSvgX(getSvgXFromClientX(event.clientX));
  };

  const handleMouseLeave = () => {
    clearHoverState();
  };

  const handleTouchStart = (event) => {
    if (!event.touches?.length) {
      return;
    }

    updateHoverStateFromSvgX(getSvgXFromClientX(event.touches[0].clientX));
  };

  const handleTouchMove = (event) => {
    if (!event.touches?.length) {
      return;
    }

    updateHoverStateFromSvgX(getSvgXFromClientX(event.touches[0].clientX));
  };

  const handleTouchEnd = () => {
    clearHoverState();
  };

  if (!isRangeValid) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Box
          sx={{
            minHeight: SECTOR_CHART_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 3,
          }}
        >
          <Typography variant="body2" color="error" align="center">
            {invalidRangeMessage}
          </Typography>
        </Box>
        <ChartDateRangeControls
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={onStartDateChange}
          onEndDateChange={onEndDateChange}
          minAvailableMonth={minAvailableMonth}
          maxAvailableMonth={maxAvailableMonth}
          activePreset={activePreset}
          onApplyMaxRange={onApplyMaxRange}
          onApplyTrailingRange={onApplyTrailingRange}
          disabled={disabled}
        />
      </Box>
    );
  }

  if (filteredSectorData.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Box
          sx={{
            minHeight: SECTOR_CHART_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 3,
          }}
        >
          <Typography variant="body2" color="text.secondary" align="center">
            {emptyRangeMessage}
          </Typography>
        </Box>
        <ChartDateRangeControls
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={onStartDateChange}
          onEndDateChange={onEndDateChange}
          minAvailableMonth={minAvailableMonth}
          maxAvailableMonth={maxAvailableMonth}
          activePreset={activePreset}
          onApplyMaxRange={onApplyMaxRange}
          onApplyTrailingRange={onApplyTrailingRange}
          disabled={disabled}
        />
      </Box>
    );
  }

  const visibleChartSurfaceWidth = SECTOR_Y_AXIS_WIDTH + effectiveChartWidth;
  const scrollSurfaceWidth = isPresetWindowMode
    ? visibleChartSurfaceWidth + (Math.max(maxPresetPanOffset, 0) * PRESET_PAN_STEP_PX)
    : visibleChartSurfaceWidth;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Box
        ref={chartViewportRef}
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          width: '100%',
          overflowX: isPresetWindowMode ? 'auto' : 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
        data-testid="sector-chart-scroll-region"
        data-scroll-mode={isPresetWindowMode ? 'preset' : 'range'}
      >
        <Box
          sx={{
            width: scrollSurfaceWidth,
            position: 'relative',
          }}
        >
          {/* Preset mode scrolls across a wider hidden surface, but the visible chart stays
              pinned so the Y-axis rail and current time window behave like the stock cards. */}
          <Box
            sx={{
              width: visibleChartSurfaceWidth,
              position: isPresetWindowMode ? 'sticky' : 'relative',
              left: isPresetWindowMode ? 0 : 'auto',
              top: 0,
            }}
            data-testid="sector-chart-visible-surface"
          >
            <Box sx={{ display: 'flex', alignItems: 'stretch', width: visibleChartSurfaceWidth }}>
              {/* Keeping the Y-axis inside the same scroller lets CSS sticky pin it to the left
                  edge while the chart body continues to move underneath on horizontal scroll. */}
              <Box
                data-testid="sector-chart-y-axis-rail"
                data-sticky-behavior="left-rail"
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  width: SECTOR_Y_AXIS_WIDTH,
                  flexShrink: 0,
                  px: 1,
                  py: `${DEFAULT_CHART_TOP_PADDING}px`,
                  color: '#64748b',
                  fontSize: '10px',
                  backgroundColor: '#ffffff',
                  borderRight: '1px solid #e2e8f0',
                }}
              >
                {chartGeometry.ticks.map((tickValue) => (
                  <Box
                    key={tickValue}
                    data-testid="sector-chart-y-axis-label"
                    sx={{
                      position: 'absolute',
                      right: 8,
                      top: `${getChartYPosition(
                        tickValue,
                        chartGeometry.minPrice,
                        chartGeometry.maxPrice,
                        SECTOR_CHART_HEIGHT,
                        {
                          topPadding: DEFAULT_CHART_TOP_PADDING,
                          bottomPadding: SECTOR_CHART_BOTTOM_PADDING,
                        },
                      )}px`,
                      transform: 'translateY(-50%)',
                      lineHeight: 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatYAxisInteger(tickValue)}
                  </Box>
                ))}
              </Box>

              <Box sx={{ width: effectiveChartWidth, flexShrink: 0 }}>
                <TimeSeriesChartSvg
                  testId="sector-chart-svg"
                  svgRef={svgRef}
                  chartHeight={SECTOR_CHART_HEIGHT}
                  contentWidth={contentWidth}
                  plotWidth={plotWidth}
                  horizontalGridLines={chartGeometry.ticks.map((tickValue) => ({
                    key: tickValue,
                    testId: 'sector-chart-y-gridline',
                    y: getChartYPosition(
                      tickValue,
                      chartGeometry.minPrice,
                      chartGeometry.maxPrice,
                      SECTOR_CHART_HEIGHT,
                      {
                        topPadding: DEFAULT_CHART_TOP_PADDING,
                        bottomPadding: SECTOR_CHART_BOTTOM_PADDING,
                      },
                    ),
                  }))}
                  verticalMarkers={chartGeometry.januaryPositions.map((position) => ({
                    key: position.year,
                    x: position.x,
                  }))}
                  showBottomAxis
                  xAxisLabels={chartGeometry.xAxisLabels.map((position) => ({
                    key: position.year,
                    text: String(position.year),
                    x: position.x,
                    testId: 'sector-chart-x-axis-label',
                    dataAttributes: {
                      year: position.year,
                      x: position.x,
                    },
                  }))}
                  linePath={chartGeometry.svgPath}
                  hoverState={hoverState.x !== null && hoverState.value !== null ? hoverState : null}
                  hoverValueFormatter={formatYAxisInteger}
                  bottomPadding={SECTOR_CHART_BOTTOM_PADDING}
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
        </Box>
      </Box>

      <ChartDateRangeControls
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        minAvailableMonth={minAvailableMonth}
        maxAvailableMonth={maxAvailableMonth}
        activePreset={activePreset}
        onApplyMaxRange={onApplyMaxRange}
        onApplyTrailingRange={onApplyTrailingRange}
        disabled={disabled}
      />
    </Box>
  );
}
