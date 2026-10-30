import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '../../components/Logo';
import { Action, useStore } from '../../lib/store';
import { dayLabel, timeLabel } from '../../lib/tasks';
import { useUi } from '../../lib/uiContext';
import { C, F, TS } from '../../theme';
import { Icon, IconName, T } from '../../ui';

const ACTION_ICON: Record<Action['type'], [IconName, string, string]> = {
  added: ['plus-circle-outline', C.rain, 'أضفت'],
  updated: ['pencil-outline', '#C27A0B', 'عدّلت'],
  done: ['check-circle-outline', C.ok, 'خلصت'],
  reopened: ['restore', '#C27A0B', 'رجّعت'],
  deleted: ['close-circle-outline', C.late, 'حذفت'],
};

/** The whole conversation with غيث, with a box to type to it */
export default function Chat() {
  const insets = useSafeAreaInsets();
  const { messages, ask } = useStore();
  const { talk } = useUi();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const scroll = useRef<ScrollView>(null);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    setErr('');
    setBusy(true);
    try {
      await ask(t, 'text');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'صار خطأ');
      setText(t);
    }
    setBusy(false);
  };

  const rows = messages.map((m, i) => {
    const day = dayLabel(new Date(m.created_at));
    return { m, header: i === 0 || dayLabel(new Date(messages[i - 1].created_at)) !== day ? day : '' };
  });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={{ backgroundColor: C.night, paddingTop: insets.top + 12, paddingBottom: 14, paddingHorizontal: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
        <Logo size={34} />
        <View>
          <T w="bold" size={TS.h2} color="#fff">غيث</T>
          <T size={TS.tiny} color={C.mist}>سكرتيرك الشخصي</T>
        </View>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 12, gap: 10 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {!messages.length && (
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            <T color={C.sub} align="center">لسا ما حكينا. اكتبلي هون أو اضغط المايك.</T>
          </View>
        )}
        {rows.map(({ m, header }) => {
          const d = new Date(m.created_at);
          const mine = m.role === 'user';
          return (
            <View key={m.id}>
              {!!header && <T size={TS.tiny} color={C.faint} align="center" style={{ marginVertical: 6 }}>{header}</T>}
              <View
                style={{
                  alignSelf: mine ? 'flex-start' : 'flex-end',
                  maxWidth: '86%',
                  backgroundColor: mine ? C.surface : C.night,
                  borderRadius: 18,
                  borderTopLeftRadius: mine ? 6 : 18,
                  borderTopRightRadius: mine ? 18 : 6,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <T color={mine ? C.text : '#fff'}>{m.content}</T>
                {m.actions?.length > 0 && (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {m.actions.map((a, i) => {
                      const [icon, color, word] = ACTION_ICON[a.type] ?? ACTION_ICON.updated;
                      return (
                        <View key={i} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                          <Icon name={icon} size={15} color={mine ? color : C.rainLight} />
                          <T size={TS.tiny} color={mine ? C.sub : C.mist} style={{ flex: 1 }} numberOfLines={1}>{word}: {a.title}</T>
                        </View>
                      );
                    })}
                  </View>
                )}
                <T size={10} color={mine ? C.faint : C.mist} align="left" style={{ marginTop: 2 }}>{timeLabel(d)}</T>
              </View>
            </View>
          );
        })}
        {busy && (
          <View style={{ alignSelf: 'flex-end', flexDirection: 'row-reverse', gap: 8, alignItems: 'center', backgroundColor: C.night, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }}>
            <ActivityIndicator size="small" color={C.rainLight} />
            <T size={TS.small} color={C.mist}>غيث بيرتّب...</T>
          </View>
        )}
        {!!err && <T size={TS.small} color={C.late} align="center">{err}</T>}
      </ScrollView>

      <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 34, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.paper }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="اكتب لغيث..."
          placeholderTextColor={C.faint}
          multiline
          maxLength={2000}
          style={{ flex: 1, maxHeight: 120, backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 10, fontFamily: F.regular, fontSize: TS.body, color: C.text, textAlign: 'right', writingDirection: 'rtl' }}
        />
        <Pressable
          onPress={text.trim() ? send : () => talk('voice')}
          accessibilityLabel={text.trim() ? 'أرسل' : 'احكي'}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.rain, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
        >
          <Icon name={text.trim() ? 'arrow-up' : 'microphone'} size={22} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
