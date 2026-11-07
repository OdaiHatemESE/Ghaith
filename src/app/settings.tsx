// Settings, in five plain groups: general (language, voice), reminders on this phone, Ghaith Radar, email to Ghaith
// (the addresses Ghaith accepts mail from), and the account.
// Every choice saves at once; there is no "save" button.
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { versionLabel } from '../components/AutoUpdate';
import { countEmails } from '../components/Inbox';
import { Mark } from '../components/Logo';
import { ScreenHeader } from '../components/ScreenHeader';
import { D, getLang, setLang, tx } from '../lib/i18n';
import { addSender, copy, removeSender, Sender, sendCode, useInbox } from '../lib/inbox';
import { everyLabel } from '../lib/radar';
import { notificationPermission, PermissionState } from '../lib/reminders';
import { RadarEvery, useStore } from '../lib/store';
import { atTime, clock } from '../lib/tasks';
import { useWide } from '../lib/useWide';
import { C, tint, TS } from '../theme';
import { Card, Chip, ErrorText, Field, GhostButton, Icon, IconName, ListRow, Segmented, T } from '../ui';

const MORNING = ['07:00', '07:30', '08:00', '08:30', '09:00'];
const EVENING = ['17:00', '18:00', '20:00', '21:00', '22:00'];
const FOLLOW = [1, 2, 3, 5, 7];
const RADAR: RadarEvery[] = [2, 4, 8, 12, 24];
/** Long addresses wrap anywhere instead of running out of their box (the web keeps unbroken words whole) */
const BREAK = Platform.OS === 'web' ? ({ wordBreak: 'break-all' } as object) : null;
const hm = (v: string) => clock(atTime(new Date(), Number(v.slice(0, 2)), Number(v.slice(3, 5))));
const days = (d: number) => (getLang() === 'en' ? `${d} ${d === 1 ? 'day' : 'days'}` : d === 1 ? 'يوم واحد' : d === 2 ? 'يومان' : `${d} أيام`);

/** The options of one setting, all visible (they wrap instead of scrolling out of sight) */
function Choices({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** A group heading above its card */
function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 26 }}>
      <View style={{ flexDirection: D.row, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 }}>
        <T w="bold" size={TS.small} color={C.sub}>{title}</T>
        {!!note && <T size={TS.tiny} color={C.faint}>{note}</T>}
      </View>
      <Card style={{ overflow: 'hidden' }}>{children}</Card>
    </View>
  );
}

/** One setting: an icon, what it is, one line on what it does, and its control underneath */
function Row({ icon, title, hint, children, last }: { icon: IconName; title: string; hint?: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={{ padding: 16, gap: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line }}>
      <View style={{ flexDirection: D.row, alignItems: 'center', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: tint(C.glow, 0.1), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={19} color={C.glow} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T w="semibold">{title}</T>
          {!!hint && <T size={TS.small} color={C.sub}>{hint}</T>}
        </View>
      </View>
      {children}
    </View>
  );
}

/** One linked address: verified, or waiting for the email carrying its code */
function SenderRow({ s, address, last }: { s: Sender; address: string | null; last: boolean }) {
  const ok = !!s.verified_at;
  return (
    <View style={{ paddingVertical: 12, gap: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line }}>
      <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10 }}>
        <Icon name={ok ? 'check-decagram' : 'clock-outline'} size={20} color={ok ? C.tealDeep : C.amberText} />
        <View style={{ flex: 1 }}>
          <T w="medium" numberOfLines={1} style={{ writingDirection: 'ltr', textAlign: D.rtl ? 'right' : 'left' }}>{s.email}</T>
          <T size={TS.tiny} color={ok ? C.tealDeep : C.amberText}>{ok ? tx('مرتبط', 'Linked') : tx('بانتظار التأكيد', 'Waiting for confirmation')}</T>
        </View>
        <Pressable onPress={() => removeSender(s.id)} hitSlop={10} accessibilityLabel={tx('إزالة العنوان', 'Remove address')}>
          <Icon name="close" size={18} color={C.faint} />
        </Pressable>
      </View>
      {!ok && (
        <View style={{ backgroundColor: tint(C.amber, 0.08), borderRadius: 12, padding: 12, gap: 8 }}>
          <T size={TS.small}>
            {tx('للتأكيد: أرسل من هذا العنوان رسالة إلى غيث، وفي عنوانها الرمز ', 'To confirm: send an email from this address to Ghaith with this code in the subject: ')}
            <T size={TS.small} w="bold" selectable color={C.indigo}>{s.code}</T>
          </T>
          {address ? (
            <View style={{ flexDirection: D.row }}>
              <GhostButton label={tx('أرسل الرمز الآن', 'Send the code now')} icon="send-outline" onPress={() => sendCode(address, s.code)} style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto', paddingHorizontal: 18 }} />
            </View>
          ) : (
            <T size={TS.tiny} color={C.sub}>{tx('يظهر عنوان غيث هنا حين يُفعَّل.', 'Ghaith’s address appears here once it is switched on.')}</T>
          )}
        </View>
      )}
    </View>
  );
}

/** The addresses Ghaith accepts email from, and Ghaith's own address */
function EmailGroup() {
  const { senders, address, items } = useInbox();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const add = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setErr('');
    const e = await addSender(email);
    setBusy(false);
    if (e) setErr(e);
    else setEmail('');
  };
  return (
    <Group title={tx('البريد إلى غيث', 'Email to Ghaith')} note={tx('من Outlook أو أي بريد', 'From Outlook or any mail app')}>
      <Row icon="email-fast-outline" title={tx('عنوان غيث', 'Ghaith’s address')} hint={tx('أرسل أو حوّل إليه أي بريد، ويقترح غيث منه المهام والمتابعات لتعتمدها', 'Send or forward any email to it; Ghaith proposes tasks and follow-ups for you to approve')}>
        {address ? (
          <Pressable
            onPress={async () => (await copy(address)) && (setCopied(true), setTimeout(() => setCopied(false), 1800))}
            style={{ flexDirection: D.row, alignItems: 'center', gap: 10, backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
          >
            <T selectable w="semibold" size={TS.small} color={C.indigo} style={[{ flex: 1, minWidth: 0, writingDirection: 'ltr', textAlign: D.rtl ? 'right' : 'left' }, BREAK]}>{address}</T>
            <Icon name={copied ? 'check' : 'content-copy'} size={17} color={C.glow} />
          </Pressable>
        ) : (
          <T size={TS.small} color={C.amberText}>{tx('لم يُفعَّل بعد. اربط عناوينك الآن، وتعمل حين يُفعَّل.', 'Not switched on yet. Link your addresses now; they work once it is.')}</T>
        )}
      </Row>
      <Row icon="account-check-outline" title={tx('عناويني المرتبطة', 'My linked addresses')} hint={tx('يقبل غيث البريد من هذه العناوين فقط، وما يصل من غيرها يُهمَل', 'Ghaith accepts email from these addresses only; anything else is ignored')}>
        {!!senders.length && <View>{senders.map((s, i) => <SenderRow key={s.id} s={s} address={address} last={i === senders.length - 1} />)}</View>}
        {senders.length < 5 && (
          <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field value={email} onChangeText={setEmail} placeholder="name@mohesr.gov.ae" ltr autoComplete="email" onSubmitEditing={add} returnKeyType="done" maxLength={254} />
            </View>
            <GhostButton label={busy ? '…' : tx('إضافة', 'Add')} icon="plus" onPress={add} style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto', paddingHorizontal: 18 }} />
          </View>
        )}
        <ErrorText text={err} />
      </Row>
      <ListRow icon="inbox-arrow-down-outline" title={tx('ما وصل غيث بالبريد', 'What arrived by email')} detail={items.length ? countEmails(items.length) : tx('لا شيء بانتظارك', 'Nothing waiting')} onPress={() => router.push('/inbox')} last />
    </Group>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { settings, saveSettings, signOut, name } = useStore();
  const wide = useWide();
  const [perm, setPerm] = useState<PermissionState>('undetermined');

  useEffect(() => {
    notificationPermission().then(setPerm);
  }, []);

  const permText =
    perm === 'granted'
      ? tx('مفعّلة', 'On')
      : perm === 'unsupported'
        ? tx('في تطبيق الجوال فقط', 'Phone app only')
        : perm === 'denied'
          ? tx('مغلقة من إعدادات الجهاز', 'Off in device settings')
          : tx('اضغط لتفعيلها', 'Tap to turn on');
  const phoneOnly = perm === 'unsupported';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={tx('الإعدادات', 'Settings')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40, width: '100%', maxWidth: wide ? 760 : undefined, alignSelf: 'center' }}>
        <Group title={tx('عام', 'General')}>
          <Row icon="translate" title={tx('اللغة', 'Language')} hint={tx('لغة التطبيق، واللغة التي يكتب بها غيث المهام', 'The app language, and the language Ghaith writes tasks in')}>
            <Segmented value={getLang()} onChange={(v) => (saveSettings({ lang: v as 'ar' | 'en' }), setLang(v))} options={[['ar', 'العربية'], ['en', 'English']]} />
          </Row>
          <Row icon="account-voice" title={tx('صوت غيث', 'Ghaith’s voice')} hint={tx('في المحادثة الصوتية', 'In voice chat')} last>
            <Segmented
              value={settings.voice === 'fatima' ? 'fatima' : 'hamdan'}
              onChange={(v) => saveSettings({ voice: v })}
              options={[['hamdan', tx('صوت رجالي', 'Male voice')], ['fatima', tx('صوت نسائي', 'Female voice')]]}
            />
          </Row>
        </Group>

        <Group title={tx('التذكيرات', 'Reminders')} note={tx('على هذا الهاتف', 'On this phone')}>
          <ListRow
            icon="bell-ring-outline"
            title={tx('الإشعارات', 'Notifications')}
            detail={permText}
            onPress={perm === 'undetermined' || perm === 'denied' ? () => notificationPermission(true).then(setPerm) : undefined}
          />
          <Row icon="weather-sunset-up" title={tx('ملخص الصباح', 'Morning summary')} hint={tx('مهام اليوم، والمتأخر، ومن تنتظر ردّهم', 'Today’s tasks, what is overdue, and who you are waiting on')}>
            <Choices>
              <Chip label={tx('إيقاف', 'Off')} on={!settings.morning_time} onPress={() => saveSettings({ morning_time: null })} />
              {MORNING.map((v) => (
                <Chip key={v} label={hm(v)} on={settings.morning_time === v} onPress={() => saveSettings({ morning_time: v })} />
              ))}
            </Choices>
          </Row>
          <Row icon="weather-night" title={tx('مراجعة المساء', 'Evening check-in')} hint={tx('إن بقيت مهام اليوم مفتوحة، يذكّرك بها', 'If any of today’s tasks are still open, a reminder')} last>
            <Choices>
              <Chip label={tx('إيقاف', 'Off')} on={!settings.evening_time} onPress={() => saveSettings({ evening_time: null })} />
              {EVENING.map((v) => (
                <Chip key={v} label={hm(v)} on={settings.evening_time === v} onPress={() => saveSettings({ evening_time: v })} />
              ))}
            </Choices>
          </Row>
          {phoneOnly && (
            <T size={TS.tiny} color={C.faint} style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
              {tx('تُضبط هنا، وتعمل على الهاتف الذي فيه تطبيق غيث.', 'Set here; they ring on the phone with the Ghaith app.')}
            </T>
          )}
        </Group>

        <Group title={tx('رادار غيث', 'Ghaith Radar')} note={tx('على الخادم', 'On the server')}>
          <Row icon="radar" title={tx('الفحص التلقائي', 'Automatic check')} hint={tx('يفحص غيث مهامك حتى والتطبيق مغلق، ويضع ما يحتاج انتباهك في الرادار', 'Ghaith checks your tasks even with the app closed, and puts what needs attention in the Radar')}>
            <Choices>
              <Chip label={tx('إيقاف', 'Off')} on={settings.radar_every_hours === 0} onPress={() => saveSettings({ radar_every_hours: 0 })} />
              {RADAR.map((h) => (
                <Chip key={h} label={everyLabel(h)} on={settings.radar_every_hours === h} onPress={() => saveSettings({ radar_every_hours: h })} />
              ))}
            </Choices>
          </Row>
          <Row icon="timer-sand" title={tx('متابعة من تنتظر ردّهم', 'Follow up on people you wait for')} hint={tx('إن لم يصلك رد خلال هذه المدة، يذكّرك غيث بالمتابعة', 'If no reply arrives within this time, Ghaith reminds you to follow up')} last>
            <Choices>
              {FOLLOW.map((d) => (
                <Chip key={d} label={days(d)} on={settings.follow_up_days === d} onPress={() => saveSettings({ follow_up_days: d })} />
              ))}
            </Choices>
          </Row>
        </Group>

        <EmailGroup />

        <Group title={tx('الحساب', 'Account')}>
          <ListRow icon="account-outline" title={name || tx('حسابي', 'My account')} detail={tx('الحساب نفسه في قديش', 'Same account as Qaddesh')} />
          <ListRow icon="logout" title={tx('تسجيل الخروج', 'Sign out')} danger onPress={() => signOut()} last />
        </Group>

        <View style={{ alignItems: 'center', marginTop: 28, gap: 4 }}>
          <Mark size={30} />
          <T size={TS.tiny} color={C.faint} align="center">{tx('غيث', 'Ghaith')} · {versionLabel(Constants.expoConfig?.version ?? '1.0.0')}</T>
        </View>
      </ScrollView>
    </View>
  );
}
