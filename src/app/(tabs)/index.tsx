import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '../../components/Logo';
import { TaskRow } from '../../components/TaskRow';
import { useStore } from '../../lib/store';
import { CAT_ORDER, Category, CATS, greeting, GroupKey, groupOf, GROUPS, Kind, KIND_ORDER, KINDS, longDate, sortTasks } from '../../lib/tasks';
import { useUi } from '../../lib/uiContext';
import { useNow } from '../../lib/useNow';
import { C, TS } from '../../theme';
import { Card, Chip, HScroll, Icon, T } from '../../ui';

const ORDER: GroupKey[] = ['late', 'today', 'tomorrow', 'week', 'later', 'someday'];

const EXAMPLES = [
  'ذكّرني بكرة الصبح أرد على إيميل المدير',
  'بعتت لأحمد طلب الصلاحيات وناطر رده',
  'لازم أجدد تأمين السيارة قبل آخر الشهر',
  'شو عندي اليوم؟',
];

function Stat({ n, label, color, on, onPress }: { n: number; label: string; color: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{ flex: 1, backgroundColor: on ? '#fff' : C.nightSoft, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: on ? '#fff' : C.nightLine }}
    >
      <T w="bold" size={24} color={on ? C.night : '#fff'} style={{ lineHeight: 30 }}>{n}</T>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
        <T size={TS.tiny} color={on ? C.sub : C.mist}>{label}</T>
      </View>
    </Pressable>
  );
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { name, tasks, messages, loaded, refresh, complete } = useStore();
  const { talk, openTask } = useUi();
  const [kind, setKind] = useState<Kind | null>(null);
  const [cat, setCat] = useState<Category | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow();

  const open = useMemo(() => tasks.filter((t) => t.status === 'open'), [tasks]);
  const counts = useMemo(() => {
    const c = { todo: 0, waiting: 0, reply: 0, late: 0, today: 0 };
    for (const t of open) {
      c[t.kind]++;
      const g = groupOf(t, now);
      if (g === 'late') c.late++;
      if (g === 'today') c.today++;
    }
    return c;
  }, [open, now]);

  const shown = useMemo(() => open.filter((t) => (!kind || t.kind === kind) && (!cat || t.category === cat)), [open, kind, cat]);
  const groups = useMemo(() => {
    const m = new Map<GroupKey, typeof shown>();
    for (const t of sortTasks(shown)) {
      const g = groupOf(t, now);
      m.set(g, [...(m.get(g) ?? []), t]);
    }
    return ORDER.filter((g) => m.has(g)).map((g) => ({ key: g, list: m.get(g)! }));
  }, [shown, now]);
  const usedCats = CAT_ORDER.filter((c) => open.some((t) => t.category === c));

  const lastReply = [...messages].reverse().find((m) => m.role === 'assistant');
  const recent = lastReply && now.getTime() - new Date(lastReply.created_at).getTime() < 6 * 3600000;

  const summary = !open.length
    ? 'ما في شيء مفتوح. احكيلي أي شيء على بالك.'
    : [counts.today && `${counts.today} لليوم`, counts.late && `${counts.late} متأخر`].filter(Boolean).join(' و') || 'ما في شيء مستعجل اليوم';

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.rainLight} />}
    >
      <View style={{ backgroundColor: C.night, paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
            <Logo size={36} />
            <View>
              <T size={TS.small} color={C.mist}>{longDate(now)}</T>
              <T w="bold" size={TS.h2} color="#fff">{greeting(now)}{name ? `، ${name}` : ''}</T>
            </View>
          </View>
          <Pressable
            onPress={() => openTask(null)}
            accessibilityLabel="أضف مهمة بإيدك"
            hitSlop={8}
            style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: pressed ? C.nightLine : C.nightSoft, alignItems: 'center', justifyContent: 'center' })}
          >
            <Icon name="plus" size={22} color="#fff" />
          </Pressable>
        </View>

        <T w="medium" size={TS.body} color={counts.late ? '#FFB3BD' : C.rainLight} style={{ marginTop: 14 }}>{summary}</T>

        <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 12 }}>
          {KIND_ORDER.map((k) => (
            <Stat key={k} n={counts[k]} label={KINDS[k].label} color={KINDS[k].color} on={kind === k} onPress={() => setKind(kind === k ? null : k)} />
          ))}
        </View>

        {recent && lastReply && (
          <Pressable
            onPress={() => router.navigate('/chat')}
            style={{ marginTop: 14, flexDirection: 'row-reverse', gap: 10, backgroundColor: C.nightSoft, borderRadius: 16, padding: 12, alignItems: 'flex-start' }}
          >
            <Icon name="water" size={18} color={C.rainLight} />
            <T size={TS.small} color={C.mist} style={{ flex: 1 }} numberOfLines={3}>{lastReply.content}</T>
          </Pressable>
        )}
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        {usedCats.length > 1 && (
          <View style={{ marginTop: 16 }}>
            <HScroll>
              <Chip label="الكل" on={!cat} onPress={() => setCat(null)} />
              {usedCats.map((c) => (
                <Chip key={c} label={CATS[c].label} icon={CATS[c].icon} color={CATS[c].color} on={cat === c} onPress={() => setCat(cat === c ? null : c)} />
              ))}
            </HScroll>
          </View>
        )}

        {groups.map((g) => (
          <View key={g.key} style={{ marginTop: 20 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 4 }}>
              <T w="bold" size={TS.h2} color={g.key === 'late' ? C.late : C.text}>{GROUPS[g.key]}</T>
              <View style={{ backgroundColor: g.key === 'late' ? C.lateWash : C.line, borderRadius: 10, paddingHorizontal: 8 }}>
                <T size={TS.tiny} w="semibold" color={g.key === 'late' ? C.late : C.sub}>{g.list.length}</T>
              </View>
            </View>
            <Card>
              {g.list.map((t, i) => (
                <TaskRow key={t.id} task={t} last={i === g.list.length - 1} onToggle={() => complete(t.id)} onOpen={() => openTask(t)} />
              ))}
            </Card>
          </View>
        ))}

        {loaded && !open.length && (
          <View style={{ alignItems: 'center', marginTop: 36, paddingHorizontal: 12 }}>
            <Logo size={64} />
            <T w="bold" size={TS.h2} align="center" style={{ marginTop: 14 }}>احكيلي شو عندك</T>
            <T size={TS.small} color={C.sub} align="center" style={{ marginTop: 4 }}>اضغط المايك تحت واحكي طبيعي، أنا بفهم وبرتّب. مثلاً:</T>
            <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 16 }}>
              {EXAMPLES.map((e) => (
                <View key={e} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: 14, padding: 12 }}>
                  <Icon name="format-quote-open" size={18} color={C.rain} />
                  <T size={TS.small} style={{ flex: 1 }}>{e}</T>
                </View>
              ))}
            </View>
            <Pressable onPress={() => talk('voice')} style={{ marginTop: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.rain, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 }}>
              <Icon name="microphone" size={20} color="#fff" />
              <T w="bold" color="#fff">احكي مع غيث</T>
            </Pressable>
          </View>
        )}

        {loaded && !!open.length && !shown.length && (
          <T color={C.sub} align="center" style={{ marginTop: 30 }}>ما في مهام بهالفلتر.</T>
        )}
      </View>
    </ScrollView>
  );
}
