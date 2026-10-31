import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { versionLabel } from '../components/AutoUpdate';
import { Mark } from '../components/Logo';
import { ScreenHeader } from '../components/ScreenHeader';
import { notificationPermission, PermissionState } from '../lib/reminders';
import { getLang, setLang, tx } from '../lib/i18n';
import { useStore } from '../lib/store';
import { atTime, clock } from '../lib/tasks';
import { C, TS } from '../theme';
import { Card, Chip, HScroll, ListRow, Segmented, T } from '../ui';

const MORNING = ['07:00', '07:30', '08:00', '08:30', '09:00'];
const EVENING = ['17:00', '18:00', '20:00', '21:00', '22:00'];
const hm = (v: string) => clock(atTime(new Date(), Number(v.slice(0, 2)), Number(v.slice(3, 5))));
const FOLLOW = [1, 2, 3, 5, 7];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 28 }}>
      <T w="bold" size={TS.h2}>{title}</T>
      {!!hint && <T size={TS.small} color={C.sub} style={{ marginBottom: 12 }}>{hint}</T>}
      {children}
    </View>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { settings, saveSettings, signOut, name } = useStore();
  const [perm, setPerm] = useState<PermissionState>('undetermined');

  useEffect(() => {
    notificationPermission().then(setPerm);
  }, []);

  const permText =
    perm === 'granted'
      ? tx('مفعّلة', 'On')
      : perm === 'unsupported'
        ? tx('تعمل في تطبيق الجوال فقط، وليس في المتصفح', 'Work in the phone app only, not in the browser')
        : perm === 'denied'
          ? tx('مغلقة من إعدادات الجهاز', 'Turned off in device settings')
          : tx('اضغط لتفعيلها', 'Tap to turn on');

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={tx('الإعدادات', 'Settings')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <Section title={tx('اللغة', 'Language')} hint={tx('لغة التطبيق ولغة المهام التي يكتبها غيث', 'The app language, and the language Ghaith writes tasks in')}>
          <Segmented value={getLang()} onChange={setLang} options={[['ar', 'العربية'], ['en', 'English']]} />
        </Section>

        <Section title={tx('ملخص الصباح', 'Morning summary')} hint={tx('مهام اليوم، والمتأخر، ومن تنتظر ردّهم', 'Today’s tasks, what is overdue, and who you are waiting on')}>
          <HScroll>
            <Chip label={tx('إيقاف', 'Off')} on={!settings.morning_time} onPress={() => saveSettings({ morning_time: null })} />
            {MORNING.map((v) => (
              <Chip key={v} label={hm(v)} on={settings.morning_time === v} onPress={() => saveSettings({ morning_time: v })} />
            ))}
          </HScroll>
        </Section>

        <Section title={tx('مراجعة المساء', 'Evening check-in')} hint={tx('إن بقيت مهام اليوم مفتوحة، يذكّرك غيث بها', 'If any of today’s tasks are still open, Ghaith reminds you')}>
          <HScroll>
            <Chip label={tx('إيقاف', 'Off')} on={!settings.evening_time} onPress={() => saveSettings({ evening_time: null })} />
            {EVENING.map((v) => (
              <Chip key={v} label={hm(v)} on={settings.evening_time === v} onPress={() => saveSettings({ evening_time: v })} />
            ))}
          </HScroll>
        </Section>

        <Section title={tx('المتابعة', 'Follow-ups')} hint={tx('عندما تنتظر رداً من أحد، بعد كم يوم يذكّرك غيث بمتابعته؟', 'When you are waiting on someone, after how many days should Ghaith remind you to follow up?')}>
          <HScroll>
            {FOLLOW.map((d) => (
              <Chip
                key={d}
                label={getLang() === 'en' ? `${d} ${d === 1 ? 'day' : 'days'}` : d === 1 ? 'يوم واحد' : d === 2 ? 'يومان' : `${d} أيام`}
                on={settings.follow_up_days === d}
                onPress={() => saveSettings({ follow_up_days: d })}
              />
            ))}
          </HScroll>
        </Section>

        <Card style={{ marginTop: 28 }}>
          <ListRow icon="bell-ring-outline" title={tx('الإشعارات', 'Notifications')} detail={permText} onPress={perm === 'undetermined' || perm === 'denied' ? () => notificationPermission(true).then(setPerm) : undefined} />
          <ListRow icon="logout" title={tx('تسجيل الخروج', 'Sign out')} danger onPress={() => signOut()} last />
        </Card>

        <View style={{ alignItems: 'center', marginTop: 28, gap: 4 }}>
          <Mark size={30} />
          <T size={TS.tiny} color={C.faint} align="center">{tx('غيث', 'Ghaith')}{name ? ` · ${name}` : ''} · {versionLabel(Constants.expoConfig?.version ?? '1.0.0')}</T>
        </View>
      </ScrollView>
    </View>
  );
}
