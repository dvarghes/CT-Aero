import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { applySampleWrite, buildSampleOperation } from './sampleOperation.js';

const OperationContext = createContext(null);
const EMPTY = {
  status: 'loading',
  error: '',
  now: null,
  sync: { me: null, flightOps: null, hr: null },
  turnarounds: [],
  alerts: [],
  people: [],
  shifts: [],
  tasksByVisit: {},
  plans: {},
};

async function loadOperation() {
  const response = await fetch('/api/operation', { headers: { Accept: 'application/json' } });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('application/json')) {
    throw new Error('The operation database is not reachable.');
  }
  return response.json();
}

function sampleOperation() {
  return { ...buildSampleOperation(), status: 'ready', error: '' };
}

export function OperationProvider({ children }) {
  const [operation, setOperation] = useState(EMPTY);
  const operationRef = useRef(operation);
  operationRef.current = operation;

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const body = await loadOperation();
        if (!cancelled) setOperation({ ...body, status: 'ready', mode: 'live', error: '' });
      } catch (error) {
        if (cancelled) return;
        setOperation((current) => {
          if (current.mode === 'sample') return current;
          if (current.mode === 'live') {
            return {
              ...current,
              status: 'error',
              error: error.message || 'The operation database is not reachable.',
            };
          }
          return sampleOperation();
        });
      }
    }
    pull();
    const timer = setInterval(pull, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const mutate = useCallback(async (path, body) => {
    if (operationRef.current.mode === 'sample') {
      const next = { ...applySampleWrite(operationRef.current, path, body), status: 'ready', error: '' };
      setOperation(next);
      return next;
    }
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    setOperation({ ...payload, status: 'ready', mode: 'live', error: '' });
    return payload;
  }, []);

  const value = useMemo(() => ({ ...operation, mutate }), [operation, mutate]);
  return <OperationContext.Provider value={value}>{children}</OperationContext.Provider>;
}

export function useOperation() {
  const value = useContext(OperationContext);
  if (!value) throw new Error('useOperation must be used inside OperationProvider');
  return value;
}

export function savePlan(payload) {
  return fetch('/api/operation', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
