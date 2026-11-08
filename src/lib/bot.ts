// What Ghaith (the character) reacts to across the app: a finished task, saved captures. Screens that show him
// listen; anything can tell him. A plain in-memory emitter: no state is kept.
import { useEffect, useRef } from 'react';

export type BotEvent = { kind: 'done'; title: string } | { kind: 'saved'; count: number };

const listeners = new Set<(e: BotEvent) => void>();

export function botEmit(e: BotEvent) {
  listeners.forEach((l) => l(e));
}

/** Calls `fn` for every event while the screen is mounted (always the latest `fn`) */
export function useBotEvents(fn: (e: BotEvent) => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    const l = (e: BotEvent) => ref.current(e);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}

/** Quiet hours (22:00 to 07:00): Ghaith rests */
export const quietHour = (d = new Date()) => d.getHours() >= 22 || d.getHours() < 7;
