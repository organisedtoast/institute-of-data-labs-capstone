import { useEffect } from 'react';
// Import LineChart component from MUI X Charts library
// This is a pre-built chart component that makes it easy to create line charts
import { LineChart } from '@mui/x-charts/LineChart';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// Import data and formatter functions from the dataset file
// dateAxisFormatter: function to format dates on the x-axis
// priceFormatter: function to format values as plain numbers on the y-axis
import {
  dateAxisFormatter,
  filterDataByMonthRange,
  getMonthBoundsFromData,
  priceFormatter,
} from '../dataset/SharePrice';
// Import the dedicated dummy dataset for the sector chart.
// Keeping this data in its own file makes the chart component easier to read.
import { SectorPrice } from '../dataset/SectorPrice';
import ChartDateRangeControls from './ChartDateRangeControls';
import useChartDateRange from '../hooks/useChartDateRange';

// SectorChart component - renders a line chart showing share price over time
export default function SectorChart() {
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

  // The sector chart uses local demo data instead of the external stock API.
  // We still reuse the same hook so the date-picker behaviour stays consistent across the app.
  // Because the dataset is local and already available, we only filter what is displayed.
  useEffect(() => {
    initializeRangeFromData(SectorPrice);
  }, [initializeRangeFromData]);

  const filteredSectorData = filterDataByMonthRange(SectorPrice, startDate, endDate);
  const { earliestMonth, latestMonth } = getMonthBoundsFromData(SectorPrice);

  // xAxis configuration array - defines how the horizontal axis (x-axis) behaves
  // Each object in the array configures one axis
  const xAxis = [
    {
      // dataKey: specifies which property from the dataset to use for this axis
      // In our case, each data object has a 'date' property
      dataKey: 'date',

      // scaleType: 'point' treats the data as categorical points
      // Works with string date values like "2020-01-01"
      scaleType: 'point',

      // valueFormatter: function that formats how the dates appear on the axis
      // Uses dateAxisFormatter to show "Jan 2020" instead of raw date strings
      valueFormatter: dateAxisFormatter,
    },
  ];

  // yAxis configuration array - defines how the vertical axis (y-axis) behaves
  const yAxis = [
    {
      // valueFormatter: function that formats the numbers on the y-axis
      // Uses priceFormatter to show "36.00" instead of percentages
      valueFormatter: priceFormatter,

      // Keep the y-axis labels compact and readable.
      tickLabelStyle: {
        fontSize: 11,
      },
    },
  ];

  // series configuration array - defines the lines/series to plot on the chart
  // Each object in the array creates one line on the chart
  const series = [
    {
      // dataKey: specifies which property from the dataset to plot as a line
      // In our case, each data object has a 'close' property (share price)
      dataKey: 'close',

      // showMark: false hides the individual data point circles on the line
      // Set to true if you want to see a dot at each data point
      showMark: false,

      // valueFormatter: formats the value shown in tooltips when hovering over the line
      valueFormatter: priceFormatter,

      // Give the sector chart line a dark-orange color so it matches the desired chart styling.
      color: '#c2410c',

      // Make the line much easier to see by doubling the thickness from the default look.
      strokeWidth: 4,
    },
  ];

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
            minHeight: 360,
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
            minHeight: 360,
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
      {/* LineChart component with all configuration props: */}
      <LineChart
        // dataset: the array of data objects to visualize
        // Each object should have properties matching the dataKeys in xAxis and series
        dataset={filteredSectorData}

        // xAxis: pass the x-axis configuration array defined above
        xAxis={xAxis}

        // yAxis: pass the y-axis configuration array defined above
        yAxis={yAxis}

        // series: pass the series configuration array defined above
        series={series}

        // height: the height of the chart in pixels
        height={360}

        // Keep extra left padding so wider y-axis labels are fully visible.
        margin={{ top: 16, right: 16, left: 80 }}

        // grid: configuration for the chart grid lines
        // vertical: true shows vertical grid lines
        // horizontal: true shows horizontal grid lines
        grid={{ vertical: true, horizontal: true }}
      />

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
