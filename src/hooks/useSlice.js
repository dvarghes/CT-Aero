import { useMemo } from 'react';
import { buildSlice } from '../data/slice.js';
import { useSlicers } from '../slicers/SlicerContext.jsx';

export function useSlice() {
  const { slicers } = useSlicers();
  return useMemo(() => buildSlice(slicers), [slicers]);
}
