import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { TaskCard } from '../components/TaskCard';
import { TaskSheet } from '../components/TaskSheet';
import { useStore } from '../lib/store';
import { dayLabel, GroupKey, groupOf, GROUPS, Kind, KINDS, sortTasks, Task } from '../lib/tasks';
import { useNow } from '../lib/useNow';
import { C, TS } from '../theme';
import { Chip, HScroll, IconButton, Segmented, T } from '../ui';

const ORDER: GroupKey[] = ['late', 'today', 'tomorrow', 'week', 'later', 'someday'];

/** Every task: open ones by when they're due, done ones by the day they were finished */
export default function Tasks() {
  const insets = useSafeAreaInsets();
  const { open: openId, kind: kindParam } = useLocalSearchParams<{ open?: string; kind?: Kind }>();
  const { tasks, complete, reopen, refresh } = useStore();
  const now = useNow();
  const [view, setView] = useState<'open' | 'done'>('open');
  const [kind, setKind] = useState<Kind | null>(() => (kindParam && kindParam in KINDS ? kindParam : null));
  const [sheet, setSheet] = useState<{ task: Task | null } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Arriving with ?open=<id> (from the home screen or a notification) opens that task once
  const [handled, setHandled] = useState<string | null>(null);
  if (openId && openId !== handled) {
    const t = tasks.find((x) => x.id === openId);
    if (t) {
      setHandled(openId);
      setSheet({ task: t });
    }
  }

  const open = useMemo(() => tasks.filter((t) => t.status === 'open' && (!kind || t.kind === kind)), [tasks, kind]);
  const groups = useMemo(() => {
    const m = new Map<GroupKey, Task[]>();
    for (const t of sortTasks(open)) {
      const g = groupOf(t, now);
      m.set(g, [...(m.get(g) ?? []), t]);
    }
    return ORDER.filter((g) => m.has(g)).map((g) => ({ key: g as string, title: GROUPS[g], list: m.get(g)!, late: g === 'late' }));
  }, [open, now]);

  const doneDays = useMemo(() => {
    const done = tasks.filter((t) => t.status === 'done' && t.done_at).sort((a, b) => (a.done_at! < b.done_at! ? 1 : -1));
    const out: { key: string; title: string; list: Task[]; late: boolean }[] = [];
    for (const t of done) {
      const label = dayLabel(new Date(t.done_at!), now);
      const last = out[out.length - 1];
      if (last && last.title === label) last.list.push(t);
      else out.push({ key: label, title: label, list: [t], late: false });
    }
    return out;
  }, [tasks, now]);

  const sections = view === 'open' ? groups : doneDays;
  const counts = { todo: 0, waiting: 0, reply: 0 } as Record<Kind, number>;
  for (const t of tasks) if (t.status === 'open') counts[t.kind]++;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="المهام" right={<IconButton icon="plus" label="أضف مهمة" onPress={() => setSheet({ task: null })} />} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await refresh(), setRefreshing(false))} tintColor={C.glow} />}
      >
        <Segmented value={view} onChange={setView} options={[['open', 'مفتوحة'], ['done', 'خلصت']]} />

        {view === 'open' && (
          <View style={{ marginTop: 12 }}>
            <HScroll>
              <Chip label="الكل" on={!kind} onPress={() => setKind(null)} />
              {(['todo', 'waiting', 'reply'] as Kind[]).map((k) => (
                <Chip key={k} label={`${KINDS[k].label} ${counts[k]}`} icon={KINDS[k].icon} color={KINDS[k].color} on={kind === k} onPress={() => setKind(kind === k ? null : k)} />
              ))}
            </HScroll>
          </View>
        )}

        {sections.map((g) => (
          <View key={g.key} style={{ marginTop: 20 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 4 }}>
              <T w="heavy" size={TS.h2} color={g.late ? C.late : C.indigo}>{g.title}</T>
              <T size={TS.small} color={C.faint}>{g.list.length}</T>
            </View>
            {g.list.map((t) => (
              <TaskCard key={t.id} task={t} onToggle={() => (t.status === 'done' ? reopen(t.id) : complete(t.id))} onOpen={() => setSheet({ task: t })} />
            ))}
          </View>
        ))}

        {!sections.length && (
          <T color={C.sub} align="center" style={{ marginTop: 48 }}>
            {view === 'open' ? (kind ? 'ما في مهام من هالنوع.' : 'ما في مهام مفتوحة. ارجع للرئيسية وسجّل اللي عليك.') : 'لما تخلّص مهمة بتطلع هون.'}
          </T>
        )}
      </ScrollView>

      {sheet && (
        <TaskSheet
          task={sheet.task}
          onClose={() => {
            setSheet(null);
            if (openId) router.setParams({ open: undefined });
          }}
        />
      )}
    </View>
  );
}
