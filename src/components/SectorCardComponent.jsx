import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  clampMonthString,
  compareMonthStrings,
  getCurrentMonthString,
  getTrailingMonthRange,
  shiftMonthString,
} from '../dataset/SharePrice';
import {
  queryInvestmentCategoryCard,
  updateInvestmentCategoryConstituent,
} from '../services/investmentCategoryCardsApi';
import SectorChart from './SectorChart';

const PRESET_BUTTONS = [
  { key: 'MAX', label: 'Max', monthCount: null },
  { key: '1M', label: '1M', monthCount: 1 },
  { key: '6M', label: '6M', monthCount: 6 },
  { key: '1Y', label: '1Y', monthCount: 12 },
  { key: '3Y', label: '3Y', monthCount: 36 },
  { key: '5Y', label: '5Y', monthCount: 60 },
  { key: '10Y', label: '10Y', monthCount: 120 },
];

function getPresetKeyForRange(startMonth, endMonth, minAvailableMonth, maxAvailableMonth) {
  if (!startMonth || !endMonth || !minAvailableMonth || !maxAvailableMonth) {
    return '';
  }

  const matchingPreset = PRESET_BUTTONS.find((preset) => {
    if (!preset.monthCount) {
      return false;
    }

    const trailingRange = getTrailingMonthRange({
      monthCount: preset.monthCount,
      targetEndMonth: getCurrentMonthString(),
      minAvailableMonth,
      maxAvailableMonth,
    });

    return trailingRange.startDate === startMonth && trailingRange.endDate === endMonth;
  });

  if (matchingPreset?.key) {
    return matchingPreset.key;
  }

  if (startMonth === minAvailableMonth && endMonth === maxAvailableMonth) {
    return 'MAX';
  }

  return '';
}

function buildTrailingRange(monthCount, minAvailableMonth, maxAvailableMonth) {
  return getTrailingMonthRange({
    monthCount,
    targetEndMonth: getCurrentMonthString(),
    minAvailableMonth,
    maxAvailableMonth,
  });
}

function getMonthOffset(startMonth, endMonth) {
  if (!startMonth || !endMonth) {
    return 0;
  }

  const [startYear, startMonthNumber] = startMonth.split('-').map(Number);
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number);

  return ((endYear - startYear) * 12) + (endMonthNumber - startMonthNumber);
}

function formatCountSummary(counts) {
  return `${counts.active} active / ${counts.userDisabled} disabled / ${counts.unavailable} unavailable`;
}

function formatConstituentStatus(status) {
  if (status === 'userDisabled') {
    return 'Disabled';
  }

  if (status === 'unavailable') {
    return 'Unavailable for this range';
  }

  return 'Active';
}

function getStatusChipSx(status) {
  if (status === 'active') {
    return {
      backgroundColor: '#f6faf7',
      color: '#2f4f3a',
      borderColor: '#c8d9cd',
    };
  }

  if (status === 'userDisabled') {
    return {
      backgroundColor: '#f7f8fa',
      color: '#5f6b7a',
      borderColor: '#d6dce5',
    };
  }

  return {
    backgroundColor: '#faf8f2',
    color: '#6f6240',
    borderColor: '#ddd3b8',
  };
}

export default function SectorCardComponent({ initialCardData }) {
  const [cardData, setCardData] = useState(initialCardData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isConstituentsOpen, setIsConstituentsOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState('preset');
  const [activePreset, setActivePreset] = useState('5Y');
  const [freeRangeStartMonth, setFreeRangeStartMonth] = useState(initialCardData?.startMonth || '');
  const [freeRangeEndMonth, setFreeRangeEndMonth] = useState(initialCardData?.endMonth || '');
  const [presetPanOffsetMonths, setPresetPanOffsetMonths] = useState(0);
  const lastCompletedRangeRef = useRef({
    investmentCategory: initialCardData?.investmentCategory || '',
    startMonth: initialCardData?.startMonth || '',
    endMonth: initialCardData?.endMonth || '',
  });

  useEffect(() => {
    setCardData(initialCardData);
    setError('');
    setFreeRangeStartMonth(initialCardData?.startMonth || '');
    setFreeRangeEndMonth(initialCardData?.endMonth || '');
    setRangeMode('preset');
    setActivePreset(
      getPresetKeyForRange(
        initialCardData?.startMonth || '',
        initialCardData?.endMonth || '',
        initialCardData?.minAvailableMonth || '',
        initialCardData?.maxAvailableMonth || '',
      ) || '5Y',
    );
    setPresetPanOffsetMonths(0);
    lastCompletedRangeRef.current = {
      investmentCategory: initialCardData?.investmentCategory || '',
      startMonth: initialCardData?.startMonth || '',
      endMonth: initialCardData?.endMonth || '',
    };
  }, [initialCardData]);

  const minAvailableMonth = cardData?.minAvailableMonth || '';
  const maxAvailableMonth = cardData?.maxAvailableMonth || '';
  const activePresetConfig = PRESET_BUTTONS.find((preset) => preset.key === activePreset) || null;
  const isPresetWindowMode = rangeMode === 'preset' && Boolean(activePresetConfig?.monthCount);

  const latestPresetRange = useMemo(() => {
    if (!isPresetWindowMode) {
      return {
        startMonth: '',
        endMonth: '',
      };
    }

    const nextRange = buildTrailingRange(
      activePresetConfig.monthCount,
      minAvailableMonth,
      maxAvailableMonth,
    );

    return {
      startMonth: nextRange.startDate,
      endMonth: nextRange.endDate,
    };
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

  useEffect(() => {
    if (!cardData?.investmentCategory || !isRangeValid) {
      return undefined;
    }

    if (
      lastCompletedRangeRef.current.investmentCategory === cardData.investmentCategory
      && lastCompletedRangeRef.current.startMonth === currentStartMonth
      && lastCompletedRangeRef.current.endMonth === currentEndMonth
    ) {
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setError('');

      try {
        const nextCardData = await queryInvestmentCategoryCard(
          {
            investmentCategory: cardData.investmentCategory,
            startMonth: currentStartMonth,
            endMonth: currentEndMonth,
          },
          { signal: controller.signal },
        );

        lastCompletedRangeRef.current = {
          investmentCategory: nextCardData.investmentCategory,
          startMonth: nextCardData.startMonth,
          endMonth: nextCardData.endMonth,
        };
        setCardData(nextCardData);
      } catch (requestError) {
        if (requestError.name === 'CanceledError') {
          return;
        }

        setError(
          requestError.response?.data?.error
            || requestError.response?.data?.message
            || `Unable to load the ${cardData.investmentCategory} card right now.`,
        );
      } finally {
        setIsLoading(false);
      }
    }, 120);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [cardData?.investmentCategory, currentEndMonth, currentStartMonth, isRangeValid]);

  const handlePresetClick = (presetButton) => {
    if (!minAvailableMonth || !maxAvailableMonth) {
      return;
    }

    if (!presetButton.monthCount) {
      setRangeMode('free');
      setActivePreset('MAX');
      setPresetPanOffsetMonths(0);
      setFreeRangeStartMonth(minAvailableMonth);
      setFreeRangeEndMonth(maxAvailableMonth);
      return;
    }

    const trailingRange = buildTrailingRange(
      presetButton.monthCount,
      minAvailableMonth,
      maxAvailableMonth,
    );

    setRangeMode('preset');
    setActivePreset(presetButton.key);
    setPresetPanOffsetMonths(0);
    setFreeRangeStartMonth(trailingRange.startDate);
    setFreeRangeEndMonth(trailingRange.endDate);
  };

  const handleStartDateChange = (nextStartMonth) => {
    setRangeMode('free');
    setActivePreset('');
    setPresetPanOffsetMonths(0);
    setFreeRangeStartMonth(nextStartMonth);
  };

  const handleEndDateChange = (nextEndMonth) => {
    setRangeMode('free');
    setActivePreset('');
    setPresetPanOffsetMonths(0);
    setFreeRangeEndMonth(nextEndMonth);
  };

  const handleToggleConstituent = async (tickerSymbol, nextEnabledState) => {
    setIsLoading(true);
    setError('');

    try {
      const nextCardData = await updateInvestmentCategoryConstituent(
        cardData.investmentCategory,
        tickerSymbol,
        nextEnabledState,
        {
          startMonth: currentStartMonth,
          endMonth: currentEndMonth,
        },
      );

      lastCompletedRangeRef.current = {
        investmentCategory: nextCardData.investmentCategory,
        startMonth: nextCardData.startMonth,
        endMonth: nextCardData.endMonth,
      };
      setCardData(nextCardData);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error
          || requestError.response?.data?.message
          || `Unable to update ${tickerSymbol} right now.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card
      sx={{
        width: '100%',
        maxWidth: { xs: '100%', sm: 640, md: 700, lg: 780, xl: 840 },
        display: 'flex',
        flexDirection: 'column',
        margin: 0,
        borderRadius: 2,
      }}
    >
      <CardContent
        sx={{
          paddingTop: '18px !important',
          paddingBottom: '14px !important',
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
          Investment Category
        </Typography>
        <Typography
          variant="h5"
          component="div"
          sx={{
            marginBottom: '0 !important',
            marginTop: '0 !important',
            lineHeight: 1.18,
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          {cardData?.investmentCategory || 'Investment Category'}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            marginTop: 1,
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {formatCountSummary(cardData?.counts || { active: 0, userDisabled: 0, unavailable: 0 })}
        </Typography>
      </CardContent>

      {error ? (
        <Box sx={{ px: 2, pb: 2 }}>
          <Alert severity="warning">{error}</Alert>
        </Box>
      ) : null}

      <Box sx={{ px: { xs: 2, sm: 2.5, lg: 3 }, pb: 1.5, position: 'relative' }}>
        {isLoading ? (
          <Box
            sx={{
              position: 'absolute',
              top: 12,
              right: 20,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: 'text.secondary',
            }}
          >
            <CircularProgress size={18} />
          </Box>
        ) : null}

        {/* The chart is controlled by the card because the card owns the visible
            range, preset mode, and constituent interactions. */}
        <SectorChart
          series={cardData?.series || []}
          startDate={currentStartMonth}
          endDate={currentEndMonth}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
          minAvailableMonth={minAvailableMonth}
          maxAvailableMonth={maxAvailableMonth}
          activePreset={activePreset}
          onApplyMaxRange={() => handlePresetClick(PRESET_BUTTONS[0])}
          onApplyTrailingRange={(monthCount, presetKey) => {
            const matchingPreset = PRESET_BUTTONS.find((presetButton) => (
              presetButton.monthCount === monthCount && presetButton.key === presetKey
            ));

            if (matchingPreset) {
              handlePresetClick(matchingPreset);
            }
          }}
          disabled={isLoading}
          isPresetWindowMode={isPresetWindowMode}
          maxPresetPanOffset={maxPresetPanOffset}
          presetPanOffsetMonths={clampedPresetPanOffsetMonths}
          onPresetPanOffsetChange={setPresetPanOffsetMonths}
          emptyRangeMessage={cardData?.emptyStateMessage || 'No sector chart data matches the selected month range.'}
        />
      </Box>

      <CardActions
        sx={{
          justifyContent: 'center',
          px: { xs: 2, sm: 2.5, lg: 3 },
          pb: 0.75,
        }}
      >
        <Button
          size="small"
          onClick={() => setIsConstituentsOpen((previousState) => !previousState)}
        >
          {isConstituentsOpen ? 'HIDE CONSTITUENTS' : 'CONSTITUENTS'}
        </Button>
      </CardActions>

      {isConstituentsOpen ? (
        <Box sx={{ px: { xs: 2, sm: 2.5, lg: 3 }, pb: 3 }}>
          <Divider sx={{ mb: 1.5 }} />
          {/* This dedicated scroll region keeps the inline panel usable when a
              category has many constituents on screen at once. */}
          <Box
            data-testid="sector-card-constituents-list"
            sx={{
              maxHeight: { xs: 340, sm: 380, lg: 430 },
              overflowY: 'auto',
              pr: { xs: 0.5, sm: 0.75 },
            }}
          >
            <Stack spacing={{ xs: 1, sm: 1.1, lg: 1.2 }}>
              {(cardData?.constituents || []).map((constituent) => {
                const isDisabledRow = constituent.status === 'userDisabled';

                return (
                  <Box
                    key={constituent.tickerSymbol}
                    data-testid="sector-card-constituent-row"
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      px: { xs: 1.4, sm: 1.65, lg: 1.9 },
                      py: { xs: 1.3, sm: 1.45, lg: 1.55 },
                      backgroundColor: 'background.paper',
                      opacity: isDisabledRow ? 0.9 : 1,
                    }}
                  >
                    {/* A single responsive grid keeps the text, status, and action
                        locked into predictable regions at every breakpoint. */}
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateAreas: {
                          xs: '"identity" "status" "action"',
                          sm: '"identity action" "status action"',
                        },
                        gridTemplateColumns: {
                          xs: 'minmax(0, 1fr)',
                          sm: 'minmax(0, 1fr) 118px',
                          md: 'minmax(0, 1fr) 124px',
                          lg: 'minmax(0, 1fr) 140px',
                        },
                        columnGap: { xs: 0, sm: 1.5, lg: 2 },
                        rowGap: { xs: 0.95, sm: 0.85, lg: 0.95 },
                        alignItems: 'start',
                      }}
                    >
                      <Box
                        data-testid="sector-card-constituent-identity"
                        sx={{
                          gridArea: 'identity',
                          minWidth: 0,
                          textAlign: 'left',
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          sx={{
                            lineHeight: 1.25,
                            letterSpacing: '0.01em',
                            fontWeight: 500,
                          }}
                        >
                          {constituent.tickerSymbol}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            mt: 0.35,
                            wordBreak: 'break-word',
                            lineHeight: 1.45,
                            fontSize: '0.875rem',
                          }}
                        >
                          {constituent.companyName}
                        </Typography>
                      </Box>

                      <Box
                        data-testid="sector-card-constituent-status"
                        sx={{
                          gridArea: 'status',
                          minWidth: 0,
                          justifySelf: 'start',
                        }}
                      >
                        <Chip
                          data-testid="sector-card-constituent-status-chip"
                          label={formatConstituentStatus(constituent.status)}
                          size="small"
                          variant="outlined"
                          sx={{
                            ...getStatusChipSx(constituent.status),
                            maxWidth: '100%',
                            height: 'auto',
                            borderWidth: '1px',
                            fontSize: '0.69rem',
                            fontWeight: 500,
                            borderRadius: 999,
                            '.MuiChip-label': {
                              display: 'block',
                              whiteSpace: 'normal',
                              lineHeight: 1.2,
                              px: 0.95,
                              py: 0.32,
                            },
                          }}
                        />
                      </Box>

                      <Box
                        data-testid="sector-card-constituent-action-region"
                        sx={{
                          gridArea: 'action',
                          alignSelf: { xs: 'stretch', sm: 'start' },
                        }}
                      >
                        <Button
                          size="small"
                          variant="outlined"
                          data-testid="sector-card-constituent-action"
                          fullWidth
                          disabled={isLoading || constituent.isToggleable === false}
                          onClick={() => handleToggleConstituent(
                            constituent.tickerSymbol,
                            !constituent.isEnabled,
                          )}
                          sx={{
                            minHeight: 34,
                            fontWeight: 500,
                            letterSpacing: '0.02em',
                          }}
                        >
                          {constituent.isEnabled ? 'Disable' : 'Enable'}
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        </Box>
      ) : null}
    </Card>
  );
}
