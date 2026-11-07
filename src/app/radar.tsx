// Ghaith Radar: what the scheduled scan found that needs attention, most important first, grouped by how urgent it
// is, with what to do about it. Opening the screen marks new findings as seen.
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { agoLabel, RadarFinding, SEVERITY_COLOR, useRadarItems } from '../components/Radar';
import { ScreenHeader } from '../components/ScreenHeader';
import { TaskSheet } from '../components/TaskSheet';
import { D, tx } from '../lib/i18n';
import { askFor, dismiss, loadRadar, markActed, markSeen, RadarItem, runCheck, SEVERITY_LABEL } from '../lib/radar';
import { useStore } from '../lib/store';
import { addDays, atTime, startOfDay, Task } from '../lib/tasks';
import { useNow } from '../lib/useNow';
import { useWide } from '../lib/useWide';
import { C, R, tint, TS } from '../theme';
import { Card, Gradient, Icon, PrimaryButton, T } from '../ui';

export default function Radar() {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { complete, save } = useStore();
  const { list, lastScan, loaded } = useRadarItems();
  const [open, setOpen] = useState<Task | null>(null);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow();

  // Seen once the screen is shown (only findings already past the quiet hours)
  useFocusEffect(
    useCallback(() => {
      const ids = list.filter((x) => x.item.status === 'new' && Date.parse(x.item.notify_after) <= Date.now()).map((x) => x.item.id);
      if (ids.length) {
        const t = setTimeout(() => markSeen(ids), 1500);
        return () => clearTimeout(t);
      }
    }, [list]),
  );

  const check = async () => {
    setChecking(true);
    setNote('');
    const r = await runCheck();
    setChecking(false);
    setNote(r.ok ? (r.created ? tx(`وجد الفحص ${r.created} ${r.created === 1 ? 'أمراً جديداً' : 'أموراً جديدة'}.`, `The check found ${r.created} new item${r.created === 1 ? '' : 's'}.`) : tx('اكتمل الفحص، لا جديد.', 'Check complete, nothing new.')) : r.message);
  };

  const postpone = async (item: RadarItem, task: Task) => {
    const morning = atTime(addDays(startOfDay(new Date()), 1), 9);
    const due = task.due_at ? new Date(task.due_at) : null;
    // A deadline that has passed (or falls before tomorrow morning) moves to the end of tomorrow's working day
    const nextDue = due && due < morning ? atTime(addDays(startOfDay(new Date()), 1), 17) : due;
    await save(task.id, { remind_at: morning.toISOString(), due_at: nextDue ? nextDue.toISOString() : null });
    markActed(item.id);
  };

  const groups = (['high', 'medium', 'low'] as const).map((sev) => ({ sev, rows: list.filter((x) => x.item.severity === sev) })).filter((g) => g.rows.length);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={tx('رادار غيث', 'Ghaith Radar')} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40, width: '100%', maxWidth: wide ? 880 : undefined, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await loadRadar(), setRefreshing(false))} tintColor={C.glow} />}
      >
        {/* What the radar is, when it last looked, and "check now" for demos */}
        <View style={{ borderRadius: R.big, overflow: 'hidden' }}>
          <Gradient colors={[C.indigo, C.indigoHi]} angle="diagonal" />
          <View style={{ padding: 18, gap: 12 }}>
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="radar" size={26} color={C.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <T w="bold" size={TS.h2} color="#fff">{tx('ما يحتاج انتباهك', 'Your attention is needed')}</T>
                <T size={TS.small} color="rgba(255,255,255,0.75)">
                  {tx('يراقب غيث مهامك على الخادم كل 15 دقيقة، حتى والتطبيق مغلق.', 'Ghaith checks your tasks on the server every 15 minutes, even with the app closed.')}
                </T>
              </View>
            </View>
            <View style={{ flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: D.row, alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: lastScan && now.getTime() - Date.parse(lastScan) < 40 * 60000 ? C.teal : C.amber }} />
                <T size={TS.tiny} color="rgba(255,255,255,0.8)">{tx('آخر فحص تلقائي', 'Last automatic check')}: {agoLabel(lastScan, now.getTime())}</T>
              </View>
              <PrimaryButton label={tx('افحص الآن', 'Check now')} icon="radar" onPress={check} busy={checking} style={{ minWidth: 140 }} />
            </View>
            {!!note && <T size={TS.small} color="#fff">{note}</T>}
          </View>
        </View>

        {loaded && !list.length && (
          <Card style={{ padding: 28, alignItems: 'center', marginTop: 20, gap: 6 }}>
            <Icon name="shield-check-outline" size={34} color={C.teal} />
            <T w="bold" align="center">{tx('لا شيء يحتاج انتباهك الآن', 'Nothing needs your attention right now')}</T>
            <T size={TS.small} color={C.sub} align="center">{tx('سينبّهك غيث هنا حين تقترب مهمة من موعدها، أو تتأخر، أو يطول انتظارك لأحد.', 'Ghaith will flag tasks here when a deadline gets close, slips, or you have been waiting on someone too long.')}</T>
          </Card>
        )}

        {groups.map((g) => (
          <View key={g.sev} style={{ marginTop: 24, gap: 12 }}>
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SEVERITY_COLOR[g.sev] }} />
              <T w="bold" size={TS.h2} color={g.sev === 'high' ? C.late : C.text}>{SEVERITY_LABEL[g.sev]()}</T>
              <View style={{ paddingHorizontal: 8, borderRadius: R.pill, backgroundColor: tint(SEVERITY_COLOR[g.sev], 0.12) }}>
                <T size={TS.tiny} w="bold" color={SEVERITY_COLOR[g.sev]}>{g.rows.length}</T>
              </View>
            </View>
            {g.rows.map(({ item, task }) => (
              <RadarFinding
                key={item.id}
                item={item}
                task={task}
                onOpen={() => setOpen(task)}
                onDone={async () => (await complete(task.id), markActed(item.id))}
                onPostpone={() => postpone(item, task)}
                onDismiss={() => dismiss(item.id)}
                onAsk={() => router.push({ pathname: '/chat', params: { ask: askFor(item, task.title) } })}
              />
            ))}
          </View>
        ))}

        <T size={TS.tiny} color={C.faint} align="center" style={{ marginTop: 24 }}>
          {tx('الرادار لا يُنجز ولا يؤجّل ولا يرسل شيئاً بنفسه: أنت من يقرر.', 'The radar never completes, postpones or sends anything by itself: you decide.')}
        </T>
      </ScrollView>
      {open && <TaskSheet task={open} onClose={() => setOpen(null)} />}
    </View>
  );
}
