// The Radar: everything that needs attention in one place: what the scheduled scan found in the tasks (grouped by how
// urgent it is, with what to do about it) and the emails waiting for review. Filters by work / personal / email.
// Opening the screen marks new findings as seen.
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReviewView } from '../components/Capture';
import { InboxEmail } from '../components/Inbox';
import { agoLabel, RadarFinding, useRadarItems } from '../components/Radar';
import { ScreenHeader } from '../components/ScreenHeader';
import { cardStyle, TAB_SPACE, TabBar, TabTitle } from '../components/Spaces';
import { decide, InboxItem, loadInbox, saidOf, useInbox } from '../lib/inbox';
import { currentSpace } from '../lib/space';
import { TaskSheet } from '../components/TaskSheet';
import { D, tx } from '../lib/i18n';
import { askFor, dismiss, everyLabel, loadRadar, markActed, markSeen, RadarItem, runCheck, SEVERITY_LABEL } from '../lib/radar';
import { Proposal, useStore } from '../lib/store';
import { addDays, atTime, spaceOf, startOfDay, Task } from '../lib/tasks';
import { useNow } from '../lib/useNow';
import { useWide } from '../lib/useWide';
import { C, TS } from '../theme';
import { Chip, ErrorText, GhostButton, Icon, T } from '../ui';

export default function Radar() {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { complete, save, settings } = useStore();
  const every = settings.radar_every_hours;
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

  // Emails waiting for review sit here too: one place for everything that needs attention
  const { items: emails } = useInbox();
  const [filter, setFilter] = useState<'all' | 'work' | 'personal' | 'mail'>(currentSpace);
  const [review, setReview] = useState<{ item: InboxItem; proposals: Proposal[] } | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const { apply, capture } = useStore();
  const emailSpace = (m: InboxItem) => {
    const first = m.proposals.find((p) => p.op === 'add');
    return first && first.op === 'add' ? spaceOf(first.task.category) : 'work';
  };
  const findings = list.filter((x) => filter === 'all' || (filter !== 'mail' && spaceOf(x.task.category) === filter));
  const mails = emails.filter((m) => filter === 'all' || filter === 'mail' || emailSpace(m) === filter);
  const shownMails = filter === 'mail' || filter === 'all' || mails.length ? mails : [];
  const groups = filter === 'mail' ? [] : (['high', 'medium', 'low'] as const).map((sev) => ({ sev, rows: findings.filter((x) => x.item.severity === sev) })).filter((g) => g.rows.length);
  const n = { all: list.length + emails.length, work: list.filter((x) => spaceOf(x.task.category) === 'work').length + emails.filter((m) => emailSpace(m) === 'work').length, personal: list.filter((x) => spaceOf(x.task.category) === 'personal').length + emails.filter((m) => emailSpace(m) === 'personal').length, mail: emails.length };
  const fresh = !!every && !!lastScan && now.getTime() - Date.parse(lastScan) < (every + 1.5) * 3600000;

  /** Reads an email again in the app (from the excerpt kept on the server) when it failed on arrival */
  const retry = async (item: InboxItem) => {
    setRetrying(item.id);
    setErr('');
    try {
      const proposals = await capture(`From: ${item.sender_name || item.sender}\nSubject: ${item.subject ?? ''}\n\n${item.excerpt ?? ''}`, 'email');
      setReview({ item, proposals });
    } catch (e) {
      setErr((e as Error).message);
    }
    setRetrying(null);
  };

  const finding = ({ item, task }: (typeof list)[number]) => (
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
  );
  const heading = (label: string, color: string, count: number) => (
    <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8 }}>
      <T w="bold" size={13} color={color}>{label}</T>
      <T size={12} color={C.sub}>{count}</T>
      <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
    </View>
  );
  const sub = tx('ما يحتاج انتباهك من مهامك وبريدك، مرتّباً حسب الأهمية', 'What needs your attention in your tasks and email, most important first');

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {wide ? <ScreenHeader title={tx('الرادار', 'Radar')} /> : <TabTitle title={tx('الرادار', 'Radar')} sub={sub} />}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: wide ? 16 : 20, paddingBottom: insets.bottom + (wide ? 40 : TAB_SPACE + 24), width: '100%', maxWidth: wide ? 880 : undefined, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await Promise.all([loadRadar(), loadInbox()]), setRefreshing(false))} tintColor={C.glow} />}
      >
        {/* When the radar last looked, plainly, and "check now" */}
        <View style={{ marginTop: 8, ...cardStyle, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, flexDirection: D.row, alignItems: 'center', gap: 12 }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: fresh ? '#E2F5F5' : '#FFF4E0', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fresh ? C.tealDeep : C.amber }} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="bold" size={13}>{every ? tx(`يعمل ${everyLabel(every)}`, `Runs ${everyLabel(every).toLowerCase()}`) : tx('الفحص التلقائي متوقف', 'Automatic checks are off')}</T>
            <Pressable onPress={() => router.push('/settings')} hitSlop={6} accessibilityRole="link">
              <T size={12} color={C.sub}>
                {tx('آخر فحص', 'Last check')} {agoLabel(lastScan, now.getTime())} · <T size={12} w="bold" color={C.indigoHi}>{tx('تغيير', 'Change')}</T>
              </T>
            </Pressable>
          </View>
          <GhostButton label={checking ? '…' : tx('افحص الآن', 'Check now')} icon="radar" onPress={() => !checking && check()} style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto', paddingHorizontal: 14, height: 38 }} />
        </View>
        {!!note && <T size={TS.small} color={C.sub} style={{ marginTop: 8, paddingHorizontal: 4 }}>{note}</T>}
        <ErrorText text={err} />

        <View style={{ marginTop: 14, flexDirection: D.row, flexWrap: 'wrap', gap: 8 }}>
          <Chip label={`${tx('الكل', 'All')} ${n.all}`} on={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={`${tx('العمل', 'Work')} ${n.work}`} on={filter === 'work'} onPress={() => setFilter('work')} />
          <Chip label={`${tx('الشخصي', 'Personal')} ${n.personal}`} on={filter === 'personal'} onPress={() => setFilter('personal')} />
          {!!emails.length && <Chip label={`${tx('البريد', 'Email')} ${n.mail}`} icon="email-outline" on={filter === 'mail'} onPress={() => setFilter('mail')} />}
        </View>

        {loaded && !groups.length && !shownMails.length && (
          <View style={{ ...cardStyle, padding: 28, alignItems: 'center', marginTop: 20, gap: 6 }}>
            <Icon name="shield-check-outline" size={34} color={C.teal} />
            <T w="bold" align="center">{tx('لا شيء يحتاج انتباهك هنا', 'Nothing needs your attention here')}</T>
            <T size={TS.small} color={C.sub} align="center">{tx('سينبّهك غيث هنا حين تقترب مهمة من موعدها، أو تتأخر، أو يطول انتظارك لأحد، أو يصله بريد منك.', 'Ghaith will flag tasks here when a deadline gets close, slips, you have waited on someone too long, or an email from you arrives.')}</T>
          </View>
        )}

        {groups.filter((g) => g.sev === 'high').map((g) => (
          <View key={g.sev} style={{ marginTop: 22, gap: 12 }}>
            {heading(SEVERITY_LABEL[g.sev](), C.lateText, g.rows.length)}
            {g.rows.map(finding)}
          </View>
        ))}

        {!!shownMails.length && (
          <View style={{ marginTop: 22, gap: 12 }}>
            {heading(tx('من بريدك', 'From your email'), C.glowText, shownMails.length)}
            {shownMails.map((item) => (
              <InboxEmail
                key={item.id}
                item={item}
                onReview={() => setReview({ item, proposals: item.proposals })}
                onDismiss={() => decide(item.id, 'dismissed')}
                onRetry={() => retry(item)}
                retrying={retrying === item.id}
              />
            ))}
          </View>
        )}

        {groups.filter((g) => g.sev !== 'high').map((g) => (
          <View key={g.sev} style={{ marginTop: 22, gap: 12 }}>
            {heading(SEVERITY_LABEL[g.sev](), g.sev === 'medium' ? C.amberText : C.sub, g.rows.length)}
            {g.rows.map(finding)}
          </View>
        ))}

        <T size={TS.tiny} color={C.sub} align="center" style={{ marginTop: 24 }}>
          {tx('الرادار لا يُنجز ولا يؤجّل ولا يرسل شيئاً بنفسه: أنت من يقرر.', 'The radar never completes, postpones or sends anything by itself: you decide.')}
        </T>
      </ScrollView>
      {!wide && <TabBar onMic={() => router.dismissTo({ pathname: '/', params: { rec: '1' } })} />}
      {open && <TaskSheet task={open} onClose={() => setOpen(null)} />}
      {review && (
        <ReviewView
          said={saidOf(review.item)}
          source="email"
          proposals={review.proposals}
          onSave={async (pl) => {
            const e = await apply(pl, 'email');
            if (!e) {
              await decide(review.item.id, 'done');
              setReview(null);
            }
            return e;
          }}
          onClose={() => setReview(null)}
          onRetry={() => (setReview(null), retry(review.item))}
        />
      )}
    </View>
  );
}
