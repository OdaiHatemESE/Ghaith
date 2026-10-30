import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationPermission, PermissionState } from '../../lib/reminders';
import { useStore } from '../../lib/store';
import { speak } from '../../lib/voice';
import { C, TS } from '../../theme';
import { Card, Chip, HScroll, ListRow, T } from '../../ui';

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
    <View style={{ marginTop: 22 }}>
      <T w="bold" size={TS.body} style={{ paddingHorizontal: 4 }}>{title}</T>
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
    perm === 'granted' ? 'مفعّلة' : perm === 'unsupported' ? 'بتشتغل على تطبيق الجوال (مش على المتصفح)' : perm === 'denied' ? 'مقفولة من إعدادات الجهاز' : 'اضغط لتفعيلها';

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ backgroundColor: C.night, paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <T w="bold" size={TS.h1} color="#fff">الإعدادات</T>
        {!!name && <T color={C.mist}>{name}</T>}
      </View>

      <View style={{ paddingHorizontal: 16 }}>
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

        <Section title="المتابعة" hint="لما تكون ناطر رد من حدا، بعد كم يوم غيث يذكّرك تلحقه؟">
          <HScroll>
            {FOLLOW.map((d) => (
              <Chip key={d} label={d === 1 ? 'يوم' : d === 2 ? 'يومين' : `${d} أيام`} on={settings.follow_up_days === d} onPress={() => saveSettings({ follow_up_days: d })} />
            ))}
          </HScroll>
        </Section>

        <Card style={{ marginTop: 24 }}>
          <ListRow
            icon="account-voice"
            title="غيث يرد بالصوت"
            detail="لما تحكي معه بالصوت، بيقرالك رده (مفيد وانت سايق)"
            right={
              <Switch
                value={settings.speak_replies}
                onValueChange={(v) => {
                  saveSettings({ speak_replies: v });
                  if (v) speak('تمام، رح أرد عليك بالصوت');
                }}
                trackColor={{ true: C.rain, false: C.line }}
                thumbColor="#fff"
              />
            }
          />
          <ListRow
            icon="bell-ring-outline"
            title="الإشعارات"
            detail={permText}
            onPress={perm === 'undetermined' || perm === 'denied' ? () => notificationPermission(true).then(setPerm) : undefined}
            last
          />
        </Card>

        <Card style={{ marginTop: 16 }}>
          <ListRow icon="logout" title="تسجيل الخروج" danger onPress={() => signOut()} last />
        </Card>

        <T size={TS.tiny} color={C.faint} align="center" style={{ marginTop: 24 }}>
          غيث · النسخة الأولى{Platform.OS === 'web' ? ' · نسخة التجربة على المتصفح' : ''}
        </T>
      </View>
    </ScrollView>
  );
}
