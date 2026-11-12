// Desktop navigation, in the brand's deep indigo: the mark, the four places (home, tasks, radar, chat), the two
// spaces (work, personal) with their open counts, and the account at the bottom.
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import Constants from 'expo-constants';
import React from 'react';
import { Pressable, View } from 'react-native';
import { D, tx } from '../lib/i18n';
import { useMeetings } from '../lib/meetings';
import { setSpace, SpaceFilter, useSpace } from '../lib/space';
import { useStore } from '../lib/store';
import { SPACES, spaceOf } from '../lib/tasks';
import { C, R, TS } from '../theme';
import { Icon, IconName, T } from '../ui';
import { versionLabel } from './AutoUpdate';
import { Mark } from './Logo';
import { useAttention } from './Spaces';

const ON_DARK = '#D5D8F5';

function Item({ icon, label, active, count, alert, onPress }: { icon: IconName; label: string; active: boolean; count?: number; alert?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: D.row,
        alignItems: 'center',
        gap: 12,
        height: 44,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: active ? 'rgba(255,255,255,0.13)' : pressed || hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
      })}
    >
      <Icon name={icon} size={20} color={active ? '#fff' : ON_DARK} />
      <T w={active ? 'bold' : 'medium'} color={active ? '#fff' : ON_DARK} style={{ flex: 1 }}>{label}</T>
      {!!count && (
        <View style={{ minWidth: 22, paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: alert ? C.late : 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <T w="bold" size={TS.tiny} color="#fff" align="center">{count}</T>
        </View>
      )}
    </Pressable>
  );
}

function SpaceItem({ k, label, dot, count }: { k: SpaceFilter; label: string; dot: string; count: number }) {
  const space = useSpace();
  const on = space === k;
  return (
    <Pressable
      onPress={() => setSpace(on ? 'all' : k)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: D.row,
        alignItems: 'center',
        gap: 10,
        height: 40,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: on ? 'rgba(255,255,255,0.13)' : pressed || hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
      })}
    >
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: dot }} />
      <T w={on ? 'bold' : 'medium'} color={on ? '#fff' : ON_DARK} style={{ flex: 1 }}>{label}</T>
      <T size={TS.small} color="#A9AEE0">{count}</T>
    </Pressable>
  );
}

export function Sidebar() {
  const { tasks, name } = useStore();
  const path = usePathname();
  // Meetings or the learning notebook: from the list's switch, or the kind of the session open
  const q = useGlobalSearchParams<{ kind?: string; id?: string }>();
  const { list: sessions } = useMeetings();
  const notes = path.endsWith('/meetings') || path.endsWith('/meeting');
  const learningOpen = q.kind === 'learning' || (!!q.id && sessions.find((m) => m.id === q.id)?.kind === 'learning');
  const open = tasks.filter((t) => t.status === 'open');
  const work = open.filter((t) => spaceOf(t.category) === 'work').length;
  const attention = useAttention().length;
  const at = (p: string) => path === p || path.endsWith(p);

  return (
    <View style={{ width: 252, backgroundColor: C.indigo, paddingHorizontal: 16, paddingTop: 26, paddingBottom: 18 }}>
      <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 6 }}>
        <Mark size={36} />
        <T w="bold" size={22} color="#fff">{tx('غيث', 'Ghaith')}</T>
      </View>
      <T size={TS.tiny} color="#A9AEE0" style={{ paddingHorizontal: 8, marginBottom: 24 }}>{tx('مساعد المهام والتذكير', 'AI task & reminder assistant')}</T>

      <View style={{ gap: 4 }}>
        <Item icon="home-outline" label={tx('الرئيسية', 'Home')} active={path === '/' || path === ''} onPress={() => router.navigate('/')} />
        <Item icon="format-list-checks" label={tx('المهام', 'Tasks')} active={at('/tasks')} count={open.length} onPress={() => router.navigate('/tasks')} />
        <Item icon="radar" label={tx('الرادار', 'Radar')} active={at('/radar')} count={attention} alert onPress={() => router.navigate('/radar')} />
        <Item icon="message-text-outline" label={tx('المحادثة', 'Chat')} active={at('/chat')} onPress={() => router.navigate('/chat')} />
        <Item icon="account-group-outline" label={tx('الاجتماعات', 'Meetings')} active={notes && !learningOpen} onPress={() => router.navigate({ pathname: '/meetings', params: { kind: 'meeting' } })} />
        <Item icon="school-outline" label={tx('دفتر التعلّم', 'Learning notebook')} active={notes && learningOpen} onPress={() => router.navigate({ pathname: '/meetings', params: { kind: 'learning' } })} />
      </View>

      <T size={TS.tiny} w="bold" color="#A9AEE0" style={{ marginTop: 26, marginBottom: 6, paddingHorizontal: 12 }}>{tx('المساحات', 'Spaces')}</T>
      <View style={{ gap: 2 }}>
        <SpaceItem k="work" label={SPACES.work.label} dot="#8E95FF" count={work} />
        <SpaceItem k="personal" label={SPACES.personal.label} dot={C.teal} count={open.length - work} />
      </View>

      <View style={{ flex: 1 }} />
      <Pressable
        onPress={() => router.navigate('/settings')}
        accessibilityRole="link"
        accessibilityLabel={tx('الإعدادات والحساب', 'Settings and account')}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
          borderRadius: R.card,
          backgroundColor: at('/settings') ? 'rgba(255,255,255,0.13)' : pressed || hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
          padding: 12,
          gap: 4,
        })}
      >
        <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
            {name ? <T w="bold" color={C.indigo}>{name.trim().slice(0, 1)}</T> : <Icon name="account-outline" size={19} color={C.indigo} />}
          </View>
          <T w="bold" color="#fff" style={{ flex: 1 }} numberOfLines={1}>{name || tx('حسابي', 'My account')}</T>
          <Icon name="cog-outline" size={19} color={ON_DARK} />
        </View>
        <T size={TS.tiny} color="#A9AEE0">{versionLabel(Constants.expoConfig?.version ?? '1.0.0')}</T>
      </Pressable>
    </View>
  );
}
