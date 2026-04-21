import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import {
  filterDataByMonthRange,
  getMonthBoundsFromData,
} from '../dataset/SharePrice';
import { SectorPrice } from '../dataset/SectorPrice';
import useChartDateRange from '../hooks/useChartDateRange';
import ChartDateRangeControls from './ChartDateRangeControls';
import {
  buildRoundedIntegerChartScale,
  formatYAxisInteger,
  getPreferredTickCount,
  getRawChartScale,
} from './sharePriceChartScale';
import TimeSeriesChartSvg from './TimeSeriesChartSvg';
import {
  DEFAULT_CHART_BOTTOM_PADDING,
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

const sectorHoverDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
});

function formatSectorHoverDate(dateString) {
  return sectorHoverDateFormatter.format(new Date(dateString));
}

export default function SectorChart() {
  const svgRef = useRef(null);
  const chartViewportRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [hoverState, setHoverState] = useState({
    label: '',
    value: null,
    x: null,
  });
  const {
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    minAvailableMonth,
    maxAvailableMonth,
    isRangeValid,
    activePreset,
    initializeRangeFromData,
    applyMaxRange,
    applyTrailingRange,
  } = useChartDateRange();

  useEffect(() => {
    initializeRangeFromData(SectorPrice);
  }, [initializeRangeFromData]);

  useLayoutEffect(() => {
    const updateChartWidth = () => {
      setChartWidth(chartViewportRef.current?.clientWidth || 0);
    };

    updateChartWidth();

    if (typeof ResizeObserver === 'function' && chartViewportRef.current) {
      const observer = new ResizeObserver((entries) => {
        const nextWidth = entries[0]?.contentRect?.width ?? chartViewportRef.current?.clientWidth ?? 0;
        setChartWidth(nextWidth);
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

  const filteredSectorData = filterDataByMonthRange(SectorPrice, startDate, endDate);
  const { earliestMonth, latestMonth } = getMonthBoundsFromData(SectorPrice);
  const effectiveChartWidth = chartWidth || SECTOR_CHART_FALLBACK_WIDTH;
  const plotWidth = Math.max(effectiveChartWidth - SECTOR_CHART_RIGHT_PADDING, 1);
  const contentWidth = plotWidth + SECTOR_CHART_RIGHT_PADDING;
  const plotHeight = getChartPlotHeight(SECTOR_CHART_HEIGHT, {
    topPadding: DEFAULT_CHART_TOP_PADDING,
    bottomPadding: DEFAULT_CHART_BOTTOM_PADDING,
  });

  const chartGeometry = useMemo(() => {
    if (!filteredSectorData.length) {
      return {
        januaryPositions: [],
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

    return {
      januaryPositions: getJanuaryPositions(
        filteredSectorData,
        minTime,
        maxTime,
        linearMapper.mapTimeToX,
      ),
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
          bottomPadding: DEFAULT_CHART_BOTTOM_PADDING,
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
            Start month must be earlier than or equal to end month.
          </Typography>
        </Box>
        <ChartDateRangeControls
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          minAvailableMonth={minAvailableMonth}
          maxAvailableMonth={maxAvailableMonth}
          activePreset={activePreset}
          onApplyMaxRange={applyMaxRange}
          onApplyTrailingRange={applyTrailingRange}
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
            No sector chart data matches the selected month range.
          </Typography>
        </Box>
        <ChartDateRangeControls
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          minAvailableMonth={minAvailableMonth || earliestMonth}
          maxAvailableMonth={maxAvailableMonth || latestMonth}
          activePreset={activePreset}
          onApplyMaxRange={applyMaxRange}
          onApplyTrailingRange={applyTrailingRange}
        />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'stretch', width: '100%' }}>
        <Box
          sx={{
            position: 'relative',
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
                    bottomPadding: DEFAULT_CHART_BOTTOM_PADDING,
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

        <Box ref={chartViewportRef} sx={{ flex: 1, minWidth: 0 }}>
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
                  bottomPadding: DEFAULT_CHART_BOTTOM_PADDING,
                },
              ),
            }))}
            verticalMarkers={chartGeometry.januaryPositions.map((position) => ({
              key: position.year,
              x: position.x,
            }))}
            linePath={chartGeometry.svgPath}
            hoverState={hoverState.x !== null && hoverState.value !== null ? hoverState : null}
            hoverValueFormatter={formatYAxisInteger}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          />
        </Box>
      </Box>

      <ChartDateRangeControls
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        minAvailableMonth={minAvailableMonth || earliestMonth}
        maxAvailableMonth={maxAvailableMonth || latestMonth}
        activePreset={activePreset}
        onApplyMaxRange={applyMaxRange}
        onApplyTrailingRange={applyTrailingRange}
      />
    </Box>
  );
}
