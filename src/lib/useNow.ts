import { useEffect, useState } from 'react';

/** The current time, refreshed every minute, so "today", "late" and greetings move on by themselves */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(i);
  }, []);
  return now;
}
