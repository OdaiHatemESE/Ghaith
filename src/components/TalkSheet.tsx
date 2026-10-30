import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Action, useStore } from '../lib/store';
import { speak, stopSpeaking, useVoice } from '../lib/voice';
import { C, F, TS } from '../theme';
import { Icon, IconName, T } from '../ui';
import { Logo } from './Logo';

type Phase = 'listen' | 'type' | 'think' | 'answer';

const ACTION_UI: Record<Action['type'], { icon: IconName; color: string; word: string }> = {
  added: { icon: 'plus-circle', color: '#7DC3FF', word: 'أضفت' },
  updated: { icon: 'pencil-circle', color: '#F4C66A', word: 'عدّلت' },
  done: { icon: 'check-circle', color: '#4FD69C', word: 'خلصت' },
  reopened: { icon: 'restore', color: '#F4C66A', word: 'رجّعت' },
  deleted: { icon: 'close-circle', color: '#FF8A98', word: 'حذفت' },
};

function RoundButton({ icon, label, onPress, big, tone = 'soft' }: { icon: IconName; label: string; onPress: () => void; big?: boolean; tone?: 'soft' | 'rain' | 'late' }) {
  const size = big ? 76 : 54;
  const bg = tone === 'rain' ? C.rain : tone === 'late' ? C.late : C.nightLine;
  return (
    <View style={{ alignItems: 'center', gap: 6, width: 86 }}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityRole="button"
        style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.93 : 1 }] })}
      >
        <Icon name={icon} size={big ? 34 : 24} color="#fff" />
      </Pressable>
      <T size={TS.tiny} color={C.mist} align="center">{label}</T>
    </View>
  );
}

/** Talking to غيث: listens (or takes typed text), sends it, shows and reads out the reply with what changed */
export function TalkSheet({ startWith, onClose }: { startWith: 'voice' | 'text'; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { ask, settings } = useStore();
  const [chosen, setPhase] = useState<Phase>(startWith === 'text' ? 'type' : 'listen');
  const [said, setSaid] = useState('');
  const [typed, setTyped] = useState('');
  const [answer, setAnswer] = useState('');
  const [actions, setActions] = useState<Action[]>([]);
  const [error, setError] = useState('');
  const [pulse] = useState(() => new Animated.Value(0));

  const send = useCallback(
    async (text: string, source: 'voice' | 'text') => {
      setSaid(text);
      if (source === 'text') setTyped('');
      setPhase('think');
      setError('');
      try {
        const r = await ask(text, source);
        setAnswer(r.reply);
        setActions(r.actions);
        setPhase('answer');
        if (settings.speak_replies && source === 'voice') speak(r.reply);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'صار خطأ');
        setPhase('answer');
        setAnswer('');
        setActions([]);
      }
    },
    [ask, settings.speak_replies],
  );

  const voice = useVoice((t) => send(t, 'voice'));
  // No speech service here (some browsers): typing instead
  const phase: Phase = chosen === 'listen' && voice.state === 'unsupported' ? 'type' : chosen;

  const listen = useCallback(() => {
    stopSpeaking();
    setError('');
    setSaid('');
    if (voice.state === 'unsupported') {
      setPhase('type');
      return;
    }
    setPhase('listen');
    voice.start();
  }, [voice]);

  // Opening the sheet starts listening right away (it is mounted fresh each time it opens)
  useEffect(() => {
    if (startWith === 'voice' && voice.state !== 'unsupported') voice.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.spring(pulse, { toValue: voice.level, useNativeDriver: Platform.OS !== 'web', speed: 30, bounciness: 4 }).start();
  }, [voice.level, pulse]);

  const close = () => {
    voice.cancel();
    stopSpeaking();
    onClose();
  };

  const listening = phase === 'listen' && voice.state === 'listening';
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] });
  const shownError = error || (phase === 'listen' ? voice.error : '');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable onPress={phase === 'think' ? undefined : close} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(6,12,22,0.55)' }} />
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <View
          style={{
            backgroundColor: C.night,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            paddingTop: 14,
            paddingHorizontal: 22,
            paddingBottom: insets.bottom + 18,
            maxHeight: '88%',
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <Logo size={30} />
              <T w="bold" size={TS.h2} color="#fff">غيث</T>
            </View>
            <Pressable onPress={close} hitSlop={12} accessibilityLabel="إغلاق" style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.nightSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={18} color={C.mist} />
            </Pressable>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingVertical: 18 }} keyboardShouldPersistTaps="handled">
            {phase === 'listen' && (
              <View style={{ alignItems: 'center', minHeight: 220, justifyContent: 'center' }}>
                <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
                  <Animated.View style={{ position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: C.rain, opacity: listening ? 0.22 : 0, transform: [{ scale: ringScale }] }} />
                  <Pressable
                    onPress={listening ? voice.stop : listen}
                    accessibilityLabel={listening ? 'خلصت كلامي' : 'احكي'}
                    style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: listening ? C.rain : C.nightLine, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name={listening ? 'microphone' : 'microphone-outline'} size={42} color="#fff" />
                  </Pressable>
                </View>
                <T w="medium" size={voice.partial ? 20 : TS.body} color={voice.partial ? '#fff' : C.mist} align="center" style={{ marginTop: 10, minHeight: 30 }}>
                  {voice.partial || (listening ? 'سامعك... احكي' : 'اضغط واحكي')}
                </T>
                {listening && <T size={TS.small} color={C.mist} align="center" style={{ marginTop: 6 }}>اسكت ثانيتين أو اضغط المايك لما تخلّص</T>}
              </View>
            )}

            {phase === 'type' && (
              <View>
                {voice.state === 'unsupported' && (
                  <T size={TS.small} color={C.mist} style={{ marginBottom: 10 }}>تحويل الصوت مش متاح هون، اكتبلي وأنا بفهم عليك.</T>
                )}
                <View style={{ backgroundColor: C.nightSoft, borderRadius: 18, borderWidth: 1, borderColor: C.nightLine, flexDirection: 'row-reverse', alignItems: 'flex-end' }}>
                  <TextInput
                    value={typed}
                    onChangeText={setTyped}
                    placeholder="مثلاً: ذكرني بكرة الصبح أرد على إيميل المدير"
                    placeholderTextColor={C.mist}
                    multiline
                    autoFocus
                    maxLength={2000}
                    style={{ flex: 1, minHeight: 90, maxHeight: 200, color: '#fff', fontFamily: F.regular, fontSize: 16, textAlign: 'right', writingDirection: 'rtl', padding: 14, textAlignVertical: 'top' }}
                  />
                  <Pressable
                    onPress={() => typed.trim() && send(typed.trim(), 'text')}
                    accessibilityLabel="أرسل"
                    style={{ margin: 8, width: 44, height: 44, borderRadius: 22, backgroundColor: typed.trim() ? C.rain : C.nightLine, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="arrow-up" size={22} color="#fff" />
                  </Pressable>
                </View>
              </View>
            )}

            {(phase === 'think' || phase === 'answer') && !!said && (
              <View style={{ alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: C.nightSoft, borderRadius: 18, borderTopLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 }}>
                <T color={C.mist}>{said}</T>
              </View>
            )}

            {phase === 'think' && (
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, minHeight: 80 }}>
                <ActivityIndicator color={C.rainLight} />
                <T color={C.mist}>غيث بيرتّب...</T>
              </View>
            )}

            {phase === 'answer' && (
              <View>
                {!!answer && <T w="medium" size={19} color="#fff" style={{ lineHeight: 32 }}>{answer}</T>}
                {!!error && (
                  <View style={{ flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }}>
                    <Icon name="cloud-alert" size={22} color="#FF8A98" />
                    <T color="#FFB3BD" style={{ flex: 1 }}>{error}</T>
                  </View>
                )}
                {actions.length > 0 && (
                  <View style={{ marginTop: 16, gap: 8 }}>
                    {actions.map((a, i) => {
                      const ui = ACTION_UI[a.type];
                      return (
                        <View key={i} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: C.nightSoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 }}>
                          <Icon name={ui.icon} size={20} color={ui.color} />
                          <T size={TS.small} color={C.mist}>{ui.word}</T>
                          <T size={TS.small} w="semibold" color="#fff" style={{ flex: 1 }} numberOfLines={2}>{a.title}</T>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {!!shownError && phase === 'listen' && (
              <T size={TS.small} color="#FFB3BD" align="center" style={{ marginTop: 8 }}>{shownError}</T>
            )}
          </ScrollView>

          {phase !== 'think' && (
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'flex-start', gap: 10 }}>
              {phase === 'answer' && <RoundButton icon="microphone" label="احكي كمان" big tone="rain" onPress={listen} />}
              {phase === 'type' && voice.state !== 'unsupported' && <RoundButton icon="microphone" label="بالصوت" onPress={listen} />}
              {phase !== 'type' && <RoundButton icon="keyboard-outline" label="اكتب" onPress={() => (voice.cancel(), stopSpeaking(), setPhase('type'))} />}
              {phase === 'answer' && <RoundButton icon="check" label="تمام" onPress={close} />}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
