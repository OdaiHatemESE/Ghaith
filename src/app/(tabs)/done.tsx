import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TaskRow } from '../../components/TaskRow';
import { useStore } from '../../lib/store';
import { dayLabel, Task } from '../../lib/tasks';
import { useUi } from '../../lib/uiContext';
import { useNow } from '../../lib/useNow';
import { C, TS } from '../../theme';
import { Card, Icon, T } from '../../ui';

/** What got done in the last three weeks, by day */
export default function Done() {
  const insets = useSafeAreaInsets();
  const { tasks, reopen } = useStore();
  const { openTask } = useUi();

  const days = useMemo(() => {
    const done = tasks.filter((t) => t.status === 'done' && t.done_at).sort((a, b) => (a.done_at! < b.done_at! ? 1 : -1));
    const out: { label: string; list: Task[] }[] = [];
    for (const t of done) {
      const label = dayLabel(new Date(t.done_at!));
      const last = out[out.length - 1];
      if (last && last.label === label) last.list.push(t);
      else out.push({ label, list: [t] });
    }
    return out;
  }, [tasks]);

  const now = useNow();
  const week = tasks.filter((t) => t.status === 'done' && t.done_at && now.getTime() - new Date(t.done_at).getTime() < 7 * 86400000).length;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ backgroundColor: C.night, paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <T w="bold" size={TS.h1} color="#fff">خلصت</T>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
          <T w="bold" size={40} color={C.rainLight} style={{ lineHeight: 50 }}>{week}</T>
          <T color={C.mist}>مهمة خلصت هالأسبوع</T>
        </View>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        {days.map((d) => (
          <View key={d.label} style={{ marginTop: 20 }}>
            <T w="bold" size={TS.h2} style={{ marginBottom: 8, paddingHorizontal: 4 }}>{d.label}</T>
            <Card>
              {d.list.map((t, i) => (
                <TaskRow key={t.id} task={t} last={i === d.list.length - 1} onToggle={() => reopen(t.id)} onOpen={() => openTask(t)} />
              ))}
            </Card>
          </View>
        ))}
        {!days.length && (
          <View style={{ alignItems: 'center', marginTop: 50, gap: 10 }}>
            <Icon name="check-circle-outline" size={44} color={C.faint} />
            <T color={C.sub} align="center">لما تخلّص مهمة بتطلع هون.</T>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
