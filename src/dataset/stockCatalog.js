// This file contains a small local catalog of stocks that our app knows how to search by name.
// We still validate the final selection with the backend price endpoint before adding a card,
// but this catalog gives us a reliable, beginner-friendly way to support company-name lookup.

export const STOCK_CATALOG = [
  { identifier: 'AAPL', name: 'Apple Inc.' },
  { identifier: 'MSFT', name: 'Microsoft Corporation' },
  { identifier: 'NVDA', name: 'NVIDIA Corporation' },
  { identifier: 'TSLA', name: 'Tesla, Inc.' },
  { identifier: 'GOOG', name: 'Alphabet Inc. Class C' },
  { identifier: 'GOOGL', name: 'Alphabet Inc. Class A' },
  { identifier: 'AMZN', name: 'Amazon.com, Inc.' },
  { identifier: 'META', name: 'Meta Platforms, Inc.' },
  { identifier: 'NFLX', name: 'Netflix, Inc.' },
  { identifier: 'AMD', name: 'Advanced Micro Devices, Inc.' },
  { identifier: 'INTC', name: 'Intel Corporation' },
  { identifier: 'ORCL', name: 'Oracle Corporation' },
  { identifier: 'IBM', name: 'International Business Machines Corporation' },
  { identifier: 'CRM', name: 'Salesforce, Inc.' },
  { identifier: 'ADBE', name: 'Adobe Inc.' },
  { identifier: 'PYPL', name: 'PayPal Holdings, Inc.' },
  { identifier: 'UBER', name: 'Uber Technologies, Inc.' },
  { identifier: 'SHOP', name: 'Shopify Inc.' },
  { identifier: 'BABA', name: 'Alibaba Group Holding Limited' },
  { identifier: 'V', name: 'Visa Inc.' },
  { identifier: 'MA', name: 'Mastercard Incorporated' },
  { identifier: 'JPM', name: 'JPMorgan Chase & Co.' },
  { identifier: 'BAC', name: 'Bank of America Corporation' },
  { identifier: 'WMT', name: 'Walmart Inc.' },
  { identifier: 'COST', name: 'Costco Wholesale Corporation' },
  { identifier: 'DIS', name: 'The Walt Disney Company' },
  { identifier: 'KO', name: 'The Coca-Cola Company' },
  { identifier: 'PEP', name: 'PepsiCo, Inc.' },
  { identifier: 'XOM', name: 'Exxon Mobil Corporation' },
  { identifier: 'CVX', name: 'Chevron Corporation' },
];

// Keeping the default stock identifiers in one place avoids repeating magic strings
// in several files when we seed the first set of cards.
export const DEFAULT_STOCK_IDENTIFIERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];
