// How loud the microphone is right now (0..1), so the orb moves with your voice.
// Phones get this from the speech recogniser; browsers don't, so on web we read the mic with the Web Audio API.
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type WebWindow = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

export function useWebMicLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;
    let stop = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stop) return;
        const w = window as unknown as WebWindow;
        const Ctx = w.AudioContext ?? w.webkitAudioContext;
        if (!Ctx) return;
        ctx = new Ctx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        let last = 0;
        const tick = (t: number) => {
          if (stop) return;
          raf = requestAnimationFrame(tick);
          if (t - last < 70) return;
          last = t;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const x = (data[i] - 128) / 128;
            sum += x * x;
          }
          const rms = Math.sqrt(sum / data.length);
          setLevel(Math.min(1, rms * 5.5));
        };
        raf = requestAnimationFrame(tick);
      } catch {
        // No access to the mic level: the orb still animates, just not with the voice
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      setLevel(0);
    };
  }, [active]);
  return level;
}

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
