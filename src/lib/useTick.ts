import { useEffect, useState } from 'react';

/** The current time, refreshed every `ms` while `active` (for timers and gentle animations) */
export function useTick(ms: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(i);
  }, [ms, active]);
  return now;
}
