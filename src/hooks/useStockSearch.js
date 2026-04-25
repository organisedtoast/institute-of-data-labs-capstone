import { useContext } from 'react';

import { StockSearchContext } from '../contexts/StockSearchContext.jsx';

export default function useStockSearch() {
  const contextValue = useContext(StockSearchContext);

  if (!contextValue) {
    throw new Error('useStockSearch must be used inside StockSearchProvider.');
  }

  return contextValue;
}
