// Ghaith Radar pieces: keeping findings fresh (RadarSync), the home card (RadarSummary) and one finding with its
// actions (RadarFinding). Every action is a button the user presses; nothing changes a task on its own.
import { router } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { D, tx } from '../lib/i18n';
import { clearRadar, loadRadar, RadarItem, relevantDate, RISK_LABEL, SEVERITY_LABEL, unreadCount, useRadar, wording } from '../lib/radar';
import { useStore } from '../lib/store';
import { SPACES, spaceOf, Task } from '../lib/tasks';
import { useNow } from '../lib/useNow';
import { C, R, tint, TS } from '../theme';
import { Gradient, Icon, IconName, T } from '../ui';

export const SEVERITY_COLOR = { high: C.late, medium: C.amberText, low: C.glow } as const;
const RISK_ICON: Record<RadarItem['risk_type'], IconName> = {
  overdue: 'alert-circle-outline',
  due_soon: 'clock-alert-outline',
  reply_pending: 'reply-outline',
  waiting_followup: 'account-clock-outline',
  stale: 'sleep',
};

/** Loads findings when signed in, when the app comes back, every few minutes while open, and after task changes */
export function RadarSync() {
  const { status, tasks } = useStore();
  const openKey = useMemo(() => tasks.filter((t) => t.status === 'open').map((t) => t.id + t.updated_at).join(','), [tasks]);
  useEffect(() => {
    if (status === 'out') clearRadar();
    if (status !== 'in') return;
    loadRadar();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && loadRadar());
    const timer = setInterval(loadRadar, 5 * 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [status]);
  useEffect(() => {
    if (status === 'in' && openKey) loadRadar();
  }, [status, openKey]);
  return null;
}

/** Findings whose task is still open, joined with the task */
export function useRadarItems(): { list: { item: RadarItem; task: Task }[]; unread: number; lastScan: string | null; loaded: boolean } {
  const { tasks } = useStore();
  const { items, lastScan, loaded } = useRadar();
  return useMemo(() => {
    const byId = new Map(tasks.filter((t) => t.status === 'open').map((t) => [t.id, t]));
    const list = items.flatMap((item) => (byId.has(item.task_id) ? [{ item, task: byId.get(item.task_id)! }] : []));
    return { list, unread: unreadCount(items, new Set(byId.keys())), lastScan, loaded };
  }, [tasks, items, lastScan, loaded]);
}

/** "قبل 7 دقائق" / "7 min ago" */
export function agoLabel(iso: string | null, nowMs: number): string {
  if (!iso) return tx('لم يُجرَ بعد', 'not yet');
  const min = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60000));
  if (min < 1) return tx('الآن', 'just now');
  if (min < 60) return tx(min === 1 ? 'قبل دقيقة' : min === 2 ? 'قبل دقيقتين' : min <= 10 ? `قبل ${min} دقائق` : `قبل ${min} دقيقة`, `${min} min ago`);
  const h = Math.round(min / 60);
  return tx(h === 1 ? 'قبل ساعة' : h === 2 ? 'قبل ساعتين' : h <= 10 ? `قبل ${h} ساعات` : `قبل ${h} ساعة`, `${h} h ago`);
}

/** Home: what the radar found, at a glance */
export function RadarSummary({ style }: { style?: object }) {
  const { list, unread, lastScan, loaded } = useRadarItems();
  const now = useNow();
  if (!loaded) return null;
  const high = list.filter((x) => x.item.severity === 'high').length;
  const top = list[0];
  return (
    <Pressable
      onPress={() => router.push('/radar')}
      accessibilityRole="button"
      accessibilityLabel={tx('رادار غيث', 'Ghaith Radar')}
      style={({ pressed }) => ({ marginTop: 12, borderRadius: R.card, overflow: 'hidden', opacity: pressed ? 0.92 : 1, ...style })}
    >
      <Gradient colors={[C.indigo, C.indigoHi]} angle="diagonal" />
      <View style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="radar" size={21} color={C.teal} />
            {unread > 0 && <View style={{ position: 'absolute', top: 4, [D.end]: 4, width: 9, height: 9, borderRadius: 5, backgroundColor: C.late, borderWidth: 1.5, borderColor: C.indigo }} />}
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" color="#fff">{tx('رادار غيث', 'Ghaith Radar')}</T>
            <T size={TS.tiny} color="rgba(255,255,255,0.7)">
              {list.length
                ? tx(`${list.length} ${list.length === 1 ? 'مهمة تحتاج' : list.length === 2 ? 'مهمتان تحتاجان' : 'مهام تحتاج'} انتباهك${high ? ` · ${high} عاجلة` : ''}`, `${list.length} need${list.length === 1 ? 's' : ''} your attention${high ? ` · ${high} urgent` : ''}`)
                : tx('لا شيء يحتاج انتباهك الآن', 'Nothing needs your attention now')}
              {' · '}
              {tx('آخر فحص', 'Last check')} {agoLabel(lastScan, now.getTime())}
            </T>
          </View>
          {unread > 0 && (
            <View style={{ minWidth: 24, height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: C.late, alignItems: 'center', justifyContent: 'center' }}>
              <T w="bold" size={TS.tiny} color="#fff">{unread}</T>
            </View>
          )}
          <Icon name={D.fwd} size={20} color="rgba(255,255,255,0.7)" />
        </View>
        {top && (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, gap: 3 }}>
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: SEVERITY_COLOR[top.item.severity] === C.amberText ? C.amber : SEVERITY_COLOR[top.item.severity] }} />
              <T size={TS.tiny} w="medium" color="rgba(255,255,255,0.8)">{RISK_LABEL[top.item.risk_type]()}</T>
            </View>
            <T w="medium" size={TS.small} color="#fff" numberOfLines={1}>{top.task.title}</T>
            <T size={TS.tiny} color="rgba(255,255,255,0.75)" numberOfLines={2}>{wording(top.item).reason}</T>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function ActionButton({ icon, label, onPress, tone = 'quiet' }: { icon: IconName; label: string; onPress: () => void; tone?: 'main' | 'quiet' }) {
  const main = tone === 'main';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: D.row,
        alignItems: 'center',
        gap: 5,
        height: 34,
        paddingHorizontal: 12,
        borderRadius: R.pill,
        backgroundColor: main ? (pressed ? C.indigoHi : C.indigo) : pressed || hovered ? C.surfaceAlt : C.bg,
        borderWidth: main ? 0 : 1,
        borderColor: C.line,
      })}
    >
      <Icon name={icon} size={16} color={main ? '#fff' : C.indigo} />
      <T size={TS.small} w="medium" color={main ? '#fff' : C.indigo}>{label}</T>
    </Pressable>
  );
}

/** One finding: why it needs attention, the suggested step, and what the user can do about it */
export function RadarFinding({ item, task, onOpen, onDone, onPostpone, onDismiss, onAsk }: { item: RadarItem; task: Task; onOpen: () => void; onDone: () => void; onPostpone: () => void; onDismiss: () => void; onAsk: () => void }) {
  const color = SEVERITY_COLOR[item.severity];
  const w = wording(item);
  const when = relevantDate(item);
  const unread = item.status === 'new';
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: R.card, overflow: 'hidden', borderWidth: 1, borderColor: item.severity === 'high' ? tint(C.late, 0.35) : C.line }}>
      <View style={{ position: 'absolute', top: 0, bottom: 0, [D.start]: 0, width: 4, backgroundColor: color }} />
      <View style={{ padding: 16, [D.rtl ? 'paddingRight' : 'paddingLeft']: 20, gap: 10 }}>
        <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: D.row, alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: R.pill, backgroundColor: tint(color, 0.12) }}>
            <Icon name={RISK_ICON[item.risk_type]} size={13} color={color} />
            <T size={TS.tiny} w="bold" color={color}>{SEVERITY_LABEL[item.severity]()} · {RISK_LABEL[item.risk_type]()}</T>
          </View>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: SPACES[spaceOf(task.category)].soft }}>
            <T size={TS.tiny} w="bold" color={SPACES[spaceOf(task.category)].color}>{spaceOf(task.category) === 'work' ? tx('عمل', 'Work') : tx('شخصي', 'Personal')}</T>
          </View>
          {!!when && (
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 4 }}>
              <Icon name="calendar-blank-outline" size={13} color={C.sub} />
              <T size={TS.tiny} color={C.sub}>{when}</T>
            </View>
          )}
          {unread && <View style={{ marginStart: 'auto', width: 8, height: 8, borderRadius: 4, backgroundColor: C.glow }} accessibilityLabel={tx('جديد', 'New')} />}
        </View>
        <Pressable onPress={onOpen} accessibilityRole="link">
          <T w="bold" size={15.5} numberOfLines={2} style={{ lineHeight: 24 }}>{task.title}</T>
        </Pressable>
        <T size={TS.small} color={C.sub} style={{ lineHeight: 21, marginTop: -4 }}>{w.reason}</T>
        <View style={{ flexDirection: D.row, gap: 8, backgroundColor: tint(C.glow, 0.07), borderRadius: 14, padding: 10 }}>
          <View style={{ paddingTop: 2 }}>
            <Icon name={w.fromAI ? 'creation' : 'lightbulb-on-outline'} size={16} color={C.glow} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <T size={TS.tiny} w="bold" color={C.glow}>{w.fromAI ? tx('اقتراح غيث', 'Ghaith suggests') : tx('الخطوة التالية', 'Next step')}</T>
            <T size={TS.small} style={{ lineHeight: 21 }}>{w.step}</T>
          </View>
        </View>
        <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 8 }}>
          <ActionButton tone="main" icon="creation" label={tx('اسأل غيث', 'Ask Ghaith')} onPress={onAsk} />
          <ActionButton icon="check" label={tx('أُنجزت', 'Done')} onPress={onDone} />
          <ActionButton icon="calendar-arrow-right" label={tx('أجّل للغد', 'Tomorrow')} onPress={onPostpone} />
          <ActionButton icon="close" label={tx('تجاهل', 'Dismiss')} onPress={onDismiss} />
        </View>
      </View>
    </View>
  );
}
