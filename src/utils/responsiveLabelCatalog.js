export const SECTION_SHORT_LABELS = {
  BASE: 'BASE',
  'Balance Sheet': 'BS',
  'Income Statement': 'IS',
  'Owner Earnings Bridge': 'OWNR ERNGS',
  'Shares & Market Cap': 'SHS/MKT',
  'EBIT Forecast': 'FORECASTS',
  'Valuation Multiples': 'VAL',
  'Growth & Forecasts': 'GWTH',
  'Analyst Revisions': 'RVSNS',
  'EPS & Dividends': 'EPS/DPS',
};

const EXACT_SHORT_LABELS = {
  'FY end date': 'FY END',
  'Fiscal year': 'FY',
  'FY release date': 'FY release',
  'Share price': 'SP',
  'Shares on issue': 'SOI',
  'Market cap': 'Mkt Cap',
  Cash: 'Cash',
  'Non-cash investments': 'Non-cash Inv',
  Debt: 'Debt',
  'Net debt / (cash)': 'ND/(NC)',
  'Net debt to EBITDA': 'ND/EBITDA',
  'EBIT interest coverage': 'Int Cov',
  Assets: 'Assets',
  Liabilities: 'Liabs',
  Equity: 'Equity',
  'Leverage Ratio': 'Lev Rto',
  Revenue: 'Rev',
  'Gross profit': 'GP',
  CODB: 'CODB',
  EBITDA: 'EBITDA',
  'Depreciation & amortization': 'DA',
  EBIT: 'EBIT',
  'Net interest expense': 'Int',
  NPBT: 'NPBT',
  'Income tax expense': 'Tax',
  NPAT: 'NPAT',
  'Capital expenditures': 'Cpx',
  FCF: 'FCF',
  'Deemed Maintenance Capex': 'Mt Cpx',
  'Owner earnings': 'Ownr Erngs',
  'Change in shares': 'Delta SOI',
  'Tangible Book Value per share': 'TBVPS',
  'Price to NTA': 'P/NTA',
  'Dividend payout': 'Payout',
};

export function getShortSectionLabel(section) {
  return SECTION_SHORT_LABELS[section] || section;
}

export function getShortLabel(label) {
  if (EXACT_SHORT_LABELS[label]) {
    return EXACT_SHORT_LABELS[label];
  }

  let match = label.match(/^Shares on issue forecast (FY\+\d)$/);
  if (match) {
    return `SOI ${match[1]}`;
  }

  match = label.match(/^Enterprise value (FY\+\d)$/);
  if (match) {
    return `EV ${match[1]}`;
  }

  match = label.match(/^Enterprise value \((trailing)\)$/i);
  if (match) {
    return 'EV Tr';
  }

  match = label.match(/^Market cap (FY\+\d)$/);
  if (match) {
    return `Mkt Cap ${match[1]}`;
  }

  match = label.match(/^EV\/Sales (trailing|FY\+\d)$/);
  if (match) {
    return match[1] === 'trailing' ? 'EV/S Tr' : `EV/S ${match[1]}`;
  }

  match = label.match(/^(EBITDA|EBIT|NPAT) margin \((trailing)\)$/i);
  if (match) {
    return `${match[1]} Mgn Tr`;
  }

  match = label.match(/^(EBITDA|EBIT|NPAT) margin (FY\+\d)$/i);
  if (match) {
    return `${match[1]} Mgn ${match[2]}`;
  }

  match = label.match(/^EV\/EBIT (trailing|FY\+\d)$/i);
  if (match) {
    return match[1] === 'trailing' ? 'EV/EBIT Tr' : `EV/EBIT ${match[1]}`;
  }

  match = label.match(/^PE (trailing|FY\+\d)$/i);
  if (match) {
    return match[1] === 'trailing' ? 'PE Tr' : `PE ${match[1]}`;
  }

  match = label.match(/^(Revenue|EPS) forecast CAGR (\dY)$/i);
  if (match) {
    const metricShort = match[1] === 'Revenue' ? 'Rev' : 'EPS';
    return `${metricShort} Fcst CAGR ${match[2]}`;
  }

  match = label.match(/^(Revenue|EBIT|EPS) (FY\+\d) revisions last (\dM)$/i);
  if (match) {
    const metricShort = match[1] === 'Revenue' ? 'Rev' : match[1];
    return `${metricShort} ${match[2]} Rvsns ${match[3]}`;
  }

  match = label.match(/^(EPS|DY|DPS) \((trailing)\)$/i);
  if (match) {
    return `${match[1]} Tr`;
  }

  return label;
}

export function getResponsiveLabelMetadata({ label, section }) {
  return {
    shortLabel: getShortLabel(label),
    shortSection: getShortSectionLabel(section),
  };
}
