import React from 'react';

import {
  DEFAULT_CHART_BOTTOM_PADDING,
  DEFAULT_CHART_TOP_PADDING,
  getChartPlotHeight,
} from './timeSeriesChartCore';

function applyDataAttributes(baseProps, dataAttributes = {}) {
  return Object.entries(dataAttributes).reduce((props, [key, value]) => {
    props[`data-${key}`] = String(value);
    return props;
  }, { ...baseProps });
}

export default function TimeSeriesChartSvg({
  svgRef = null,
  chartHeight,
  contentWidth,
  plotWidth,
  cursor = 'crosshair',
  backgroundBands = [],
  horizontalGridLines = [],
  verticalMarkers = [],
  linePath = '',
  lineColor = '#c2410c',
  lineWidth = 4,
  bottomMarkers = [],
  showBottomAxis = false,
  xAxisLabels = [],
  xAxisLabelOffset = 16,
  hoverState = null,
  hoverValueFormatter = (value) => String(value),
  watermark = null,
  onMouseMove = undefined,
  onMouseLeave = undefined,
  onTouchStart = undefined,
  onTouchMove = undefined,
  onTouchEnd = undefined,
  onTouchCancel = undefined,
  topPadding = DEFAULT_CHART_TOP_PADDING,
  bottomPadding = DEFAULT_CHART_BOTTOM_PADDING,
  testId = undefined,
}) {
  const plotHeight = getChartPlotHeight(chartHeight, {
    topPadding,
    bottomPadding,
  });

  return (
    <svg
      ref={svgRef}
      data-testid={testId}
      viewBox={`0 0 ${contentWidth} ${chartHeight}`}
      style={{
        width: `${contentWidth}px`,
        height: `${chartHeight}px`,
        cursor,
        display: 'block',
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <rect x="0" y={topPadding} width={plotWidth} height={plotHeight} fill="white" />

      {backgroundBands.map((band) => (
        <rect
          key={band.key}
          {...applyDataAttributes(
            {
              'data-testid': band.testId,
              x: band.startX,
              y: topPadding,
              width: band.width,
              height: plotHeight,
              fill: band.fill,
            },
            band.dataAttributes,
          )}
        />
      ))}

      {horizontalGridLines.map((gridLine) => (
        <line
          key={gridLine.key}
          data-testid={gridLine.testId}
          x1={gridLine.x1 ?? 0}
          y1={gridLine.y}
          x2={gridLine.x2 ?? plotWidth}
          y2={gridLine.y}
          stroke={gridLine.stroke ?? '#f1f5f9'}
          strokeWidth={gridLine.strokeWidth ?? 1}
        />
      ))}

      {verticalMarkers.map((marker) => (
        <line
          key={marker.key}
          x1={marker.x}
          y1={marker.y1 ?? topPadding}
          x2={marker.x}
          y2={marker.y2 ?? topPadding + plotHeight}
          stroke={marker.stroke ?? '#e2e8f0'}
          strokeWidth={marker.strokeWidth ?? 1}
        />
      ))}

      <path
        d={linePath}
        fill="none"
        stroke={lineColor}
        strokeWidth={lineWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {bottomMarkers.map((marker) => (
        <line
          key={marker.key}
          {...applyDataAttributes(
            {
              'data-testid': marker.testId,
              x1: marker.x,
              y1: marker.y1 ?? topPadding + plotHeight,
              x2: marker.x,
              y2: marker.y2 ?? topPadding + plotHeight + 10,
              stroke: marker.stroke ?? '#cbd5e1',
              strokeWidth: marker.strokeWidth ?? 2,
            },
            marker.dataAttributes,
          )}
        />
      ))}

      {showBottomAxis || xAxisLabels.length ? (
        <line
          data-testid="time-series-chart-x-axis-baseline"
          x1="0"
          y1={topPadding + plotHeight}
          x2={plotWidth}
          y2={topPadding + plotHeight}
          stroke="#cbd5e1"
        />
      ) : null}

      {xAxisLabels.map((label) => (
        <text
          key={label.key}
          {...applyDataAttributes(
            {
              'data-testid': label.testId,
              x: label.x,
              y: topPadding + plotHeight + (label.yOffset ?? xAxisLabelOffset),
              textAnchor: label.textAnchor ?? 'middle',
              fontSize: label.fontSize ?? 10,
              fontWeight: label.fontWeight ?? 600,
              fill: label.fill ?? '#64748b',
            },
            label.dataAttributes,
          )}
        >
          {label.text}
        </text>
      ))}

      {hoverState?.x !== null && hoverState?.x !== undefined && hoverState?.value !== null && hoverState?.value !== undefined ? (
        <g>
          <line
            x1={hoverState.x}
            y1={topPadding}
            x2={hoverState.x}
            y2={topPadding + plotHeight}
            stroke="#3b82f6"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.8"
          />
          <rect
            x={Math.max(0, Math.min(hoverState.x - 60, plotWidth - 120))}
            y="5"
            width="120"
            height="36"
            fill="white"
            stroke="#3b82f6"
            rx="4"
            opacity="0.95"
          />
          <text x={hoverState.x} y="18" textAnchor="middle" fontSize="8" fontWeight="600" fill="#64748b">
            {hoverState.label}
          </text>
          <text
            x={hoverState.x}
            y="32"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill={hoverState.valueColor ?? '#c2410c'}
          >
            {hoverValueFormatter(hoverState.value)}
          </text>
        </g>
      ) : null}

      {watermark ? (
        <text
          {...applyDataAttributes(
            {
              'data-testid': watermark.testId,
              x: watermark.x,
              y: watermark.y,
              textAnchor: 'middle',
              dominantBaseline: 'middle',
              fontSize: watermark.fontSize ?? 28,
              fontWeight: watermark.fontWeight ?? 700,
              fill: watermark.fill ?? '#64748b',
              opacity: watermark.opacity ?? 0.16,
            },
            watermark.dataAttributes,
          )}
        >
          {watermark.text}
        </text>
      ) : null}

      <line x1="0" y1={topPadding} x2="0" y2={topPadding + plotHeight} stroke="#cbd5e1" />
    </svg>
  );
}
