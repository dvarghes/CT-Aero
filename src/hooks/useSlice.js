import { useMemo } from 'react';
import { buildSlice } from '../data/slice.js';
import { useOperation } from '../data/OperationContext.jsx';
import { useSlicers } from '../slicers/SlicerContext.jsx';

export function useSlice() {
  const { slicers } = useSlicers();
  const operation = useOperation();
  return useMemo(() => buildSlice(slicers, operation), [slicers, operation]);
}
