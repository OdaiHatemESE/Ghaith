// Voice mode inside the chat: talk to غيث and hear it answer in its voice, hands-free. It listens for one sentence,
// answers out loud, then listens again, until you end it. Every turn is also written into the chat.
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAction, sendChat } from '../lib/chat';
import { D, tx } from '../lib/i18n';
import { say, stopSaying, Voice } from '../lib/speech';
import { useDictation } from '../lib/voice';
import { C, R, tint, TS } from '../theme';
import { Icon, IconButton, T } from '../ui';
import { GhaithBot } from './GhaithBot';
import type { OrbState } from './Orb';

type Dict = ReturnType<typeof useDictation>;

export function VoiceChat({
  dict,
  since,
  voice,
  onVoice,
  onTurn,
  onClose,
}: {
  dict: Dict;
  since: string;
  voice: Voice;
  onVoice: (v: Voice) => void;
  onTurn: (said: string, reply: string, actions: ChatAction[]) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [phase, setState] = useState<OrbState>('idle');
  const [said, setSaid] = useState('');
  const [answer, setAnswer] = useState('');
  const [err, setErr] = useState('');
  const open = useRef(true);
  const quiet = useRef(0); // pauses in a row with nothing said
  const voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  const again = useRef<() => void>(() => {});
  const listen = useCallback(() => {
    if (!open.current) return;
    setErr('');
    setState('listening');
    dict.start(async (text) => {
      if (!open.current) return;
      if (!text) {
        quiet.current += 1;
        // Stop listening after two silent turns; a tap starts again
        if (quiet.current >= 2) return setState('idle');
        return again.current();
      }
      quiet.current = 0;
      // A tick so you know you were heard, before the answer comes
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setSaid(text);
      setAnswer('');
      setState('thinking');
      try {
        const r = await sendChat(text, 'voice', since, true);
        onTurn(text, r.reply, r.actions); // written into the chat even if voice mode was closed meanwhile
        if (!open.current) return;
        // The text shows at once; the orb turns to "speaking" when the voice actually starts
        setAnswer(r.reply);
        await say(r.reply, voiceRef.current, () => open.current && setState('speaking'));
        if (open.current) again.current();
      } catch (e) {
        if (!open.current) return;
        setErr((e as Error).message);
        setState('idle');
      }
    });
  }, [dict, since, onTurn]);
  useEffect(() => {
    again.current = listen;
  }, [listen]);

  // Start right away: the tap that opened voice mode counts as the gesture the browser needs
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    listen();
  }, [listen]);

  // However the screen goes away, nothing keeps talking or listening
  useEffect(
    () => () => {
      open.current = false;
      stopSaying();
    },
    [],
  );

  const close = useCallback(() => {
    open.current = false;
    stopSaying();
    dict.cancel();
    onClose();
  }, [dict, onClose]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (close(), true));
    return () => sub.remove();
  }, [close]);

  // A microphone error ends listening; tapping the orb tries again
  const state: OrbState = phase === 'listening' && !!dict.error ? 'idle' : phase;

  /** The orb: stop speaking and listen, or start listening when idle */
  const tapOrb = () => {
    if (state === 'speaking' || (state === 'thinking' && answer)) {
      stopSaying();
      return; // the turn's say() resolves and listening starts again
    }
    if (state === 'idle') {
      quiet.current = 0;
      listen();
    }
  };

  const status =
    state === 'listening'
      ? tx('أستمع إليك…', 'Listening…')
      : state === 'thinking'
        ? answer
          ? tx('يجهّز الصوت… اضغط للتخطي', 'Preparing the voice… tap to skip')
          : tx('غيث يفكّر…', 'Ghaith is thinking…')
        : state === 'speaking'
          ? tx('غيث يتحدث، اضغط لمقاطعته', 'Ghaith is speaking, tap to interrupt')
          : tx('اضغط على الدائرة وتحدّث', 'Tap the orb and talk');

  return (
    <Modal visible animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: C.indigo }}>
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="close" label={tx('إنهاء', 'End')} onPress={close} />
          {/* Voice choice */}
          <View style={{ flexDirection: D.row, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: R.pill, padding: 3 }}>
            {(['hamdan', 'fatima'] as Voice[]).map((v) => (
              <Pressable key={v} onPress={() => onVoice(v)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, backgroundColor: voice === v ? 'rgba(255,255,255,0.22)' : 'transparent' }}>
                <T size={TS.tiny} w={voice === v ? 'bold' : 'regular'} color="#fff">{v === 'hamdan' ? tx('صوت رجالي', 'Male voice') : tx('صوت نسائي', 'Female voice')}</T>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Pressable onPress={tapOrb} accessibilityRole="button" accessibilityLabel={status}>
            <GhaithBot state={state === 'listening' ? 'listen' : state === 'thinking' ? 'think' : state === 'speaking' ? 'talk' : 'idle'} level={state === 'listening' ? dict.level : 0} size={250} />
          </Pressable>
          <T w="bold" size={TS.h2} color="#fff" align="center" style={{ marginTop: 28 }}>{status}</T>

          {/* What was said, and the answer */}
          <View style={{ marginTop: 18, width: '100%', maxWidth: 560, gap: 10 }}>
            {!!(state === 'listening' ? dict.text : said) && (
              <T size={TS.body} color="rgba(255,255,255,0.75)" align="center" numberOfLines={3}>«{state === 'listening' ? dict.text : said}»</T>
            )}
            {!!answer && state !== 'listening' && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: R.card, padding: 14 }}>
                <T color="#fff" style={{ lineHeight: 24 }} numberOfLines={8}>{answer}</T>
              </View>
            )}
            {!!(err || dict.error) && (
              <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, backgroundColor: tint(C.late, 0.25), borderRadius: 14, padding: 10 }}>
                <Icon name="alert-circle-outline" size={18} color="#fff" />
                <T size={TS.small} color="#fff" style={{ flex: 1 }}>{err || dict.error}</T>
              </View>
            )}
          </View>
        </View>

        <View style={{ paddingBottom: insets.bottom + 28, alignItems: 'center', gap: 10 }}>
          <Pressable onPress={close} accessibilityLabel={tx('إنهاء المحادثة الصوتية', 'End voice chat')} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.late, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="phone-hangup" size={28} color="#fff" />
          </Pressable>
          <T size={TS.tiny} color="rgba(255,255,255,0.6)" align="center">{tx('تُكتب المحادثة في الشات أيضاً', 'The conversation is written into the chat too')}</T>
        </View>
      </View>
    </Modal>
  );
}
