import { Tabs } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TalkSheet } from '../../components/TalkSheet';
import { TaskSheet } from '../../components/TaskSheet';
import { onReminderTap } from '../../lib/reminders';
import { useStore } from '../../lib/store';
import { addDays, atTime, startOfDay, Task } from '../../lib/tasks';
import { Ui, UiCtx } from '../../lib/uiContext';
import { C } from '../../theme';
import { Icon, IconName, T } from '../../ui';

const TABS: Record<string, { label: string; icon: IconName; iconOn: IconName }> = {
  index: { label: 'اليوم', icon: 'weather-partly-rainy', iconOn: 'weather-pouring' },
  chat: { label: 'المحادثة', icon: 'chat-outline', iconOn: 'chat' },
  done: { label: 'خلصت', icon: 'check-circle-outline', iconOn: 'check-circle' },
  settings: { label: 'الإعدادات', icon: 'cog-outline', iconOn: 'cog' },
};

type BarProps = { state: { index: number; routes: { key: string; name: string }[] }; navigation: { navigate: (name: string) => void } };

function TabBar({ state, navigation, onTalk, onType }: BarProps & { onTalk: () => void; onType: () => void }) {
  const insets = useSafeAreaInsets();
  const button = (route: { key: string; name: string }, i: number) => {
    const t = TABS[route.name];
    if (!t) return null;
    const on = state.index === i;
    return (
      <Pressable key={route.key} onPress={() => navigation.navigate(route.name)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: 'center', paddingTop: 9 }}>
        <Icon name={on ? t.iconOn : t.icon} size={24} color={on ? C.night : C.faint} />
        <T size={11} w={on ? 'semibold' : 'regular'} color={on ? C.night : C.faint} align="center">{t.label}</T>
      </Pressable>
    );
  };
  return (
    <View
      style={{
        backgroundColor: C.surface,
        paddingBottom: Math.max(insets.bottom, 10),
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: C.night,
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -4 },
        elevation: 12,
        flexDirection: 'row-reverse',
      }}
    >
      {state.routes.slice(0, 2).map((r, i) => button(r, i))}
      <View style={{ width: 84, alignItems: 'center' }}>
        <Pressable
          onPress={onTalk}
          onLongPress={onType}
          accessibilityLabel="احكي مع غيث"
          accessibilityHint="اضغط مطولاً للكتابة"
          style={({ pressed }) => ({
            marginTop: -26,
            width: 68,
            height: 68,
            borderRadius: 34,
            backgroundColor: C.rain,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.94 : 1 }],
            borderWidth: 5,
            borderColor: C.paper,
            shadowColor: C.rain,
            shadowOpacity: 0.35,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          })}
        >
          <Icon name="microphone" size={30} color="#fff" />
        </Pressable>
      </View>
      {state.routes.slice(2).map((r, i) => button(r, i + 2))}
    </View>
  );
}

export default function TabsLayout() {
  const { tasks, complete, save } = useStore();
  const [talk, setTalk] = useState<{ open: boolean; mode: 'voice' | 'text' }>({ open: false, mode: 'voice' });
  const [sheet, setSheet] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });

  const ui = useMemo<Ui>(
    () => ({
      talk: (mode = 'voice') => setTalk({ open: true, mode }),
      openTask: (task) => setSheet({ open: true, task }),
    }),
    [],
  );

  // Notification buttons: done, in an hour, tomorrow morning; a plain tap opens the task
  type Tap = { taskId?: string; action: 'open' | 'done' | 'hour' | 'tomorrow' };
  const handleTap = useCallback(
    async ({ taskId, action }: Tap, list: Task[]) => {
      if (!taskId) return;
      if (action === 'done') return complete(taskId);
      const t = list.find((x) => x.id === taskId);
      if (!t) return;
      if (action === 'hour' || action === 'tomorrow') {
        const at = action === 'hour' ? new Date(new Date().getTime() + 3600000) : atTime(addDays(startOfDay(new Date()), 1), 9);
        const due = t.due_at && new Date(t.due_at) < at ? at.toISOString() : t.due_at;
        return void save(taskId, { remind_at: at.toISOString(), due_at: due });
      }
      setSheet({ open: true, task: t });
    },
    [complete, save],
  );
  // A tap that opens the app arrives before the tasks have loaded: keep it until they have
  const pending = useRef<Tap | null>(null);
  const latest = useRef({ tasks, handleTap });
  useEffect(() => {
    latest.current = { tasks, handleTap };
    const p = pending.current;
    if (p && tasks.some((t) => t.id === p.taskId)) {
      pending.current = null;
      handleTap(p, tasks);
    }
  }, [tasks, handleTap]);
  useEffect(
    () =>
      onReminderTap((tap) => {
        const { tasks: list, handleTap: run } = latest.current;
        if (tap.action === 'done' || list.some((t) => t.id === tap.taskId)) run(tap, list);
        else pending.current = tap;
      }),
    [],
  );

  return (
    <UiCtx.Provider value={ui}>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.paper } }}
        tabBar={(props) => <TabBar {...(props as unknown as BarProps)} onTalk={() => ui.talk('voice')} onType={() => ui.talk('text')} />}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="done" />
        <Tabs.Screen name="settings" />
      </Tabs>
      {talk.open && <TalkSheet startWith={talk.mode} onClose={() => setTalk((t) => ({ ...t, open: false }))} />}
      {sheet.open && <TaskSheet task={sheet.task} onClose={() => setSheet((s) => ({ ...s, open: false }))} />}
    </UiCtx.Provider>
  );
}
