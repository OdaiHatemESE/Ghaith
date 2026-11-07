// غيث's voice for the voice conversation: a natural Gemini voice from the server (ghaith-tts), or the device's own
// voice when that isn't available.
//
// Speed: Gemini makes the whole clip before sending anything, so a long reply means a long wait. The reply is split
// into sentences, all requested at once, and played in order: the first short sentence starts playing while the rest
// are still being made.
import { AudioPlayer, createAudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { getLang } from './i18n';
import { supabase } from './supabase';

export type Voice = 'hamdan' | 'fatima';
type Clip = { audio: string; type: string } | null;

/** Bumped by every say() and stopSaying(): anything from an older turn stops and plays nothing more */
let turn = 0;
let stopCurrent: (() => void) | null = null;

/** Lists and punctuation that read badly aloud */
const spoken = (t: string) => t.replace(/^\s*-\s+/gm, '').replace(/\n+/g, '. ').replace(/\s+/g, ' ').trim();

/** Sentences, joined into pieces: a short first piece so the voice starts soon, then up to ~220 characters each */
export function pieces(text: string): string[] {
  const sentences = text.match(/[^.!?؟]+[.!?؟]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const out: string[] = [];
  for (const s of sentences) {
    // A long first sentence is cut at a comma so the first clip stays small
    if (!out.length && s.length > 140) {
      const at = s.slice(40, 140).search(/[،,]\s/);
      if (at >= 0) {
        out.push(s.slice(0, 40 + at + 1).trim(), s.slice(40 + at + 1).trim());
        continue;
      }
    }
    const last = out[out.length - 1];
    if (out.length > 1 && last && last.length + s.length < 220) out[out.length - 1] = `${last} ${s}`;
    else if (out.length === 1 && last && last.length < 25) out[0] = `${last} ${s}`;
    else out.push(s);
  }
  return out.slice(0, 6);
}

const fetchClip = (text: string, voice: Voice): Promise<Clip> =>
  supabase.functions
    .invoke('ghaith-tts', { body: { text, voice } })
    .then(({ data }) => (data?.audio ? { audio: data.audio as string, type: (data.audio_type as string) ?? 'audio/wav' } : null))
    .catch(() => null);

function deviceVoice(text: string): Promise<void> {
  return new Promise((resolve) => {
    Speech.speak(text, { language: getLang() === 'en' ? 'en-US' : 'ar', rate: 1, onDone: () => resolve(), onStopped: () => resolve(), onError: () => resolve() });
    stopCurrent = () => {
      Speech.stop();
      resolve();
    };
  });
}

/** Plays one clip; resolves when it ends or is stopped */
function play(clip: NonNullable<Clip>, text: string): Promise<void> {
  return new Promise((resolve) => {
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      stopCurrent = null;
      resolve();
    };
    if (Platform.OS === 'web') {
      const AudioEl = (globalThis as unknown as { Audio: new (src: string) => HTMLAudioElement }).Audio;
      const el = new AudioEl(`data:${clip.type};base64,${clip.audio}`);
      el.onended = finish;
      el.onerror = () => deviceVoice(text).then(finish);
      el.play().catch(() => deviceVoice(text).then(finish));
      stopCurrent = () => {
        el.pause();
        el.removeAttribute('src');
        finish();
      };
      return;
    }
    let player: AudioPlayer | null = null;
    try {
      const file = new File(Paths.cache, `ghaith-reply-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${clip.type === 'audio/wav' ? 'wav' : 'mp3'}`);
      file.write(clip.audio, { encoding: 'base64' });
      const p = createAudioPlayer(file.uri);
      player = p;
      const release = () => {
        sub.remove();
        // remove() alone frees the player but can leave the sound playing on Android: pause it first
        try {
          p.pause();
        } catch {
          // already gone
        }
        p.remove();
        try {
          file.delete();
        } catch {
          // cache is cleared by the system anyway
        }
      };
      const sub = p.addListener('playbackStatusUpdate', (st) => {
        if (st.didJustFinish) {
          release();
          finish();
        }
      });
      stopCurrent = () => {
        release();
        finish();
      };
      p.play();
    } catch {
      if (player) player.remove();
      deviceVoice(text).then(finish);
    }
  });
}

/**
 * Says `text` in غيث's voice; resolves when it has finished or was stopped. `onStart` runs when the first sound
 * actually plays (until then the screen can show that the voice is being prepared).
 */
export async function say(text: string, voice: Voice, onStart?: () => void): Promise<void> {
  stopSaying();
  const mine = ++turn;
  const t = spoken(text);
  if (!t) return;
  const parts = pieces(t);
  // All pieces are requested at once; the first is the shortest, so it is ready first
  const clips = parts.map((p) => fetchClip(p, voice));
  let started = false;
  for (let i = 0; i < parts.length; i++) {
    const clip = await clips[i];
    if (turn !== mine) return;
    if (!started) {
      started = true;
      onStart?.();
    }
    if (clip) await play(clip, parts[i]);
    else await deviceVoice(parts[i]);
    if (turn !== mine) return;
  }
}

/** Stops the voice right away, including pieces that haven't arrived yet */
export function stopSaying() {
  turn++;
  const stop = stopCurrent;
  stopCurrent = null;
  stop?.();
  try {
    Speech.stop();
  } catch {
    // nothing playing
  }
}
