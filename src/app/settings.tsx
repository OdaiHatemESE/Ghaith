import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { notificationPermission, PermissionState } from '../lib/reminders';
import { useStore, Voice } from '../lib/store';
import { supabase } from '../lib/supabase';
import { playReply } from '../lib/voice';
import { C, TS } from '../theme';
import { Card, Chip, HScroll, ListRow, T, Toggle } from '../ui';

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
const VOICES: [Voice, string][] = [
  ['hamdan', 'صوت رجالي'],
  ['fatima', 'صوت نسائي'],
  ['device', 'صوت الجهاز'],
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24 }}>
      <T w="semibold" size={TS.body} style={{ paddingHorizontal: 4 }}>{title}</T>
      {!!hint && <T size={TS.small} color={C.sub} style={{ paddingHorizontal: 4, marginBottom: 10 }}>{hint}</T>}
      {children}
    </View>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { settings, saveSettings, signOut, name } = useStore();
  const [perm, setPerm] = useState<PermissionState>('undetermined');
  const [voiceNote, setVoiceNote] = useState('');

  useEffect(() => {
    notificationPermission().then(setPerm);
  }, []);

  const tryVoice = async (v: Voice) => {
    saveSettings({ voice: v });
    const line = `أهلين${name ? ' ' + name : ''}، أنا غيث. احكيلي شو عندك وأنا برتّبه وبذكّرك فيه.`;
    if (v === 'device') return playReply(line, null, null);
    const { data } = await supabase.functions.invoke('ghaith-tts', { body: { text: line, voice: v } });
    setVoiceNote(data?.configured === false ? 'الصوت الطبيعي لسا مش مفعّل على السيرفر، فهلأ بتسمع صوت الجهاز.' : '');
    playReply(line, data?.audio ?? null, data?.audio_type ?? null);
  };

  const permText =
    perm === 'granted' ? 'مفعّلة' : perm === 'unsupported' ? 'بتشتغل على تطبيق الجوال، مش على المتصفح' : perm === 'denied' ? 'مقفولة من إعدادات الجهاز' : 'اضغط لتفعيلها';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="الإعدادات" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <Section title="صوت غيث" hint="اضغط على صوت لتسمعه">
          <HScroll>
            {VOICES.map(([v, l]) => (
              <Chip key={v} label={l} icon={v === 'device' ? 'cellphone' : 'account-voice'} on={settings.voice === v} onPress={() => tryVoice(v)} />
            ))}
          </HScroll>
          {!!voiceNote && <T size={TS.small} color={C.amber} style={{ marginTop: 8, paddingHorizontal: 4 }}>{voiceNote}</T>}
        </Section>

        <Card style={{ marginTop: 16 }}>
          <ListRow icon="volume-high" title="يرد بالصوت" detail="بيقرالك رده وانت سايق" right={<Toggle label="يرد بالصوت" value={settings.speak_replies} onChange={(v) => saveSettings({ speak_replies: v })} />} />
          <ListRow
            icon="repeat-variant"
            title="محادثة مستمرة"
            detail="بعد ما يرد، بيرجع يسمعك لحالك لحد ما تسكت أو تقول خلص"
            right={<Toggle label="محادثة مستمرة" value={settings.keep_listening} onChange={(v) => saveSettings({ keep_listening: v })} />}
            last
          />
        </Card>

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

        <Card style={{ marginTop: 24 }}>
          <ListRow icon="bell-ring-outline" title="الإشعارات" detail={permText} onPress={perm === 'undetermined' || perm === 'denied' ? () => notificationPermission(true).then(setPerm) : undefined} />
          <ListRow icon="logout" title="تسجيل الخروج" danger onPress={() => signOut()} last />
        </Card>

        <T size={TS.tiny} color={C.faint} align="center" style={{ marginTop: 24 }}>غيث · النسخة الأولى</T>
      </ScrollView>
    </View>
  );
}
