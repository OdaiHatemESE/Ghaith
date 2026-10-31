import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Aurora } from '../components/Aurora';
import { Orb } from '../components/Orb';
import { TaskRow } from '../components/TaskRow';
import { Wordmark } from '../components/Wordmark';
import { useConversation } from '../lib/conversation';
import { Action, useStore } from '../lib/store';
import { greeting, groupOf, longDate, sortTasks } from '../lib/tasks';
import { useNow } from '../lib/useNow';
import { C, F, lift, TS } from '../theme';
import { Icon, IconButton, IconName, T } from '../ui';

const STATUS = {
  idle: 'اضغط واحكيلي',
  listening: 'سامعك…',
  thinking: 'لحظة، عم رتّب…',
  speaking: '',
};

const ACTION_UI: Record<Action['type'], { icon: IconName; color: string; word: string }> = {
  added: { icon: 'plus', color: C.accent, word: 'أضفت' },
  updated: { icon: 'pencil-outline', color: C.amber, word: 'عدّلت' },
  done: { icon: 'check', color: C.ok, word: 'خلّصت' },
  reopened: { icon: 'restore', color: C.amber, word: 'رجّعت' },
  deleted: { icon: 'close', color: C.late, word: 'حذفت' },
};

export default function Home() {
  const insets = useSafeAreaInsets();
  const { name, tasks, complete } = useStore();
  const now = useNow();
  const talk = useConversation();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');

  const open = useMemo(() => tasks.filter((t) => t.status === 'open'), [tasks]);
  const today = useMemo(() => sortTasks(open.filter((t) => ['late', 'today'].includes(groupOf(t, now)))), [open, now]);
  const lateCount = today.filter((t) => groupOf(t, now) === 'late').length;
  const waiting = open.filter((t) => t.kind === 'waiting').length;
  const next = useMemo(() => sortTasks(open.filter((t) => ['tomorrow', 'week'].includes(groupOf(t, now)))).slice(0, 2), [open, now]);

  const active = talk.state !== 'idle';
  const status = talk.state === 'listening' && talk.partial ? '' : STATUS[talk.state];

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    setTyping(false);
    talk.sendText(t);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.bg }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {/* Top bar */}
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
          <Wordmark size={30} />
          <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
            <IconButton icon="history" label="المحادثات" onPress={() => router.push('/history')} />
            <IconButton icon="cog-outline" label="الإعدادات" onPress={() => router.push('/settings')} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, marginTop: 18 }}>
          <T size={TS.small} color={C.faint}>{longDate(now)}</T>
          <T w="semibold" size={TS.display} style={{ lineHeight: 42 }}>
            {greeting(now)}{name ? ` يا ${name}` : ''}
          </T>
        </View>

        {/* The orb */}
        <Pressable
          onPress={talk.tap}
          onLongPress={() => (talk.stop(), setTyping(true))}
          accessibilityRole="button"
          accessibilityLabel={talk.state === 'listening' ? 'خلصت كلامي' : 'احكي مع غيث'}
          style={{ alignItems: 'center', marginTop: 10 }}
        >
          <Orb state={talk.state} level={talk.level} size={250} />
        </Pressable>

        {/* What was said and what غيث answered */}
        <View style={{ paddingHorizontal: 28, minHeight: 96, alignItems: 'center' }}>
          {talk.state === 'listening' && !!talk.partial && (
            <T w="medium" size={20} align="center" style={{ lineHeight: 32 }}>{talk.partial}</T>
          )}
          {talk.state !== 'listening' && !!talk.turn?.said && (
            <T size={TS.small} color={C.faint} align="center" numberOfLines={2}>«{talk.turn.said}»</T>
          )}
          {!!status && (
            <T w="medium" size={TS.body} color={C.sub} align="center" style={{ marginTop: 6 }}>{status}</T>
          )}
          {talk.state !== 'listening' && talk.state !== 'thinking' && !!talk.turn?.reply && (
            <T w="medium" size={18} align="center" style={{ lineHeight: 30, marginTop: 6 }}>{talk.turn.reply}</T>
          )}
          {!!talk.turn?.error && <T size={TS.small} color={C.late} align="center" style={{ marginTop: 6 }}>{talk.turn.error}</T>}
          {!!talk.notice && <T size={TS.small} color={C.amber} align="center" style={{ marginTop: 6 }}>{talk.notice}</T>}

          {talk.state !== 'thinking' && !!talk.turn?.actions.length && (
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 12 }}>
              {talk.turn.actions.map((a, i) => {
                const ui = ACTION_UI[a.type];
                return (
                  <View key={i} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: ui.color + '1C', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, maxWidth: '100%' }}>
                    <Icon name={ui.icon} size={14} color={ui.color} />
                    <T size={TS.tiny} color={C.text} numberOfLines={1} style={{ flexShrink: 1 }}>{ui.word}: {a.title}</T>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 16 }}>
            {!typing && (
              <Pill icon="keyboard-outline" label="اكتب" onPress={() => (talk.stop(), setTyping(true))} />
            )}
            {active && <Pill icon="stop" label="إنهاء" onPress={talk.stop} />}
          </View>
        </View>

        {/* Today */}
        <View style={{ marginTop: 26, marginHorizontal: 16, backgroundColor: C.surface, borderRadius: 26, borderWidth: 1, borderColor: C.glassBorder, ...lift }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <T w="semibold" size={TS.h2}>اليوم</T>
              {lateCount > 0 && (
                <View style={{ backgroundColor: C.lateSoft, borderRadius: 8, paddingHorizontal: 8 }}>
                  <T size={TS.tiny} w="semibold" color={C.late}>{lateCount} متأخر</T>
                </View>
              )}
              {waiting > 0 && (
                <View style={{ backgroundColor: C.amberSoft, borderRadius: 8, paddingHorizontal: 8 }}>
                  <T size={TS.tiny} w="semibold" color={C.amber}>ناطر {waiting}</T>
                </View>
              )}
            </View>
            <Pressable onPress={() => router.push('/tasks')} hitSlop={10} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 2 }}>
              <T size={TS.small} w="medium" color={C.accent}>كل المهام</T>
              <Icon name="chevron-left" size={18} color={C.accent} />
            </Pressable>
          </View>

          {today.slice(0, 6).map((t, i) => (
            <TaskRow key={t.id} task={t} last={i === Math.min(today.length, 6) - 1 && !next.length} onToggle={() => complete(t.id)} onOpen={() => router.push({ pathname: '/tasks', params: { open: t.id } })} />
          ))}
          {!today.length && (
            <View style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
              <T color={C.sub}>{open.length ? 'ما في شيء لليوم. يومك خفيف.' : 'لسا ما في مهام. احكيلي شو على بالك، مثلاً: «ذكرني بكرة الصبح أرد على إيميل المدير».'}</T>
            </View>
          )}
          {today.length > 6 && (
            <Pressable onPress={() => router.push('/tasks')} style={{ paddingHorizontal: 18, paddingVertical: 12 }}>
              <T size={TS.small} color={C.accent}>و{today.length - 6} كمان…</T>
            </Pressable>
          )}
          {!!next.length && (
            <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
              <T size={TS.tiny} w="medium" color={C.faint} style={{ paddingHorizontal: 18 }}>الجاي</T>
              {next.map((t, i) => (
                <TaskRow key={t.id} task={t} compact last={i === next.length - 1} onToggle={() => complete(t.id)} onOpen={() => router.push({ pathname: '/tasks', params: { open: t.id } })} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {typing && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 12, backgroundColor: C.bgSoft, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="اكتب لغيث…"
            placeholderTextColor={C.faint}
            autoFocus
            multiline
            maxLength={2000}
            onSubmitEditing={submit}
            style={{ flex: 1, maxHeight: 120, backgroundColor: C.surfaceHi, borderRadius: 20, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 11, fontFamily: F.regular, fontSize: TS.body, color: C.text, textAlign: 'right', writingDirection: 'rtl' }}
          />
          <Pressable onPress={text.trim() ? submit : () => setTyping(false)} accessibilityLabel={text.trim() ? 'أرسل' : 'إغلاق'} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: text.trim() ? C.accent : C.surfaceHi, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={text.trim() ? 'arrow-up' : 'close'} size={22} color="#fff" />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Pill({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: pressed ? C.surfaceHi : C.surface, borderWidth: 1, borderColor: C.glassBorder })}
    >
      <Icon name={icon} size={16} color={C.sub} />
      <T size={TS.small} color={C.sub}>{label}</T>
    </Pressable>
  );
}
