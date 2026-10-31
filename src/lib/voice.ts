// One-shot dictation: the person talks for as long as they like (several tasks in one go) and taps "done".
// Speech to text runs on the phone's speech service (or the browser's on web). No audio is recorded or stored;
// only the final text is sent to غيث.
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type DictationState = 'idle' | 'listening' | 'unsupported';

const ERRORS: Record<string, string> = {
  'not-allowed': 'لازم تسمح لغيث يستخدم المايك من إعدادات الجهاز.',
  'service-not-allowed': 'خدمة تحويل الصوت مش مفعّلة على هالجهاز.',
  network: 'تحويل الصوت بده إنترنت، تأكد من الشبكة.',
  'audio-capture': 'ما قدرت أوصل للمايك.',
  'language-not-supported': 'العربي مش مثبّت بخدمة الصوت على الجهاز.',
};

function available(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b).replace(/\s+/g, ' ').trim();

/**
 * `start()` listens until `finish()`; pauses don't end it (the speech service is restarted quietly when it stops on
 * its own). `text` is everything heard so far; `finish()` resolves with the full text.
 */
export function useDictation() {
  const [state, setState] = useState<DictationState>(() => (available() ? 'idle' : 'unsupported'));
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const committed = useRef(''); // finished segments
  const interim = useRef(''); // the segment being spoken
  const wanted = useRef(false); // the person hasn't tapped "done" yet
  const restarts = useRef(0);
  const waiter = useRef<((t: string) => void) | null>(null);

  const full = () => join(committed.current, interim.current);

  const begin = useCallback(() => {
    ExpoSpeechRecognitionModule.start({
      lang: 'ar-AE',
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      contextualStrings: ['غيث', 'ذكرني', 'إيميل', 'المدير', 'اجتماع', 'تقرير'],
      volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
      androidIntentOptions: {
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 6000,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 6000,
      },
      iosTaskHint: 'dictation',
    });
    setState('listening');
  }, []);

  const deliver = useCallback(() => {
    const w = waiter.current;
    waiter.current = null;
    if (!w) return;
    const t = full();
    w(t);
  }, []);

  useSpeechRecognitionEvent('start', () => setState('listening'));
  useSpeechRecognitionEvent('result', (e) => {
    const t = (e.results[0]?.transcript ?? '').trim();
    if (!t) return;
    if (e.isFinal) {
      // Some services repeat the whole session in each final result, others send only the new segment
      const c = committed.current;
      committed.current = c && t.startsWith(c) ? t : join(c, t);
      interim.current = '';
    } else {
      interim.current = committed.current && t.startsWith(committed.current) ? t.slice(committed.current.length).trim() : t;
    }
    setText(full());
    if (Platform.OS === 'web') setLevel(0.45 + Math.random() * 0.5);
  });
  useSpeechRecognitionEvent('volumechange', (e) => setLevel(Math.max(0, Math.min(1, (e.value + 2) / 12))));
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'aborted' || e.error === 'no-speech' || e.error === 'speech-timeout') return;
    wanted.current = false;
    setError(ERRORS[e.error] ?? 'صار خطأ بتحويل الصوت، جرّب كمان مرة.');
  });
  useSpeechRecognitionEvent('end', () => {
    // Keep what was being said as heard
    if (interim.current) {
      committed.current = join(committed.current, interim.current);
      interim.current = '';
    }
    if (wanted.current && restarts.current < 40) {
      restarts.current++;
      try {
        begin();
        return;
      } catch {
        // fall through to finishing
      }
    }
    setState(available() ? 'idle' : 'unsupported');
    setLevel(0);
    deliver();
  });

  // On web the level fades back down between words
  useEffect(() => {
    if (Platform.OS !== 'web' || state !== 'listening') return;
    const i = setInterval(() => setLevel((l) => (l > 0.06 ? l * 0.75 : 0.06)), 110);
    return () => clearInterval(i);
  }, [state]);

  /** Starts listening. On web this must run inside the tap, with nothing awaited before it. */
  const start = useCallback(async () => {
    setError('');
    setText('');
    committed.current = '';
    interim.current = '';
    restarts.current = 0;
    wanted.current = true;
    try {
      if (Platform.OS === 'web') return begin();
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        wanted.current = false;
        setError(ERRORS['not-allowed']);
        return;
      }
      begin();
    } catch {
      wanted.current = false;
      setError('ما قدرت أشغّل المايك.');
      setState(available() ? 'idle' : 'unsupported');
    }
  }, [begin]);

  /** Stops listening and resolves with everything that was said */
  const finish = useCallback(
    () =>
      new Promise<string>((resolve) => {
        wanted.current = false;
        waiter.current = resolve;
        try {
          ExpoSpeechRecognitionModule.stop();
        } catch {
          // already stopped
        }
        // Some browsers never send "end" after a manual stop
        setTimeout(deliver, 1800);
      }),
    [deliver],
  );

  /** Stops and throws away what was heard */
  const cancel = useCallback(() => {
    wanted.current = false;
    waiter.current = null;
    committed.current = '';
    interim.current = '';
    setText('');
    setLevel(0);
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // already stopped
    }
    setState(available() ? 'idle' : 'unsupported');
  }, []);

  useEffect(
    () => () => {
      wanted.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // already stopped
      }
    },
    [],
  );

  return { state, text, error, level, start, finish, cancel };
}
