// A speech-like level (0..1) for the orb while غيث talks. (While you talk, the level comes from the recogniser.)
import { useEffect, useState } from 'react';

/** A lively, speech-like level while غيث is talking */
export function useSpeakingLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) return;
    let t = 0;
    const i = setInterval(() => {
      t += 1;
      const syllable = Math.abs(Math.sin(t * 0.9)) * 0.55 + Math.random() * 0.35;
      setLevel(t % 9 === 0 ? 0.1 : syllable);
    }, 110);
    return () => {
      clearInterval(i);
      setLevel(0);
    };
  }, [active]);
  return active ? level : 0;
}
