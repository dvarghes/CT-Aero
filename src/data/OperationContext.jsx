import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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
  const response = await fetch('/api/operation');
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Operation API returned ${response.status}`);
  }
  return response.json();
}

export function OperationProvider({ children }) {
  const [operation, setOperation] = useState(EMPTY);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const body = await loadOperation();
        if (!cancelled) setOperation({ ...body, status: 'ready', error: '' });
      } catch (error) {
        if (!cancelled) {
          setOperation((current) => ({
            ...current,
            status: 'error',
            error: error.message || 'The operation database is not reachable.',
          }));
        }
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
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    setOperation({ ...payload, status: 'ready', error: '' });
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
