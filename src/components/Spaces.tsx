// The pieces of the organised layout: the work / personal switch, a task's space tag, the progress ring, what needs
// attention (Radar findings and emails in one list), and the phone's bottom bar, the only navigation on the phone.
import { router, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { D, getLang, tx } from '../lib/i18n';
import { useInbox } from '../lib/inbox';
import { RadarItem, wording } from '../lib/radar';
import { setSpace, SpaceFilter, useSpace } from '../lib/space';
import { Space, SPACES, spaceOf, Task } from '../lib/tasks';
import { C, F, R } from '../theme';
import { Icon, IconName, T } from '../ui';
import { useRadarItems } from './Radar';

/** All · Work · Personal, with how many open tasks each holds */
export function SpaceSwitch({ counts, style }: { counts?: Record<SpaceFilter, number>; style?: object }) {
  const space = useSpace();
  const options: [SpaceFilter, string][] = [['all', tx('الكل', 'All')], ['work', tx('العمل', 'Work')], ['personal', tx('الشخصي', 'Personal')]];
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: D.row, backgroundColor: '#E9EBF3', borderRadius: 14, padding: 4, gap: 4 }, style]}>
      {options.map(([k, label]) => {
        const on = k === space;
        const tone = k === 'personal' ? SPACES.personal : SPACES.work;
        return (
          <Pressable
            key={k}
            onPress={() => setSpace(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              height: 40,
              borderRadius: 11,
              flexDirection: D.row,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              backgroundColor: on ? C.surface : 'transparent',
              ...(on ? { shadowColor: C.indigo, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } : null),
            }}
          >
            <T size={14} w="bold" color={on ? C.indigo : C.sub}>{label}</T>
            {counts && (
              <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? (k === 'all' ? SPACES.work.soft : tone.soft) : '#DCDFEA' }}>
                <T size={11} w="bold" color={on ? (k === 'all' ? SPACES.work.color : tone.color) : C.sub}>{counts[k]}</T>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** "عمل" / "شخصي" in the space's colour */
export function SpaceTag({ category }: { category: string }) {
  const s = SPACES[spaceOf(category)];
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: s.soft }}>
      <T size={11} w="bold" color={s.color}>{spaceOf(category) === 'work' ? tx('عمل', 'Work') : tx('شخصي', 'Personal')}</T>
    </View>
  );
}

/** A ring filled to `pct`, with the percentage in the middle */
export function Ring({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={tx(`أنجزت ${pct}٪`, `${pct}% done`)}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#EDEEF6" strokeWidth={7} fill="none" />
        {pct > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={7}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(c * pct) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      <T w="bold" size={14} color={C.indigo} style={{ fontFamily: F.num }}>{getLang() === 'en' ? `${pct}%` : `${pct}٪`}</T>
    </View>
  );
}

// ---------------------------------------------------------------- what needs attention
export type Attention = { key: string; source: 'radar' | 'mail'; title: string; reason: string; action: string; space: Space; tone: string; soft: string; rank: number };

const ACTION: Record<string, () => string> = {
  waiting_followup: () => tx('تابِع', 'Follow up'),
  reply_pending: () => tx('رُدّ', 'Reply'),
  overdue: () => tx('رتّبها', 'Sort it'),
  due_soon: () => tx('ابدأ', 'Start'),
  stale: () => tx('راجِع', 'Review'),
};
const SEV_RANK = { high: 0, medium: 2, low: 3 } as const;
const SEV_TONE = { high: [C.lateText, '#FDECEF'], medium: [C.amberText, '#FFF4E0'], low: [C.sub, C.surfaceAlt] } as const;

/** Radar findings and emails waiting for review, most urgent first, within the space filter */
export function useAttention(): Attention[] {
  const { list } = useRadarItems();
  const { items } = useInbox();
  const space = useSpace();
  const out: Attention[] = [];
  for (const { item, task } of list as { item: RadarItem; task: Task }[]) {
    const [tone, soft] = SEV_TONE[item.severity];
    out.push({ key: item.id, source: 'radar', title: task.title, reason: wording(item).reason, action: (ACTION[item.risk_type] ?? ACTION.stale)(), space: spaceOf(task.category), tone, soft, rank: SEV_RANK[item.severity] });
  }
  for (const m of items) {
    const first = m.proposals.find((p) => p.op === 'add');
    const n = m.proposals.length;
    out.push({
      key: m.id,
      source: 'mail',
      title: m.sender_name || m.sender,
      reason: m.status === 'failed' ? tx('تعذّرت قراءته', 'Could not be read') : n ? tx(`اقترح غيث ${n === 1 ? 'مهمة' : n === 2 ? 'مهمتين' : `${n} مهام`}`, `Ghaith proposes ${n}`) : (m.subject ?? ''),
      action: tx('راجِع', 'Review'),
      space: first && first.op === 'add' ? spaceOf(first.task.category) : 'work',
      tone: C.glowText,
      soft: '#EFEBFF',
      rank: 1,
    });
  }
  return out.filter((a) => space === 'all' || a.space === space).sort((a, b) => a.rank - b.rank);
}

/** One row of the attention list: what, why, and the one thing to do */
export function AttentionRow({ a, last, onPress }: { a: Attention; last: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: D.row, alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line, backgroundColor: pressed ? C.bg : 'transparent' })}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: a.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={a.source === 'mail' ? 'email-outline' : 'radar'} size={20} color={a.tone} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T w="bold" size={14} numberOfLines={1}>{a.title}</T>
        <T size={12} color={C.sub} numberOfLines={1}>{a.source === 'mail' ? tx('بريد', 'Email') : tx('الرادار', 'Radar')} · {a.reason}</T>
      </View>
      <View style={{ height: 32, paddingHorizontal: 13, borderRadius: 16, backgroundColor: '#EEF0FB', justifyContent: 'center' }}>
        <T size={13} w="bold" color={C.indigo}>{a.action}</T>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- phone navigation
type Tab = { path: '/' | '/tasks' | '/radar' | '/chat'; icon: IconName; on: IconName; label: () => string };
const TABS: Tab[] = [
  { path: '/', icon: 'home-outline', on: 'home', label: () => tx('الرئيسية', 'Home') },
  { path: '/tasks', icon: 'format-list-checks', on: 'format-list-checks', label: () => tx('المهام', 'Tasks') },
  { path: '/radar', icon: 'radar', on: 'radar', label: () => tx('الرادار', 'Radar') },
  { path: '/chat', icon: 'message-text-outline', on: 'message-text', label: () => tx('المحادثة', 'Chat') },
];

/** Switches tab: home is the bottom of the stack; the others replace each other above it */
export function goTab(path: Tab['path'], current: string) {
  if (path === current) return;
  if (path === '/') return router.dismissTo('/');
  if (current === '/') return router.push(path);
  router.replace(path);
}

/** The phone's bottom bar: Home · Tasks · (talk to Ghaith) · Radar · Chat */
export function TabBar({ onMic }: { onMic: () => void }) {
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const attention = useAttention().length;
  const tab = (t: Tab) => {
    const on = path === t.path;
    return (
      <Pressable key={t.path} onPress={() => goTab(t.path, path)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label()} style={{ flex: 1, alignItems: 'center', gap: 3, paddingTop: 10 }}>
        <View>
          <Icon name={on ? t.on : t.icon} size={24} color={on ? C.indigo : C.sub} />
          {t.path === '/radar' && attention > 0 && (
            <View style={{ position: 'absolute', top: -5, [D.end]: -10, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: C.lateText, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.surface }}>
              <T size={10} w="bold" color="#fff">{attention}</T>
            </View>
          )}
        </View>
        <T size={11} w={on ? 'bold' : 'medium'} color={on ? C.indigo : C.sub}>{t.label()}</T>
      </Pressable>
    );
  };
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, flexDirection: D.row, alignItems: 'flex-start', height: 66 + insets.bottom }}>
      {tab(TABS[0])}
      {tab(TABS[1])}
      <View style={{ width: 84, alignItems: 'center' }}>
        <Pressable
          onPress={onMic}
          accessibilityRole="button"
          accessibilityLabel={tx('تحدّث مع غيث', 'Talk to Ghaith')}
          style={({ pressed }) => ({
            marginTop: -26,
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: pressed ? C.indigoHi : C.indigo,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 4,
            borderColor: C.bg,
            shadowColor: C.indigo,
            shadowOpacity: 0.28,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          })}
        >
          <Icon name="microphone" size={28} color="#fff" />
        </Pressable>
      </View>
      {tab(TABS[2])}
      {tab(TABS[3])}
    </View>
  );
}

/** Space the bottom bar takes, for a screen's scroll padding */
export const TAB_SPACE = 96;

/** Big phone title for a tab screen (no back arrow: the bottom bar moves between them) */
export function TabTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: 6, flexDirection: D.row, alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <T w="bold" size={26} color={C.indigo} style={{ lineHeight: 36 }}>{title}</T>
        {!!sub && <T size={13} color={C.sub}>{sub}</T>}
      </View>
      {right}
    </View>
  );
}

/** The plain card of the organised layout: white, a hairline border, no shadow */
export const cardStyle = { backgroundColor: C.surface, borderRadius: R.card, borderWidth: 1, borderColor: C.line } as const;
