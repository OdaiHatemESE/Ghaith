// Talking to غيث: speech to text on the phone (Android/iOS speech services, or the browser's on web),
// and غيث's replies read aloud. Nothing is recorded or stored; only the final text is sent to غيث.
import { createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
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
export function useVoice(onFinal: (text: string) => void, onSilent: () => void = () => {}) {
  const [state, setState] = useState<VoiceState>(() => (available() ? 'idle' : 'unsupported'));
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const text = useRef('');
  const done = useRef(onFinal);
  const silent = useRef(onSilent);
  useEffect(() => {
    done.current = onFinal;
    silent.current = onSilent;
  }, [onFinal, onSilent]);

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
    else silent.current();
  });

  const start = useCallback(async () => {
    setError('');
    text.current = '';
    setPartial('');
    stopSpeaking();
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

// ---------- غيث's voice ----------
let current: { stop: () => void } | null = null;
let deviceVoice: string | undefined | null = null;

/** The best Arabic voice the phone or browser has (UAE, then Gulf, then any Arabic) */
async function pickDeviceVoice(): Promise<string | undefined> {
  if (deviceVoice !== null) return deviceVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const ar = voices.filter((v) => v.language?.toLowerCase().startsWith('ar'));
    const rank = (l: string) => ['ar-ae', 'ar-sa', 'ar-kw', 'ar-qa', 'ar-jo', 'ar-eg', 'ar'].findIndex((p) => l.toLowerCase().startsWith(p));
    ar.sort((a, b) => (rank(a.language) - rank(b.language)) || (a.quality === 'Enhanced' ? -1 : 1));
    deviceVoice = ar[0]?.identifier;
  } catch {
    deviceVoice = undefined;
  }
  return deviceVoice ?? undefined;
}

function speakWithDevice(text: string, onDone: () => void) {
  pickDeviceVoice().then((voice) => {
    Speech.speak(text, { language: 'ar', voice, rate: 1, onDone, onStopped: onDone, onError: onDone });
  });
  current = { stop: () => Speech.stop() };
}

/**
 * Plays غيث's reply: the natural voice when the server sent audio (base64 WAV or MP3), otherwise the device voice.
 * Calls `onDone` once when it finishes or is stopped.
 */
export function playReply(text: string, audio: string | null | undefined, type: string | null = 'audio/mpeg', onDone: () => void = () => {}) {
  stopSpeaking();
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    current = null;
    onDone();
  };
  if (!audio) return speakWithDevice(text, done);

  if (Platform.OS === 'web') {
    const AudioEl = (globalThis as unknown as { Audio: new (src: string) => HTMLAudioElement }).Audio;
    const el = new AudioEl(`data:${type || 'audio/mpeg'};base64,${audio}`);
    el.onended = done;
    el.onerror = () => speakWithDevice(text, done);
    el.play().catch(() => speakWithDevice(text, done));
    current = { stop: () => (el.pause(), done()) };
    return;
  }
  try {
    const file = new File(Paths.cache, `ghaith-reply-${Date.now()}.${type === 'audio/wav' ? 'wav' : 'mp3'}`);
    file.write(audio, { encoding: 'base64' });
    const player = createAudioPlayer(file.uri);
    const sub = player.addListener('playbackStatusUpdate', (st) => {
      if (st.didJustFinish) {
        sub.remove();
        player.remove();
        done();
      }
    });
    player.play();
    current = {
      stop: () => {
        sub.remove();
        player.remove();
        done();
      },
    };
  } catch {
    speakWithDevice(text, done);
  }
}

export function stopSpeaking() {
  const c = current;
  current = null;
  c?.stop();
  Speech.stop();
}
