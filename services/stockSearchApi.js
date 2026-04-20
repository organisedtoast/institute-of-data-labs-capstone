import axios from 'axios';

export async function searchStocks(query) {
  const response = await axios.get('/api/stocks/search', {
    params: {
      q: query,
    },
  });

  return response.data;
}

export async function fetchStockPrices(identifier) {
  const response = await axios.get(`/api/stock-prices/${identifier}`);
  return response.data;
}
