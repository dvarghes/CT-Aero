import { useEffect, useState } from 'react';

export function useNow(intervalMs = 1000) {
  const [value, setValue] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setValue(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return value;
}
