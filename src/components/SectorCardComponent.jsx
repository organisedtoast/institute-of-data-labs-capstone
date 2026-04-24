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
  getTrailingMonthRange,
  shiftMonthString,
} from '../dataset/SharePrice';
import {
  queryInvestmentCategoryCard,
  updateInvestmentCategoryConstituent,
} from '../services/investmentCategoryCardsApi';
import SectorChart from './SectorChart';
import { enhancedInternalScrollbarSx } from './sharedScrollbarStyles.js';

const PRESET_BUTTONS = [
  { key: 'MAX', label: 'Max', monthCount: null },
  { key: '1M', label: '1M', monthCount: 1 },
  { key: '6M', label: '6M', monthCount: 6 },
  { key: '1Y', label: '1Y', monthCount: 12 },
  { key: '3Y', label: '3Y', monthCount: 36 },
  { key: '5Y', label: '5Y', monthCount: 60 },
  { key: '10Y', label: '10Y', monthCount: 120 },
];
const CONSTITUENT_ACTION_MIN_WIDTH_PX = 92;

function buildTrailingRange(monthCount, minAvailableMonth, maxAvailableMonth) {
  return getTrailingMonthRange({
    monthCount,
    targetEndMonth: maxAvailableMonth,
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
    const nextMinAvailableMonth = initialCardData?.minAvailableMonth || '';
    const nextMaxAvailableMonth = initialCardData?.maxAvailableMonth || '';
    const latestDefaultRange = buildTrailingRange(
      60,
      nextMinAvailableMonth,
      nextMaxAvailableMonth,
    );
    const nextStartMonth = latestDefaultRange.startDate || initialCardData?.startMonth || '';
    const nextEndMonth = latestDefaultRange.endDate || initialCardData?.endMonth || '';

    setCardData(initialCardData);
    setError('');
    setFreeRangeStartMonth(nextStartMonth);
    setFreeRangeEndMonth(nextEndMonth);
    setRangeMode('preset');
    setActivePreset(nextStartMonth && nextEndMonth ? '5Y' : '');
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
  const canonicalInitialRangeStartMonth = cardData?.startMonth || '';
  const canonicalInitialRangeEndMonth = cardData?.endMonth || '';
  const hasCanonicalInitialRange = cardData?.isCanonicalInitialRange === true;
  const investmentCategory = cardData?.investmentCategory || '';

  useEffect(() => {
    // The backend now gives the card the correct first range, so this effect
    // only fetches after the page moves away from that starting payload. This
    // ref remembers the last finished request as bookkeeping, not user-visible state.
    if (!investmentCategory || !isRangeValid) {
      return undefined;
    }

    if (
      hasCanonicalInitialRange
      && currentStartMonth === canonicalInitialRangeStartMonth
      && currentEndMonth === canonicalInitialRangeEndMonth
    ) {
      lastCompletedRangeRef.current = {
        investmentCategory,
        startMonth: currentStartMonth,
        endMonth: currentEndMonth,
      };
      return undefined;
    }

    if (
      lastCompletedRangeRef.current.investmentCategory === investmentCategory
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
            investmentCategory,
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
            || `Unable to load the ${investmentCategory} card right now.`,
        );
      } finally {
        setIsLoading(false);
      }
    }, 120);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    canonicalInitialRangeEndMonth,
    canonicalInitialRangeStartMonth,
    currentEndMonth,
    currentStartMonth,
    hasCanonicalInitialRange,
    investmentCategory,
    isRangeValid,
  ]);

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
            data-scrollbar-style="enhanced"
            sx={{
              maxHeight: { xs: 340, sm: 380, lg: 430 },
              overflowY: 'auto',
              pr: { xs: 0.5, sm: 0.75 },
              ...enhancedInternalScrollbarSx,
            }}
          >
            <Stack spacing={{ xs: 0.75, sm: 0.85, lg: 0.95 }}>
              {(cardData?.constituents || []).map((constituent) => {
                const isDisabledRow = constituent.status === 'userDisabled';

                return (
                  <Box
                    key={constituent.tickerSymbol}
                    data-testid="sector-card-constituent-row"
                    data-compact-layout="true"
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1.5,
                      px: { xs: 1.1, sm: 1.25, lg: 1.4 },
                      py: { xs: 0.95, sm: 1.05, lg: 1.15 },
                      backgroundColor: 'background.paper',
                      opacity: isDisabledRow ? 0.9 : 1,
                    }}
                  >
                    {/* The old constituents layout reserved a lot of vertical and
                        horizontal space for the status and action areas. This
                        tighter flex layout keeps the same three logical regions
                        while allowing the row to stay compact on all screen sizes. */}
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        columnGap: { xs: 0.75, sm: 1, lg: 1.15 },
                        rowGap: { xs: 0.65, sm: 0.75, lg: 0.8 },
                      }}
                    >
                      <Box
                        data-testid="sector-card-constituent-identity"
                        sx={{
                          flex: '1 1 220px',
                          minWidth: 0,
                          textAlign: 'left',
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          sx={{
                            lineHeight: 1.15,
                            letterSpacing: '0.01em',
                            fontWeight: 600,
                          }}
                        >
                          {constituent.tickerSymbol}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            mt: 0.15,
                            lineHeight: 1.28,
                            fontSize: { xs: '0.81rem', sm: '0.84rem' },
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            wordBreak: 'break-word',
                          }}
                        >
                          {constituent.companyName}
                        </Typography>
                      </Box>

                      <Box
                        data-testid="sector-card-constituent-controls"
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: { xs: 'space-between', sm: 'flex-end' },
                          gap: { xs: 0.65, sm: 0.75, lg: 0.9 },
                          width: { xs: '100%', sm: 'auto' },
                          flex: { xs: '1 1 100%', sm: '0 1 auto' },
                        }}
                      >
                        <Box
                          data-testid="sector-card-constituent-status"
                          sx={{
                            minWidth: 0,
                            flex: '0 1 auto',
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
                              fontSize: '0.67rem',
                              fontWeight: 500,
                              borderRadius: 999,
                              '.MuiChip-label': {
                                display: 'block',
                                whiteSpace: 'normal',
                                lineHeight: 1.15,
                                px: 0.85,
                                py: 0.24,
                              },
                            }}
                          />
                        </Box>

                        <Box
                          data-testid="sector-card-constituent-action-region"
                          sx={{
                            flex: '0 0 auto',
                          }}
                        >
                          <Button
                            size="small"
                            variant="outlined"
                            data-testid="sector-card-constituent-action"
                            disabled={isLoading || constituent.isToggleable === false}
                            onClick={() => handleToggleConstituent(
                              constituent.tickerSymbol,
                              !constituent.isEnabled,
                            )}
                            sx={{
                              minHeight: 28,
                              minWidth: `${CONSTITUENT_ACTION_MIN_WIDTH_PX}px`,
                              px: 1.1,
                              py: 0.15,
                              fontWeight: 500,
                              letterSpacing: '0.01em',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {constituent.isEnabled ? 'Disable' : 'Enable'}
                          </Button>
                        </Box>
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
