// The talk loop with غيث: listen → think → speak → (listen again, hands-free) until you stop or go quiet.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { OrbState } from '../components/Orb';
import { useSpeakingLevel, useWebMicLevel } from './micLevel';
import { Action, useStore } from './store';
import { playReply, stopSpeaking, useVoice } from './voice';

export type Turn = { said: string; reply: string; actions: Action[]; error: string };

export function useConversation() {
  const { ask, settings } = useStore();
  const [state, setState] = useState<OrbState>('idle');
  const [turn, setTurn] = useState<Turn | null>(null);
  const [notice, setNotice] = useState('');
  const loop = useRef(false); // keep listening after each reply
  const listenRef = useRef<() => void>(() => {});

  const send = useCallback(
    async (text: string, source: 'voice' | 'text') => {
      setState('thinking');
      setNotice('');
      setTurn({ said: text, reply: '', actions: [], error: '' });
      const speak = settings.speak_replies;
      try {
        const a = await ask(text, source, speak && settings.voice !== 'device');
        setTurn({ said: text, reply: a.reply, actions: a.actions, error: '' });
        if (a.end) loop.current = false;
        if (speak && a.reply) {
          setState('speaking');
          playReply(a.reply, a.audio, a.audioType, () => {
            if (loop.current && source === 'voice') listenRef.current();
            else setState('idle');
          });
        } else {
          setState('idle');
          if (loop.current && source === 'voice') listenRef.current();
        }
      } catch (e) {
        loop.current = false;
        setTurn({ said: text, reply: '', actions: [], error: e instanceof Error ? e.message : 'صار خطأ' });
        setState('idle');
      }
    },
    [ask, settings.speak_replies, settings.voice],
  );

  const voice = useVoice(
    (t) => send(t, 'voice'),
    () => {
      // Heard nothing: the conversation rests until the next tap
      loop.current = false;
      setState('idle');
    },
  );

  const listen = useCallback(() => {
    stopSpeaking();
    if (voice.state === 'unsupported') {
      setNotice('تحويل الصوت مش متاح على هالمتصفح. جرّب Chrome، أو اكتبلي.');
      setState('idle');
      return;
    }
    setNotice('');
    setState('listening');
    voice.start();
  }, [voice]);
  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  /** The orb: tap to talk, tap again to send now, tap while غيث talks to interrupt and speak */
  const tap = useCallback(() => {
    if (state === 'idle') {
      loop.current = settings.keep_listening;
      listen();
    } else if (state === 'listening') {
      voice.stop();
    } else if (state === 'speaking') {
      stopSpeaking();
      loop.current = settings.keep_listening;
      listen();
    }
  }, [state, listen, voice, settings.keep_listening]);

  /** Ends the conversation: stops listening and speaking */
  const stop = useCallback(() => {
    loop.current = false;
    voice.cancel();
    stopSpeaking();
    setState('idle');
  }, [voice]);

  const sendText = useCallback((t: string) => {
    loop.current = false;
    stopSpeaking();
    voice.cancel();
    send(t, 'text');
  }, [send, voice]);

  const micLevel = useWebMicLevel(state === 'listening' && Platform.OS === 'web');
  const speakLevel = useSpeakingLevel(state === 'speaking');
  const level = state === 'listening' ? (Platform.OS === 'web' ? micLevel : voice.level) : state === 'speaking' ? speakLevel : 0;

  return { state, level, partial: voice.partial, turn, notice: notice || voice.error, tap, stop, sendText, supported: voice.state !== 'unsupported' };
}
