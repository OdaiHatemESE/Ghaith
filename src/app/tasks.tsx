import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { countTasks } from '../components/Capture';
import { ScreenHeader } from '../components/ScreenHeader';
import { cardStyle, SpaceSwitch, TAB_SPACE, TabBar, TabTitle } from '../components/Spaces';
import { TaskRow } from '../components/TaskRow';
import { TaskSheet } from '../components/TaskSheet';
import { inSpace, SpaceFilter, useSpace } from '../lib/space';
import { useStore } from '../lib/store';
import { Category, CATS, dayLabel, GROUP_ORDER, GroupKey, groupOf, GROUPS, Kind, KINDS, sortTasks, Space, SPACE_CATS, SPACES, spaceOf, Task } from '../lib/tasks';
import { useNow } from '../lib/useNow';
import { C, TS } from '../theme';
import { Chip, Icon, IconButton, T } from '../ui';
import { D, tx } from '../lib/i18n';
import { useWide } from '../lib/useWide';


/** Every task, split into work and personal: open ones by category and when they're due, done ones by the day they were finished */
export default function Tasks() {
  const insets = useSafeAreaInsets();
  const { open: openId, kind: kindParam } = useLocalSearchParams<{ open?: string; kind?: Kind }>();
  const { tasks, complete, reopen, refresh } = useStore();
  const now = useNow();
  const [view, setView] = useState<'open' | 'done'>('open');
  const paramKind = kindParam && kindParam in KINDS ? kindParam : null;
  const [kind, setKind] = useState<Kind | null>(paramKind);
  const wide = useWide();
  // The sidebar links change ?kind= while this screen stays open: follow them
  const [seenKind, setSeenKind] = useState(paramKind);
  if (paramKind !== seenKind) {
    setSeenKind(paramKind);
    setKind(paramKind);
  }
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

  const space = useSpace();
  const [cat, setCat] = useState<Category | null>(null);
  const inView = (t: Task) => inSpace(t.category, space) && (!cat || t.category === cat);
  const open = useMemo(() => tasks.filter((t) => t.status === 'open' && (!kind || t.kind === kind) && inSpace(t.category, space)), [tasks, kind, space]);
  const counts = useMemo(() => {
    const c: Record<SpaceFilter, number> = { all: 0, work: 0, personal: 0 };
    for (const t of tasks) {
      if (t.status !== 'open') continue;
      c.all++;
      c[spaceOf(t.category)]++;
    }
    return c;
  }, [tasks]);

  /** One space's open tasks: its categories (with counts) and its tasks under time headings */
  const sections = useMemo(
    () =>
      (['work', 'personal'] as Space[])
        .filter((sp) => space === 'all' || space === sp)
        .map((sp) => {
          const mine = open.filter((t) => spaceOf(t.category) === sp);
          const cats = SPACE_CATS[sp].map((c) => ({ c, n: mine.filter((t) => t.category === c).length })).filter((x) => x.n);
          const shown = sortTasks(mine.filter((t) => !cat || t.category === cat));
          const groups = GROUP_ORDER.map((g) => ({ key: g as GroupKey, list: shown.filter((t) => groupOf(t, now) === g) })).filter((g) => g.list.length);
          return { sp, total: mine.length, cats, groups };
        })
        .filter((x) => x.total || space !== 'all'),
    [open, space, cat, now],
  );

  const doneDays = useMemo(() => {
    const done = tasks.filter((t) => t.status === 'done' && t.done_at && inView(t)).sort((a, b) => (a.done_at! < b.done_at! ? 1 : -1));
    const out: { key: string; title: string; list: Task[] }[] = [];
    for (const t of done) {
      const label = dayLabel(new Date(t.done_at!), now);
      const last = out[out.length - 1];
      if (last && last.title === label) last.list.push(t);
      else out.push({ key: label, title: label, list: [t] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, now, space, cat]);

  const kinds = { todo: 0, waiting: 0, reply: 0 } as Record<Kind, number>;
  for (const t of tasks) if (t.status === 'open' && inSpace(t.category, space)) kinds[t.kind]++;
  const toggle = (t: Task) => (t.status === 'done' ? reopen(t.id) : complete(t.id));
  const addButton = <IconButton icon="plus" label={tx('إضافة مهمة', 'Add task')} onPress={() => setSheet({ task: null })} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {wide ? <ScreenHeader title={tx('المهام', 'Tasks')} right={addButton} /> : <TabTitle title={tx('المهام', 'Tasks')} right={addButton} />}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: wide ? 16 : 20, paddingBottom: insets.bottom + (wide ? 40 : TAB_SPACE + 24), width: '100%', maxWidth: wide ? 912 : undefined, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await refresh(), setRefreshing(false))} tintColor={C.glow} />}
      >
        <SpaceSwitch counts={counts} style={{ marginTop: 8 }} />

        <View style={{ marginTop: 12, flexDirection: D.row, flexWrap: 'wrap', gap: 8 }}>
          <Chip label={tx('الكل', 'All')} on={view === 'open' && !kind} onPress={() => (setView('open'), setKind(null))} />
          {(['todo', 'waiting', 'reply'] as Kind[]).map((k) => (
            <Chip key={k} label={`${KINDS[k].label} ${kinds[k]}`} on={view === 'open' && kind === k} onPress={() => (setView('open'), setKind(kind === k ? null : k))} />
          ))}
          <Chip label={tx('المنجزة', 'Done')} icon="check-all" on={view === 'done'} onPress={() => setView(view === 'done' ? 'open' : 'done')} />
        </View>

        {view === 'open' &&
          sections.map(({ sp, total, cats, groups }) => (
            <View key={sp} style={{ marginTop: 24 }}>
              <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: SPACES[sp].soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={SPACES[sp].icon} size={18} color={SPACES[sp].color} />
                </View>
                <T w="bold" size={17}>{SPACES[sp].label}</T>
                <T size={13} color={C.sub}>{countTasks(total)}</T>
                <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
              </View>
              {cats.length > 1 && (
                <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {cats.map(({ c, n }) => {
                    const on = cat === c;
                    return (
                      <Pressable key={c} onPress={() => setCat(on ? null : c)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: on ? SPACES[sp].color : SPACES[sp].soft }}>
                        <T size={12} w="bold" color={on ? '#fff' : SPACES[sp].color}>{CATS[c].label} {n}</T>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {groups.length ? (
                <View style={{ ...cardStyle, overflow: 'hidden' }}>
                  {groups.map((g) => (
                    <View key={g.key}>
                      <T size={12} w="bold" color={g.key === 'late' ? C.lateText : C.sub} style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 }}>
                        {GROUPS[g.key].label} · {g.list.length}
                      </T>
                      {g.list.map((t, i) => (
                        <TaskRow key={t.id} task={t} now={now} last={i === g.list.length - 1} onToggle={() => toggle(t)} onOpen={() => setSheet({ task: t })} />
                      ))}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ ...cardStyle, padding: 20 }}>
                  <T size={TS.small} color={C.sub} align="center">{kind || cat ? tx('لا مهام بهذا التصفية.', 'Nothing matches this filter.') : tx('لا مهام مفتوحة هنا.', 'No open tasks here.')}</T>
                </View>
              )}
            </View>
          ))}

        {view === 'open' && !sections.length && (
          <T color={C.sub} align="center" style={{ marginTop: 48 }}>{tx('لا توجد مهام مفتوحة.', 'No open tasks.')}</T>
        )}

        {view === 'done' &&
          doneDays.map((g) => (
            <View key={g.key} style={{ marginTop: 24 }}>
              <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <T w="bold" size={TS.h2}>{g.title}</T>
                <T size={TS.small} color={C.sub}>{g.list.length}</T>
              </View>
              <View style={{ ...cardStyle, overflow: 'hidden' }}>
                {g.list.map((t, i) => (
                  <TaskRow key={t.id} task={t} now={now} last={i === g.list.length - 1} onToggle={() => toggle(t)} onOpen={() => setSheet({ task: t })} />
                ))}
              </View>
            </View>
          ))}
        {view === 'done' && !doneDays.length && (
          <T color={C.sub} align="center" style={{ marginTop: 48 }}>{tx('ستظهر هنا المهام التي تنجزها.', 'Tasks you finish will show up here.')}</T>
        )}
      </ScrollView>

      {!wide && <TabBar onMic={() => router.dismissTo({ pathname: '/', params: { rec: '1' } })} />}
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
