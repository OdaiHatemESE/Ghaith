// Desktop navigation: the mark, the main places, and counts that matter at a glance.
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import Constants from 'expo-constants';
import React from 'react';
import { Pressable, View } from 'react-native';
import { D, tx } from '../lib/i18n';
import { useStore } from '../lib/store';
import { groupOf } from '../lib/tasks';
import { useNow } from '../lib/useNow';
import { C, R, tint, TS } from '../theme';
import { Icon, IconName, T } from '../ui';
import { versionLabel } from './AutoUpdate';
import { Logo } from './Logo';

function Item({ icon, label, active, count, countColor, onPress }: { icon: IconName; label: string; active: boolean; count?: number; countColor?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: D.row,
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: active ? tint(C.glow, 0.1) : pressed || hovered ? C.bg : 'transparent',
      })}
    >
      <Icon name={icon} size={20} color={active ? C.glow : C.sub} />
      <T w={active ? 'semibold' : 'regular'} color={active ? C.indigo : C.text} style={{ flex: 1 }}>{label}</T>
      {!!count && (
        <View style={{ minWidth: 24, paddingHorizontal: 7, height: 22, borderRadius: 11, backgroundColor: tint(countColor ?? C.sub, 0.12), alignItems: 'center', justifyContent: 'center' }}>
          <T w="semibold" size={TS.tiny} color={countColor ?? C.sub} align="center">{count}</T>
        </View>
      )}
    </Pressable>
  );
}

export function Sidebar() {
  const { tasks, name, signOut } = useStore();
  const now = useNow();
  const path = usePathname();
  const { kind } = useGlobalSearchParams<{ kind?: string }>();
  const open = tasks.filter((t) => t.status === 'open');
  const late = open.filter((t) => groupOf(t, now) === 'late').length;
  const waiting = open.filter((t) => t.kind === 'waiting').length;
  const replies = open.filter((t) => t.kind === 'reply').length;
  const onTasks = path.endsWith('/tasks');

  return (
    <View style={{ width: 260, backgroundColor: C.surface, [D.rtl ? 'borderLeftWidth' : 'borderRightWidth']: 1, borderColor: C.line, paddingHorizontal: 14, paddingTop: 24, paddingBottom: 18 }}>
      <View style={{ paddingHorizontal: 8, marginBottom: 28 }}>
        <Logo size={34} />
        <T size={TS.tiny} color={C.faint} style={{ marginTop: 4 }}>{tx('مساعد المهام والتذكير', 'AI task & reminder assistant')}</T>
      </View>

      <View style={{ gap: 4 }}>
        <Item icon="view-dashboard-outline" label={tx('الرئيسية', 'Home')} active={path === '/' || path === ''} count={late} countColor={C.late} onPress={() => router.navigate('/')} />
        <Item icon="format-list-checks" label={tx('كل المهام', 'All tasks')} active={onTasks && !kind} count={open.length} onPress={() => router.navigate('/tasks')} />
        <Item icon="timer-sand" label={tx('بانتظار رد', 'Waiting on')} active={onTasks && kind === 'waiting'} count={waiting} countColor={C.glow} onPress={() => router.navigate({ pathname: '/tasks', params: { kind: 'waiting' } })} />
        <Item icon="reply" label={tx('بحاجة إلى رد', 'Needs reply')} active={onTasks && kind === 'reply'} count={replies} countColor={C.tealDeep} onPress={() => router.navigate({ pathname: '/tasks', params: { kind: 'reply' } })} />
      </View>

      <View style={{ height: 1, backgroundColor: C.line, marginVertical: 16, marginHorizontal: 8 }} />
      <Item icon="tune-variant" label={tx('الإعدادات', 'Settings')} active={path.endsWith('/settings')} onPress={() => router.navigate('/settings')} />

      <View style={{ flex: 1 }} />
      <View style={{ borderRadius: R.card, backgroundColor: C.bg, padding: 14, gap: 2 }}>
        <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tint(C.indigo, 0.1), alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="account-outline" size={19} color={C.indigo} />
          </View>
          <T w="medium" style={{ flex: 1 }} numberOfLines={1}>{name || tx('حسابي', 'My account')}</T>
          <Pressable onPress={() => signOut()} hitSlop={8} accessibilityLabel={tx('تسجيل الخروج', 'Sign out')}>
            <Icon name="logout" size={18} color={C.faint} />
          </Pressable>
        </View>
        <T size={TS.tiny} color={C.faint}>{versionLabel(Constants.expoConfig?.version ?? '1.0.0')}</T>
      </View>
    </View>
  );
}
