import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { versionLabel } from '../components/AutoUpdate';
import { Mark } from '../components/Logo';
import { ScreenHeader } from '../components/ScreenHeader';
import { notificationPermission, PermissionState } from '../lib/reminders';
import { useStore } from '../lib/store';
import { C, TS } from '../theme';
import { Card, Chip, HScroll, ListRow, T } from '../ui';

const MORNING: [string | null, string][] = [
  [null, 'بدون'],
  ['07:00', '7:00'],
  ['07:30', '7:30'],
  ['08:00', '8:00'],
  ['08:30', '8:30'],
  ['09:00', '9:00'],
];
const EVENING: [string | null, string][] = [
  [null, 'بدون'],
  ['17:00', '5:00'],
  ['18:00', '6:00'],
  ['20:00', '8:00'],
  ['21:00', '9:00'],
  ['22:00', '10:00'],
];
const FOLLOW = [1, 2, 3, 5, 7];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24 }}>
      <T w="heavy" size={TS.body} color={C.indigo} style={{ paddingHorizontal: 4 }}>{title}</T>
      {!!hint && <T size={TS.small} color={C.sub} style={{ paddingHorizontal: 4, marginBottom: 10 }}>{hint}</T>}
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
    perm === 'granted' ? 'مفعّلة' : perm === 'unsupported' ? 'بتشتغل على تطبيق الجوال، مش على المتصفح' : perm === 'denied' ? 'مقفولة من إعدادات الجهاز' : 'اضغط لتفعيلها';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="الإعدادات" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <Section title="ملخص الصبح" hint="شو عندك اليوم، وشو المتأخر، ومين ناطر رده">
          <HScroll>
            {MORNING.map(([v, l]) => (
              <Chip key={l} label={l} on={settings.morning_time === v} onPress={() => saveSettings({ morning_time: v })} />
            ))}
          </HScroll>
        </Section>

        <Section title="مراجعة المسا" hint="إذا ضل شيء من مهام اليوم مفتوح، غيث بيسألك عنه">
          <HScroll>
            {EVENING.map(([v, l]) => (
              <Chip key={l} label={l} on={settings.evening_time === v} onPress={() => saveSettings({ evening_time: v })} />
            ))}
          </HScroll>
        </Section>

        <Section title="المتابعة" hint="لما تكون ناطر رد من حدا، بعد كم يوم يذكّرك تلحقه؟">
          <HScroll>
            {FOLLOW.map((d) => (
              <Chip key={d} label={d === 1 ? 'يوم' : d === 2 ? 'يومين' : `${d} أيام`} on={settings.follow_up_days === d} onPress={() => saveSettings({ follow_up_days: d })} />
            ))}
          </HScroll>
        </Section>

        <Card style={{ marginTop: 28 }}>
          <ListRow icon="bell-ring-outline" title="الإشعارات" detail={permText} onPress={perm === 'undetermined' || perm === 'denied' ? () => notificationPermission(true).then(setPerm) : undefined} />
          <ListRow icon="logout" title="تسجيل الخروج" danger onPress={() => signOut()} last />
        </Card>

        <View style={{ alignItems: 'center', marginTop: 28, gap: 4 }}>
          <Mark size={30} />
          <T size={TS.tiny} color={C.faint} align="center">غيث{name ? ` · ${name}` : ''} · {versionLabel(Constants.expoConfig?.version ?? '1.0.0')}</T>
        </View>
      </ScrollView>
    </View>
  );
}
