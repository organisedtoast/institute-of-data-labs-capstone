// This file now contains helper functions instead of hard-coded sample data.
// The goal is to keep data formatting logic in one place so our components stay easier to read.

// A month string in this project always uses the format YYYY-MM.
// Example: "2024-06"
// This format is helpful because alphabetical string comparison and date order match.
// That means "2024-01" is naturally less than "2024-12", which keeps our filtering logic beginner-friendly.
const MONTH_STRING_PATTERN = /^\d{4}-\d{2}$/;

// Check whether a value already matches our expected month format.
// We use this before comparing or converting month strings so invalid values do not break the app.
export const isValidMonthString = (monthString) => {
  return typeof monthString === 'string' && MONTH_STRING_PATTERN.test(monthString);
};

// Convert a full date such as "2024-06-30" into the shorter month format "2024-06".
// If the value is already a month string, we keep it as-is.
export const getMonthStringFromDate = (dateValue) => {
  if (typeof dateValue !== 'string') {
    return '';
  }

  const trimmedDateValue = dateValue.trim();

  if (isValidMonthString(trimmedDateValue)) {
    return trimmedDateValue;
  }

  if (trimmedDateValue.length < 7) {
    return '';
  }

  const monthString = trimmedDateValue.slice(0, 7);

  return isValidMonthString(monthString) ? monthString : '';
};

// Compare two month strings safely.
// Because YYYY-MM sorts naturally, a simple string comparison is enough once we know both values are valid.
// The function returns:
// -1 when monthA is earlier
//  0 when both months are the same or invalid
//  1 when monthA is later
export const compareMonthStrings = (monthA, monthB) => {
  if (!isValidMonthString(monthA) || !isValidMonthString(monthB)) {
    return 0;
  }

  if (monthA === monthB) {
    return 0;
  }

  return monthA < monthB ? -1 : 1;
};

// Convert a JavaScript Date into the YYYY-MM format used throughout the chart controls.
// By storing months in one consistent string format, the hook and UI can share the same values.
export const getCurrentMonthString = (dateValue = new Date()) => {
  const year = dateValue.getFullYear();
  const month = dateValue.getMonth() + 1;

  return `${year}-${String(month).padStart(2, '0')}`;
};

// Move a month string backward or forward by a certain number of months.
// Example: shifting "2026-03" by -1 gives "2026-02".
// This is the core helper used by trailing presets like 6M, 1Y, and 5Y.
export const shiftMonthString = (monthString, monthsToShift = 0) => {
  if (!isValidMonthString(monthString)) {
    return '';
  }

  const [yearText, monthText] = monthString.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (Number.isNaN(year) || Number.isNaN(month)) {
    return '';
  }

  const shiftedDate = new Date(Date.UTC(year, month - 1 + monthsToShift, 1));
  const shiftedYear = shiftedDate.getUTCFullYear();
  const shiftedMonth = shiftedDate.getUTCMonth() + 1;

  return `${shiftedYear}-${String(shiftedMonth).padStart(2, '0')}`;
};

// Clamp a month string so it stays inside a known available range.
// If the requested month is earlier than the earliest available month, we use the earliest one instead.
// If it is later than the latest available month, we use the latest one instead.
export const clampMonthString = (
  monthString,
  minAvailableMonth = '',
  maxAvailableMonth = '',
) => {
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
};

// Find the earliest and latest months present in a dataset.
// We use this to set the default date inputs so each chart begins by showing all available data.
export const getMonthBoundsFromData = (dataRows = []) => {
  if (!Array.isArray(dataRows) || dataRows.length === 0) {
    return {
      earliestMonth: '',
      latestMonth: '',
    };
  }

  let earliestMonth = '';
  let latestMonth = '';

  dataRows.forEach((dataRow) => {
    const monthString = getMonthStringFromDate(dataRow?.date);

    if (!monthString) {
      return;
    }

    if (!earliestMonth || compareMonthStrings(monthString, earliestMonth) < 0) {
      earliestMonth = monthString;
    }

    if (!latestMonth || compareMonthStrings(monthString, latestMonth) > 0) {
      latestMonth = monthString;
    }
  });

  return {
    earliestMonth,
    latestMonth,
  };
};

// Build a trailing month range such as 6M or 5Y.
// The end date begins from a target month, then both ends are clamped into the dataset's real bounds.
// We subtract `monthCount` so a 1-month preset keeps 2 months (e.g., Feb to Mar), a 6-month preset keeps 7 months, and so on.
export const getTrailingMonthRange = ({
  monthCount = 1,
  targetEndMonth = getCurrentMonthString(),
  minAvailableMonth = '',
  maxAvailableMonth = '',
}) => {
  if (!isValidMonthString(minAvailableMonth) || !isValidMonthString(maxAvailableMonth)) {
    return {
      startDate: '',
      endDate: '',
    };
  }

  const safeMonthCount = Math.max(1, Number(monthCount) || 1);
  const endDate = clampMonthString(targetEndMonth, minAvailableMonth, maxAvailableMonth);

  if (!endDate) {
    return {
      startDate: '',
      endDate: '',
    };
  }

  const proposedStartDate = shiftMonthString(endDate, -safeMonthCount);
  const startDate = clampMonthString(proposedStartDate, minAvailableMonth, maxAvailableMonth);

  return {
    startDate,
    endDate,
  };
};

// Filter a dataset so only rows inside the selected month range remain.
// The range is inclusive, which means the selected start and end months are both kept.
// If the user has not selected both dates yet, we return the original data unchanged.
export const filterDataByMonthRange = (dataRows = [], startDate = '', endDate = '') => {
  if (!Array.isArray(dataRows)) {
    return [];
  }

  if (!isValidMonthString(startDate) || !isValidMonthString(endDate)) {
    return dataRows;
  }

  if (compareMonthStrings(startDate, endDate) > 0) {
    return [];
  }

  return dataRows.filter((dataRow) => {
    const monthString = getMonthStringFromDate(dataRow?.date);

    if (!monthString) {
      return false;
    }

    return (
      compareMonthStrings(monthString, startDate) >= 0 &&
      compareMonthStrings(monthString, endDate) <= 0
    );
  });
};

// Convert a month string into the first calendar day of that month.
// Example: "2024-06" becomes "2024-06-01".
// The backend uses this when it forwards date filters to the external stock API.
export const convertMonthStringToApiStartDate = (monthString) => {
  if (!isValidMonthString(monthString)) {
    return '';
  }

  return `${monthString}-01`;
};

// Convert a month string into the final calendar day of that month.
// We create a JavaScript Date for "day 0" of the next month, which gives us the last day of the current month.
// Example: "2024-02" becomes "2024-02-29" in a leap year.
export const convertMonthStringToApiEndDate = (monthString) => {
  if (!isValidMonthString(monthString)) {
    return '';
  }

  const [yearText, monthText] = monthString.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (Number.isNaN(year) || Number.isNaN(month)) {
    return '';
  }

  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return `${monthString}-${String(lastDayOfMonth).padStart(2, '0')}`;
};

// Convert daily stock-price rows into monthly chart points.
// ROIC returns one row per trading day, but our chart only needs one point per month.
// To keep the chart intuitive, we store the LAST available closing price we see for each month.
export const convertDailyPricesToMonthlyPrices = (dailyPrices = []) => {
  // Guard against invalid input so the rest of the app does not crash.
  if (!Array.isArray(dailyPrices)) {
    return [];
  }

  // A Map is useful here because it lets us store one entry per month.
  // The key will be a string like "2024-01" and the value will be the chart point for that month.
  const monthlyPriceMap = new Map();

  // Loop through every daily price row from the API.
  dailyPrices.forEach((priceRow) => {
    // Skip rows that do not have the minimum data our chart needs.
    if (!priceRow?.date || typeof priceRow.close !== 'number') {
      return;
    }

    // Slice the date so "2024-01-31" becomes "2024-01".
    // That gives us one grouping key per month.
    const monthKey = priceRow.date.slice(0, 7);

    // Because the data is requested in ascending order, each new row for the same month
    // naturally replaces the previous one. That means the final stored row is the last
    // available trading day for that month.
    monthlyPriceMap.set(monthKey, {
      date: priceRow.date,
      close: priceRow.close,
    });
  });

  // Convert the Map values back into a plain array so the chart component can use them.
  return Array.from(monthlyPriceMap.values());
};

// Format date labels on the chart x-axis into a beginner-friendly format.
// Example: "2024-01-31" becomes "Jan 2024".
export const dateAxisFormatter = (date) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
};

// Format stock prices to always show two decimal places.
// Example: 123.4 becomes "123.40".
export const priceFormatter = (value) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
