import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';

// These are the preset buttons that appear for every chart.
// We store the button label and the number of months together so the rendering code stays small and readable.
const PRESET_BUTTONS = [
  { key: '1M', label: '1M', monthCount: 1 },
  { key: '6M', label: '6M', monthCount: 6 },
  { key: '1Y', label: '1Y', monthCount: 12 },
  { key: '3Y', label: '3Y', monthCount: 36 },
  { key: '5Y', label: '5Y', monthCount: 60 },
  { key: '10Y', label: '10Y', monthCount: 120 },
];

// These shared styles give the chart preset buttons the same purple tone as the navbar.
// Because both the sector chart and the individual stock cards reuse this component,
// changing the style here updates both places at once.
const chartButtonStyles = {
  color: '#4a148c',
  borderColor: '#4a148c',
  '&:hover': {
    borderColor: '#6a1b9a',
    backgroundColor: 'rgba(74, 20, 140, 0.08)',
  },
  '&.Mui-disabled': {
    borderColor: 'rgba(74, 20, 140, 0.3)',
    color: 'rgba(74, 20, 140, 0.4)',
  },
};

const chartButtonContainedStyles = {
  backgroundColor: '#4a148c',
  color: '#ffffff',
  '&:hover': {
    backgroundColor: '#6a1b9a',
  },
  '&.Mui-disabled': {
    backgroundColor: 'rgba(74, 20, 140, 0.4)',
    color: 'rgba(255, 255, 255, 0.8)',
  },
};

// This small reusable component renders the month input controls for a chart.
// Reusing one component keeps the stock cards and the sector chart visually consistent,
// and it gives beginner developers one clear place to study how the inputs work.
export default function ChartDateRangeControls({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  minAvailableMonth,
  maxAvailableMonth,
  activePreset,
  onApplyMaxRange,
  onApplyTrailingRange,
  disabled = false,
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        px: 2,
        pb: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          justifyContent: 'center',
        }}
      >
        {/* `type="month"` gives us a native browser month picker that stores values like "2024-06". */}
        <TextField
          label="Start month"
          type="month"
          size="small"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          inputProps={{
            min: minAvailableMonth || undefined,
            max: maxAvailableMonth || undefined,
          }}
          disabled={disabled}
          InputLabelProps={{ shrink: true }}
        />

        <TextField
          label="End month"
          type="month"
          size="small"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          inputProps={{
            min: minAvailableMonth || undefined,
            max: maxAvailableMonth || undefined,
          }}
          disabled={disabled}
          InputLabelProps={{ shrink: true }}
        />
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          justifyContent: 'center',
        }}
      >
        {/* Preset buttons are helpful because users can jump to common ranges without calculating months manually. */}
        <Button
          variant={activePreset === 'MAX' ? 'contained' : 'outlined'}
          sx={activePreset === 'MAX' ? chartButtonContainedStyles : chartButtonStyles}
          onClick={onApplyMaxRange}
          disabled={disabled || !minAvailableMonth || !maxAvailableMonth}
        >
          Max
        </Button>

        {PRESET_BUTTONS.map((presetButton) => {
          return (
            <Button
              key={presetButton.key}
              variant={activePreset === presetButton.key ? 'contained' : 'outlined'}
              sx={activePreset === presetButton.key ? chartButtonContainedStyles : chartButtonStyles}
              onClick={() => onApplyTrailingRange(presetButton.monthCount, presetButton.key)}
              disabled={disabled || !minAvailableMonth || !maxAvailableMonth}
            >
              {presetButton.label}
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
