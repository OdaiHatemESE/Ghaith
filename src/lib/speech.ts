// غيث's voice for the voice conversation: a natural Gemini voice from the server (ghaith-tts), or the device's own
// voice when that isn't available.
import { createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { getLang } from './i18n';
import { supabase } from './supabase';

export type Voice = 'hamdan' | 'fatima';

let current: { stop: () => void } | null = null;

/** Lists and punctuation that read badly aloud */
const spoken = (t: string) => t.replace(/^\s*-\s+/gm, '').replace(/\n+/g, '. ').replace(/\s+/g, ' ').trim();

function deviceVoice(text: string, done: () => void) {
  Speech.speak(text, { language: getLang() === 'en' ? 'en-US' : 'ar', rate: 1, onDone: done, onStopped: done, onError: done });
  current = { stop: () => Speech.stop() };
}

function play(audio: string, type: string, text: string, done: () => void) {
  if (Platform.OS === 'web') {
    const AudioEl = (globalThis as unknown as { Audio: new (src: string) => HTMLAudioElement }).Audio;
    const el = new AudioEl(`data:${type};base64,${audio}`);
    el.onended = done;
    el.onerror = () => deviceVoice(text, done);
    el.play().catch(() => deviceVoice(text, done));
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
    deviceVoice(text, done);
  }
}

/** Says `text` in غيث's voice; resolves when it has finished (or was stopped) */
export function say(text: string, voice: Voice): Promise<void> {
  stopSaying();
  const t = spoken(text);
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      current = null;
      resolve();
    };
    if (!t) return done();
    // Marks this request so stopSaying() before the audio arrives cancels it
    const token = { stop: done };
    current = token;
    supabase.functions
      .invoke('ghaith-tts', { body: { text: t.slice(0, 1200), voice } })
      .then(({ data }) => {
        if (current !== token) return;
        if (data?.audio) play(data.audio, data.audio_type ?? 'audio/wav', t, done);
        else deviceVoice(t, done);
      })
      .catch(() => current === token && deviceVoice(t, done));
  });
}

export function stopSaying() {
  const c = current;
  current = null;
  c?.stop();
  try {
    Speech.stop();
  } catch {
    // nothing playing
  }
}
