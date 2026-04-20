import { useCallback, useMemo, useReducer } from 'react';

import {
  getCurrentMonthString,
  compareMonthStrings,
  getTrailingMonthRange,
  getMonthBoundsFromData,
} from '../dataset/SharePrice';

// This object contains the starting values for the reducer-managed state.
// A reducer often uses one object like this because related values belong together.
// As an app grows, grouping connected state in one place can make updates easier to follow.
const initialState = {
  startDate: '',
  endDate: '',
  minAvailableMonth: '',
  maxAvailableMonth: '',
  activePreset: '',
};

// The reducer receives the current state and an action object.
// Its job is to return the next state after deciding how that action should change the data.
// This pattern becomes especially helpful when several state values must change together.
function chartDateRangeReducer(state, action) {
  switch (action.type) {
    case 'APPLY_RANGE':
      // Use this action when we already know the exact range we want.
      // It updates the selected start and end months at the same time
      // and also records which preset button should appear active.
      return {
        ...state,
        startDate: action.payload.startDate,
        endDate: action.payload.endDate,
        activePreset: action.payload.activePreset,
      };

    case 'SET_AVAILABLE_RANGE':
      // Store the earliest and latest months available in the dataset.
      // These values are used to clamp presets and control input limits.
      return {
        ...state,
        minAvailableMonth: action.payload.minAvailableMonth,
        maxAvailableMonth: action.payload.maxAvailableMonth,
      };

    case 'INITIALIZE_FROM_DATA':
      // This action sets everything needed after we inspect a dataset:
      // the available bounds, the default selected range, and the active preset.
      return {
        ...state,
        minAvailableMonth: action.payload.minAvailableMonth,
        maxAvailableMonth: action.payload.maxAvailableMonth,
        startDate: action.payload.startDate,
        endDate: action.payload.endDate,
        activePreset: action.payload.activePreset,
      };

    case 'SET_START_DATE':
      // Manual edits should clear the preset highlight because the user
      // is now choosing a custom range instead of a saved preset button.
      return {
        ...state,
        startDate: action.payload,
        activePreset: '',
      };

    case 'SET_END_DATE':
      // This matches the behaviour of SET_START_DATE, but for the ending month.
      return {
        ...state,
        endDate: action.payload,
        activePreset: '',
      };

    case 'APPLY_MAX_RANGE':
      // The Max action restores the full available month range and highlights the Max button.
      return {
        ...state,
        startDate: state.minAvailableMonth,
        endDate: state.maxAvailableMonth,
        activePreset: 'MAX',
      };

    default:
      // Always return the current state for unknown actions.
      // This keeps the reducer safe if an unexpected action type appears.
      return state;
  }
}

// This custom hook keeps all month-range state in one reusable place.
// Any chart can use it to remember:
// - the currently selected start month
// - the currently selected end month
// - the earliest month available in the dataset
// - the latest month available in the dataset
//
// This file uses a single useReducer call instead of several separate useState calls.
// The visible app behaviour stays exactly the same, but the internal state updates
// are now grouped into named actions, which can be easier to maintain in larger apps.
export default function useChartDateRange() {
  const [state, dispatch] = useReducer(chartDateRangeReducer, initialState);

  const {
    startDate,
    endDate,
    minAvailableMonth,
    maxAvailableMonth,
    activePreset,
  } = state;

  // Store one shared helper for applying a fully computed range.
  // This keeps our preset actions and initialisation logic consistent.
  // Notice that the reducer changes state, but this helper still prepares the action
  // and sends it through dispatch for the reducer to handle.
  const applyRange = useCallback((nextStartDate, nextEndDate, presetKey = '') => {
    dispatch({
      type: 'APPLY_RANGE',
      payload: {
        startDate: nextStartDate,
        endDate: nextEndDate,
        activePreset: presetKey,
      },
    });
  }, []);

  // This helper reads a dataset and stores the full month range available in it.
  // Instead of defaulting to the full range, we default to a trailing 5-year window.
  // If the dataset has less than five years available, the helper automatically clamps
  // the start month to the earliest available month.
  const initializeRangeFromData = useCallback((dataRows = []) => {
    const { earliestMonth, latestMonth } = getMonthBoundsFromData(dataRows);

    if (!earliestMonth || !latestMonth) {
      dispatch({
        type: 'INITIALIZE_FROM_DATA',
        payload: {
          minAvailableMonth: earliestMonth,
          maxAvailableMonth: latestMonth,
          startDate: '',
          endDate: '',
          activePreset: '',
        },
      });
      return;
    }

    const defaultRange = getTrailingMonthRange({
      monthCount: 60,
      targetEndMonth: getCurrentMonthString(),
      minAvailableMonth: earliestMonth,
      maxAvailableMonth: latestMonth,
    });

    dispatch({
      type: 'INITIALIZE_FROM_DATA',
      payload: {
        minAvailableMonth: earliestMonth,
        maxAvailableMonth: latestMonth,
        startDate: defaultRange.startDate,
        endDate: defaultRange.endDate,
        activePreset: '5Y',
      },
    });
  }, []);

  // Apply the "Max" preset by restoring the entire available month span for the chart.
  const applyMaxRange = useCallback(() => {
    if (!minAvailableMonth || !maxAvailableMonth) {
      return;
    }

    dispatch({ type: 'APPLY_MAX_RANGE' });
  }, [maxAvailableMonth, minAvailableMonth]);

  // Apply a trailing preset like 1M, 6M, 1Y, or 5Y.
  // The end month is based on today's month first, then clamped back to the latest data we actually have.
  const applyTrailingRange = useCallback((monthCount, presetKey) => {
    if (!minAvailableMonth || !maxAvailableMonth) {
      return;
    }

    const trailingRange = getTrailingMonthRange({
      monthCount,
      targetEndMonth: getCurrentMonthString(),
      minAvailableMonth,
      maxAvailableMonth,
    });

    applyRange(trailingRange.startDate, trailingRange.endDate, presetKey);
  }, [applyRange, maxAvailableMonth, minAvailableMonth]);

  // Manual changes should clear the active preset highlight because the user is no longer
  // looking at one of the standard saved ranges.
  const setStartDate = useCallback((nextStartDate) => {
    dispatch({
      type: 'SET_START_DATE',
      payload: nextStartDate,
    });
  }, []);

  const setEndDate = useCallback((nextEndDate) => {
    dispatch({
      type: 'SET_END_DATE',
      payload: nextEndDate,
    });
  }, []);

  // Resetting the selection back to the full available range is useful when the user
  // wants to undo their custom filters without reloading the page.
  // This still behaves exactly the same as before by calling the Max logic.
  const resetToAvailableRange = useCallback(() => {
    applyMaxRange();
  }, [applyMaxRange]);

  // These values are still derived from state rather than stored separately.
  // A reducer helps organize state transitions, but it does not replace the idea
  // of derived values that can be calculated from the current state.

  // This derived value tells components whether both dates are in a valid order.
  // We only treat the range as invalid when both dates exist and the start comes after the end.
  const isRangeValid = useMemo(() => {
    if (!startDate || !endDate) {
      return true;
    }

    return compareMonthStrings(startDate, endDate) <= 0;
  }, [endDate, startDate]);

  const hasAvailableRange = useMemo(() => {
    return Boolean(minAvailableMonth && maxAvailableMonth);
  }, [maxAvailableMonth, minAvailableMonth]);

  return {
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    minAvailableMonth,
    maxAvailableMonth,
    hasAvailableRange,
    isRangeValid,
    activePreset,
    initializeRangeFromData,
    applyMaxRange,
    applyTrailingRange,
    resetToAvailableRange,
  };
}
