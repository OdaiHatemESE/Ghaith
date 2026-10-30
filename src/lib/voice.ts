// Talking to غيث: speech to text on the phone (Android/iOS speech services, or the browser's on web),
// and غيث's replies read aloud. Nothing is recorded or stored; only the final text is sent to غيث.
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type VoiceState = 'idle' | 'listening' | 'unsupported';

const ERRORS: Record<string, string> = {
  'not-allowed': 'لازم تسمح لغيث يستخدم المايك من إعدادات الجهاز.',
  'service-not-allowed': 'خدمة تحويل الصوت مش مفعّلة على هالجهاز.',
  'no-speech': 'ما سمعت شيء، جرّب كمان مرة.',
  'speech-timeout': 'ما سمعت شيء، جرّب كمان مرة.',
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

/** Press to talk: `start()` listens until the person stops speaking (or `stop()`), then calls `onFinal` with the text */
export function useVoice(onFinal: (text: string) => void) {
  const [state, setState] = useState<VoiceState>(() => (available() ? 'idle' : 'unsupported'));
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const text = useRef('');
  const done = useRef(onFinal);
  useEffect(() => {
    done.current = onFinal;
  }, [onFinal]);

  useSpeechRecognitionEvent('start', () => setState('listening'));
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    if (t) {
      text.current = t;
      setPartial(t);
    }
  });
  useSpeechRecognitionEvent('volumechange', (e) => setLevel(Math.max(0, Math.min(1, (e.value + 2) / 12))));
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'aborted') return;
    // "no-speech" with something already heard is just the end of the sentence
    if ((e.error === 'no-speech' || e.error === 'speech-timeout') && text.current) return;
    setError(ERRORS[e.error] ?? 'صار خطأ بتحويل الصوت، جرّب كمان مرة.');
  });
  useSpeechRecognitionEvent('end', () => {
    setState(available() ? 'idle' : 'unsupported');
    setLevel(0);
    const t = text.current.trim();
    text.current = '';
    setPartial('');
    if (t) done.current(t);
  });

  const start = useCallback(async () => {
    setError('');
    text.current = '';
    setPartial('');
    Speech.stop();
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError(ERRORS['not-allowed']);
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'ar-AE',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        contextualStrings: ['غيث', 'ذكرني', 'أجّل', 'خلصت', 'إيميل', 'المدير'],
        volumeChangeEventOptions: { enabled: true, intervalMillis: 120 },
        androidIntentOptions: {
          // Allow a natural pause mid-sentence before deciding the person has finished
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2200,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 2200,
        },
        iosTaskHint: 'dictation',
      });
      setState('listening');
    } catch {
      setError('ما قدرت أشغّل المايك.');
      setState(available() ? 'idle' : 'unsupported');
    }
  }, []);

  /** Stops listening and sends what was heard */
  const stop = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // already stopped
    }
  }, []);

  /** Stops listening and drops what was heard */
  const cancel = useCallback(() => {
    text.current = '';
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // already stopped
    }
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { state, partial, error, level, start, stop, cancel, clearError: () => setError('') };
}

/** Reads غيث's reply aloud in Arabic */
export function speak(text: string, onDone?: () => void) {
  Speech.stop();
  Speech.speak(text, {
    language: Platform.OS === 'ios' ? 'ar-SA' : 'ar',
    rate: Platform.OS === 'web' ? 1 : 1.02,
    onDone,
    onStopped: onDone,
    onError: onDone,
  });
}

export const stopSpeaking = () => Speech.stop();
