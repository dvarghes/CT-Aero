import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DEFAULT_SLICERS,
  FLEETS,
  SLICER_STATUSES,
  STORAGE_KEY,
  initialSlicers,
  slicersToParams,
  toggleMulti,
} from './model.js';

const SlicerContext = createContext(null);

export function SlicerProvider({ children }) {
  const [params, setParams] = useSearchParams();
  const [slicers, setSlicers] = useState(() => initialSlicers(params));

  const commit = useCallback((updater) => {
    setSlicers((current) => (typeof updater === 'function' ? updater(current) : updater));
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slicers));
    const desired = slicersToParams(slicers);
    const current = new URLSearchParams(window.location.search);
    const keys = ['station', 'window', 'fleet', 'shift', 'status'];
    const differs = keys.some((key) => (desired.get(key) ?? '') !== (current.get(key) ?? ''));
    if (differs) setParams(desired, { replace: true });
  }, [slicers, setParams]);

  const api = useMemo(() => ({
    slicers,
    setStation(station) {
      commit((current) => ({ ...current, station }));
    },
    setWindow(windowId) {
      commit((current) => ({ ...current, window: windowId }));
    },
    setShift(shift) {
      commit((current) => ({ ...current, shift }));
    },
    toggleFleet(value) {
      commit((current) => ({
        ...current,
        fleet: value === 'all' ? [] : toggleMulti(current.fleet, value, FLEETS),
      }));
    },
    toggleStatus(value) {
      commit((current) => ({
        ...current,
        status: value === 'all' ? [] : toggleMulti(current.status, value, SLICER_STATUSES),
      }));
    },
    clear(id) {
      commit((current) => ({
        ...current,
        [id]: id === 'fleet' || id === 'status' ? [] : DEFAULT_SLICERS[id],
      }));
    },
    reset() {
      commit(() => ({
        station: DEFAULT_SLICERS.station,
        window: DEFAULT_SLICERS.window,
        fleet: [],
        shift: DEFAULT_SLICERS.shift,
        status: [],
      }));
    },
  }), [slicers, commit]);

  return <SlicerContext.Provider value={api}>{children}</SlicerContext.Provider>;
}

export function useSlicers() {
  const value = useContext(SlicerContext);
  if (!value) throw new Error('useSlicers must be used inside SlicerProvider');
  return value;
}

export function useSlicerHref() {
  const { slicers } = useSlicers();
  const search = slicersToParams(slicers).toString();
  return (pathname) => (search ? `${pathname}?${search}` : pathname);
}

export function useAppNavigate() {
  const navigate = useNavigate();
  const href = useSlicerHref();
  return useCallback((pathname) => {
    const target = href(pathname);
    const [path, search = ''] = target.split('?');
    navigate({ pathname: path, search });
  }, [navigate, href]);
}
