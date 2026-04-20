import { useContext } from 'react';

import StockSearchContext from '../contexts/stockSearchContext';

export default function useStockSearch() {
  const contextValue = useContext(StockSearchContext);

  if (!contextValue) {
    throw new Error('useStockSearch must be used inside StockSearchProvider.');
  }

  return contextValue;
}
