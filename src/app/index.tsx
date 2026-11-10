import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { countTasks, RecordView, ReviewView, ThinkingView, TypeSheet } from '../components/Capture';
import { GhaithGreeter } from '../components/GhaithGreeter';
import { AttentionRow, cardStyle, goTab, Ring, SpaceSwitch, SpaceTag, TAB_SPACE, TabBar, useAttention } from '../components/Spaces';
import { TaskRow } from '../components/TaskRow';
import { TaskSheet } from '../components/TaskSheet';
import { D, getLang, tx } from '../lib/i18n';
import { botEmit } from '../lib/bot';
import { inSpace, SpaceFilter, useSpace } from '../lib/space';
import { Proposal, Source, useStore } from '../lib/store';
import { anchor, catOf, clock, dayDiff, dayLabel, GROUP_ORDER, GroupKey, groupOf, GROUPS, isLate, KINDS, longDate, sortTasks, Space, SPACES, spaceOf, startOfDay, Task } from '../lib/tasks';
import { useNow } from '../lib/useNow';
import { useDictation } from '../lib/voice';
import { useWide } from '../lib/useWide';
import { C, F, GRADIENT, lift, R, tint, TS } from '../theme';
import { Check, Gradient, Icon, Num, PrimaryButton, T } from '../ui';

type Flow =
  | { step: 'idle' }
  | { step: 'recording'; startedAt: number }
  | { step: 'typing'; mode: 'text' | 'email' }
  | { step: 'thinking' }
  | { step: 'review'; said: string; source: Source; proposals: Proposal[] };

/** "بعد 10 دقائق" / "in 10 minutes" / "الساعة 4:00 م" */
function untilLabel(at: Date, now: Date): string {
  const min = Math.round((at.getTime() - now.getTime()) / 60000);
  if (min <= 1) return tx('الآن', 'now');
  if (min < 60) {
    if (getLang() === 'en') return `in ${min} minutes`;
    return min === 2 ? 'بعد دقيقتين' : min <= 10 ? `بعد ${min} دقائق` : `بعد ${min} دقيقة`;
  }
  if (min < 120) return tx('بعد ساعة', 'in an hour');
  return tx(`الساعة ${clock(at)}`, `at ${clock(at)}`);
}

/** Home: today at a glance (work, personal or both), what needs attention, and today's plan */
export default function Home() {
  const insets = useSafeAreaInsets();
  const { name, tasks, complete, reopen, capture, apply } = useStore();
  const now = useNow();
  const dict = useDictation();
  const wide = useWide();
  const space = useSpace();
  const attention = useAttention();
  const { rec } = useLocalSearchParams<{ rec?: string }>();
  const [flow, setFlow] = useState<Flow>({ step: 'idle' });
  const [captureErr, setCaptureErr] = useState('');
  const [toast, setToast] = useState('');
  const [open, setOpen] = useState<Task | null | 'new'>(null);

  const dayStart = startOfDay(now).getTime();
  const allOpen = useMemo(() => tasks.filter((t) => t.status === 'open'), [tasks]);
  const counts = useMemo(() => {
    const c: Record<SpaceFilter, number> = { all: allOpen.length, work: 0, personal: 0 };
    for (const t of allOpen) c[spaceOf(t.category)]++;
    return c;
  }, [allOpen]);
  const openTasks = useMemo(() => allOpen.filter((t) => inSpace(t.category, space)), [allOpen, space]);
  const doneToday = useMemo(
    () => tasks.filter((t) => t.status === 'done' && t.done_at && new Date(t.done_at).getTime() >= dayStart && inSpace(t.category, space)),
    [tasks, dayStart, space],
  );
  const today = useMemo(() => sortTasks(openTasks.filter((t) => ['late', 'today'].includes(groupOf(t, now)))), [openTasks, now]);
  // Today's plan: overdue first, then today's by time, then what was finished today
  const plan = useMemo(() => {
    const at = (t: Task) => anchor(t) ?? '9999';
    const lateList = today.filter((t) => groupOf(t, now) === 'late');
    const todayList = today.filter((t) => groupOf(t, now) === 'today').sort((a, b) => (at(a) < at(b) ? -1 : 1));
    return [...lateList, ...todayList, ...doneToday.slice(0, 4)];
  }, [today, doneToday, now]);
  const comingUp = useMemo(() => sortTasks(openTasks.filter((t) => !['late', 'today'].includes(groupOf(t, now)))).slice(0, 4), [openTasks, now]);
  /** Desktop columns: one space's open tasks under time headings */
  const byGroup = (sp: Space) =>
    GROUP_ORDER.map((g) => ({ key: g as GroupKey, list: sortTasks(allOpen.filter((t) => spaceOf(t.category) === sp && groupOf(t, now) === g)) })).filter((g) => g.list.length);
  const late = openTasks.filter((t) => groupOf(t, now) === 'late').length;
  const waiting = openTasks.filter((t) => t.kind === 'waiting').length;
  const replies = openTasks.filter((t) => t.kind === 'reply').length;
  const total = today.length + doneToday.length;
  const pct = total ? Math.round((doneToday.length / total) * 100) : 0;

  // The next reminder in the coming three hours
  const upcoming = useMemo(() => {
    const soon = allOpen
      .filter((t) => t.remind_at && new Date(t.remind_at) > now && new Date(t.remind_at).getTime() - now.getTime() < 3 * 3600000)
      .sort((a, b) => (a.remind_at! < b.remind_at! ? -1 : 1));
    return soon[0] ?? null;
  }, [allOpen, now]);

  // ---------- capture ----------
  const startRecording = () => {
    setCaptureErr('');
    dict.start(); // must run inside the tap on web
    setFlow({ step: 'recording', startedAt: Date.now() });
  };
  const process = async (text: string, source: Source) => {
    setFlow({ step: 'thinking' });
    try {
      const proposals = await capture(text, source);
      setFlow({ step: 'review', said: text, source, proposals });
    } catch (e) {
      setCaptureErr((e as Error).message);
      setFlow({ step: 'idle' });
    }
  };
  const stopRecording = async () => {
    const text = await dict.finish();
    if (!text) {
      setCaptureErr(tx('لم أسمع شيئاً، حاول مرة أخرى.', 'I did not hear anything, please try again.'));
      return setFlow({ step: 'idle' });
    }
    process(text, 'voice');
  };
  // The mic on another tab's bar brings the person here with ?rec=1
  useEffect(() => {
    if (rec !== '1') return;
    router.setParams({ rec: undefined });
    const t = setTimeout(startRecording, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);
  const applyAll = async (list: Proposal[], source: Source, said?: string) => {
    const e = await apply(list, source, said);
    if (e) return e;
    setFlow({ step: 'idle' });
    const adds = list.filter((p) => p.op === 'add').length;
    if (adds) botEmit({ kind: 'saved', count: adds });
    setToast(adds === list.length ? tx(`حُفظت ${countTasks(adds)}`, `Saved ${countTasks(adds)}`) : tx('تم تطبيق التغييرات', 'Changes applied'));
    setTimeout(() => setToast(''), 3200);
    return null;
  };

  // ---------- pieces shared by the phone and the desktop layouts ----------
  const errorBox = !!captureErr && (
    <View style={{ marginTop: 12, flexDirection: D.row, alignItems: 'center', gap: 8, backgroundColor: tint(C.late, 0.08), borderRadius: 14, padding: 10 }}>
      <Icon name="alert-circle-outline" size={18} color={C.lateText} />
      <T size={TS.small} color={C.lateText} style={{ flex: 1 }}>
        {captureErr}
      </T>
      <Pressable onPress={() => setCaptureErr('')} hitSlop={10}>
        <Icon name="close" size={16} color={C.lateText} />
      </Pressable>
    </View>
  );

  const reminder = upcoming && (
    <Pressable onPress={() => setOpen(upcoming)} style={{ marginTop: 12, ...cardStyle, borderRadius: R.pill, paddingVertical: 8, paddingHorizontal: 8, [D.rtl ? 'paddingLeft' : 'paddingRight']: 16, flexDirection: D.row, alignItems: 'center', gap: 10 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFEBFF' }}>
        <Icon name="bell-outline" size={17} color={C.glowText} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="medium" size={TS.tiny} color={C.glowText}>
          {tx('تذكير', 'Reminder')} · {untilLabel(new Date(upcoming.remind_at!), now)}
        </T>
        <T size={TS.small} numberOfLines={1}>
          {upcoming.title}
        </T>
      </View>
    </Pressable>
  );

  const toggle = (t: Task) => (t.status === 'done' ? reopen(t.id) : complete(t.id));
  const accent = space === 'personal' ? SPACES.personal.color : SPACES.work.color;
  const next = plan.find((t) => t.status === 'open' && anchor(t) && new Date(anchor(t)!) > now);
  const todayCard = (
    <View style={{ ...cardStyle, borderRadius: 22, padding: 18, ...(wide ? { flex: 1.3 } : { marginTop: 16 }) }}>
      <View style={{ flexDirection: D.row, alignItems: 'center', gap: 16 }}>
        <Ring pct={pct} color={accent} />
        <View style={{ flex: 1, gap: 3 }}>
          <T size={13} color={C.sub}>{space === 'work' ? tx('العمل اليوم', 'Work today') : space === 'personal' ? tx('الشخصي اليوم', 'Personal today') : tx('اليوم', 'Today')}</T>
          <T w="bold" size={20}>
            {total ? tx(`${countTasks(total)} · أنجزت ${doneToday.length}`, `${countTasks(total)} · ${doneToday.length} done`) : tx('يومك هادئ', 'A calm day')}
          </T>
          <T size={13} color={C.sub} numberOfLines={1}>
            {next ? tx(`التالي: ${next.title}، ${clock(new Date(anchor(next)!))}`, `Next: ${next.title}, ${clock(new Date(anchor(next)!))}`) : late ? tx('ابدأ بالمتأخر أولاً', 'Start with what is overdue') : tx('لا شيء بموعد متبقٍّ اليوم', 'Nothing timed left today')}
          </T>
        </View>
      </View>
      <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line, flexDirection: D.row }}>
        <Metric n={late} label={tx('متأخرة', 'Overdue')} color={C.lateText} onPress={() => goTab('/tasks', '/')} />
        <Metric n={waiting} label={tx('بانتظار رد', 'Waiting on')} color={C.glowText} onPress={() => router.push({ pathname: '/tasks', params: { kind: 'waiting' } })} divider />
        <Metric n={replies} label={tx('بحاجة إلى رد', 'Need reply')} color={C.tealText} onPress={() => router.push({ pathname: '/tasks', params: { kind: 'reply' } })} divider />
      </View>
    </View>
  );

  const attentionBlock = !!attention.length && (
    <View>
      <View style={{ marginTop: 24, marginBottom: 10, flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8 }}>
          <T w="bold" size={17}>{tx('يحتاج انتباهك', 'Needs your attention')}</T>
          <View style={{ paddingHorizontal: 8, borderRadius: 10, backgroundColor: C.lateText }}>
            <T size={12} w="bold" color="#fff">{attention.length}</T>
          </View>
        </View>
        <Pressable onPress={() => goTab('/radar', '/')} hitSlop={8} accessibilityRole="link">
          <T size={13} w="bold" color={C.indigoHi}>{tx('عرض الكل', 'See all')}</T>
        </Pressable>
      </View>
      <View style={{ ...cardStyle, overflow: 'hidden' }}>
        {attention.slice(0, 3).map((a, i, all) => (
          <AttentionRow key={a.key} a={a} last={i === all.length - 1} onPress={() => goTab('/radar', '/')} />
        ))}
      </View>
    </View>
  );

  const planBlock = (
    <View>
      <View style={{ marginTop: 24, marginBottom: 10, flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between' }}>
        <T w="bold" size={17}>{plan.length ? tx('جدول اليوم', 'Today’s plan') : tx('القادم', 'Coming up')}</T>
        <Pressable onPress={() => goTab('/tasks', '/')} hitSlop={8} accessibilityRole="link">
          <T size={13} w="bold" color={C.indigoHi}>{tx('كل المهام', 'All tasks')}</T>
        </Pressable>
      </View>
      <View style={{ gap: 8 }}>
        {(plan.length ? plan : comingUp).map((t) => (
          <PlanRow key={t.id} task={t} now={now} onOpen={() => setOpen(t)} onToggle={() => toggle(t)} />
        ))}
      </View>
      {!plan.length && !comingUp.length && (
        <View style={{ ...cardStyle, padding: 24, alignItems: 'center', gap: 4 }}>
          <Icon name="weather-sunny" size={28} color={C.teal} />
          <T w="bold" align="center">{tx('لا توجد مهام هنا', 'No tasks here')}</T>
          <T size={TS.small} color={C.sub} align="center">
            {wide ? tx('اكتب في الأعلى كل ما عليك دفعة واحدة، وغيث يرتّبه.', 'Write everything above in one go, and Ghaith will organise it.') : tx('اضغط الميكروفون واذكر كل ما عليك دفعة واحدة، وغيث يرتّبه.', 'Tap the mic and say everything at once. Ghaith will organise it.')}
          </T>
        </View>
      )}
    </View>
  );

  const overlays = (
    <>
      {!!toast && (
        <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 10, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, backgroundColor: C.indigo, borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 9, ...lift }}>
            <Icon name="check-circle" size={18} color={C.teal} />
            <T w="medium" size={TS.small} color="#fff">
              {toast}
            </T>
          </View>
        </View>
      )}
      {flow.step === 'recording' && (
        <RecordView text={dict.text} level={dict.level} error={dict.error} startedAt={flow.startedAt} onDone={stopRecording} onCancel={() => (dict.cancel(), setFlow({ step: 'idle' }))} />
      )}
      {flow.step === 'typing' && <TypeSheet mode={flow.mode} onClose={() => setFlow({ step: 'idle' })} onSubmit={(t) => process(t, flow.mode)} />}
      {flow.step === 'thinking' && <ThinkingView />}
      {flow.step === 'review' && (
        <ReviewView
          said={flow.said}
          source={flow.source}
          proposals={flow.proposals}
          onSave={(list) => applyAll(list, flow.source, flow.said)}
          onClose={() => setFlow({ step: 'idle' })}
          onRetry={() => (flow.source === 'voice' ? startRecording() : setFlow({ step: 'typing', mode: flow.source === 'email' ? 'email' : 'text' }))}
        />
      )}
      {open && <TaskSheet task={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </>
  );

  // ---------- desktop ----------
  if (wide) {
    const columns = (['work', 'personal'] as Space[]).filter((sp) => space === 'all' || space === sp);
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 36, paddingTop: 30, paddingBottom: 48 }}>
          <View style={{ width: '100%', maxWidth: 1320, alignSelf: 'center' }}>
            <View style={{ flexDirection: D.row, alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <View style={{ flex: 1, maxWidth: 760, gap: 6 }}>
                <T size={14} color={C.sub}>{longDate(now)}</T>
                <GhaithGreeter size={112} />
              </View>
              <View style={{ flexDirection: D.row, gap: 8 }}>
              <Pressable
                onPress={() => router.push('/meetings')}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: D.row, alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 42, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.lineHi, backgroundColor: hovered || pressed ? C.surfaceAlt : C.surface })}
              >
                <Icon name="account-group-outline" size={18} color={C.indigo} />
                <T w="medium" color={C.indigo}>{tx('محضر اجتماع', 'Meeting minutes')}</T>
              </Pressable>
              <Pressable
                onPress={() => setOpen('new')}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: D.row, alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 42, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.lineHi, backgroundColor: hovered || pressed ? C.surfaceAlt : C.surface })}
              >
                <Icon name="plus" size={18} color={C.indigo} />
                <T w="medium" color={C.indigo}>{tx('مهمة يدوياً', 'Add manually')}</T>
              </Pressable>
              </View>
            </View>

            <CaptureBar onSubmit={(t) => process(t, 'text')} onMic={startRecording} onEmail={() => setFlow({ step: 'typing', mode: 'email' })} canMic={dict.state !== 'unsupported'} />
            {errorBox}
            {reminder}

            <View style={{ flexDirection: D.row, gap: 16, marginTop: 20, alignItems: 'stretch' }}>
              {todayCard}
              <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
                <T size={13} w="bold" color={C.sub}>{tx('اعرض', 'Show')}</T>
                <SpaceSwitch counts={counts} />
              </View>
            </View>

            <View style={{ flexDirection: D.row, gap: 18, alignItems: 'flex-start', marginTop: 24 }}>
              <View style={{ flex: 2.2, flexDirection: D.row, gap: 18, alignItems: 'flex-start' }}>
                {columns.map((sp) => (
                  <SpaceColumn key={sp} space={sp} tasks={byGroup(sp)} doneToday={doneToday.filter((t) => spaceOf(t.category) === sp)} now={now} onOpen={(t) => setOpen(t)} onToggle={toggle} />
                ))}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <T w="bold" size={TS.h2} style={{ flex: 1 }}>{tx('يحتاج انتباهك', 'Needs your attention')}</T>
                  <Pressable onPress={() => router.push('/radar')} hitSlop={8} accessibilityRole="link">
                    <T size={13} w="bold" color={C.indigoHi}>{tx('الرادار', 'Radar')}</T>
                  </Pressable>
                </View>
                <View style={{ ...cardStyle, overflow: 'hidden' }}>
                  {attention.slice(0, 6).map((a, i, all) => (
                    <AttentionRow key={a.key} a={a} last={i === all.length - 1} onPress={() => router.push('/radar')} />
                  ))}
                  {!attention.length && (
                    <View style={{ padding: 20, alignItems: 'center', gap: 6 }}>
                      <Icon name="shield-check-outline" size={26} color={C.teal} />
                      <T size={TS.small} color={C.sub} align="center">{tx('لا شيء يحتاج انتباهك الآن.', 'Nothing needs your attention now.')}</T>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
        {overlays}
      </View>
    );
  }

  // ---------- phone ----------
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: insets.bottom + TAB_SPACE + 24 }}>
        <View style={{ flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <T size={13} color={C.sub}>{longDate(now)}</T>
          <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={tx('الإعدادات والحساب', 'Settings and account')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.indigo, alignItems: 'center', justifyContent: 'center' }}>
            {name ? <T w="bold" size={16} color="#fff">{name.trim().slice(0, 1)}</T> : <Icon name="account-outline" size={21} color="#fff" />}
          </Pressable>
        </View>
        <View style={{ marginTop: 6, marginHorizontal: -6 }}>
          <GhaithGreeter size={96} />
        </View>

        <SpaceSwitch counts={counts} style={{ marginTop: 18 }} />

        <View style={{ marginTop: 12, flexDirection: D.row, gap: 8 }}>
          <Pressable onPress={() => setFlow({ step: 'typing', mode: 'text' })} accessibilityRole="button" style={{ flex: 1, height: 46, ...cardStyle, borderRadius: 23, flexDirection: D.row, alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
            <Icon name="pencil-outline" size={18} color={C.sub} />
            <T size={14} color={C.sub} numberOfLines={1} style={{ flex: 1 }}>{tx('اكتب لغيث…', 'Write to Ghaith…')}</T>
          </Pressable>
          <Pressable onPress={() => setFlow({ step: 'typing', mode: 'email' })} accessibilityRole="button" accessibilityLabel={tx('لصق بريد إلكتروني', 'Paste an email')} style={{ width: 46, height: 46, ...cardStyle, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="email-outline" size={20} color={C.indigo} />
          </Pressable>
          <Pressable onPress={() => router.push('/meetings')} accessibilityRole="button" accessibilityLabel={tx('محضر اجتماع', 'Meeting minutes')} style={{ width: 46, height: 46, ...cardStyle, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="account-group-outline" size={21} color={C.indigo} />
          </Pressable>
        </View>
        {errorBox}

        {todayCard}
        {reminder}
        {attentionBlock}
        {planBlock}
      </ScrollView>
      <TabBar onMic={startRecording} />
      {overlays}
    </View>
  );
}

/** One of the three figures under today's progress */
function Metric({ n, label, color, onPress, divider }: { n: number; label: string; color: string; onPress: () => void; divider?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flex: 1, gap: 2, alignItems: D.rtl ? 'flex-end' : 'flex-start', ...(divider ? { [D.rtl ? 'borderRightWidth' : 'borderLeftWidth']: 1, borderColor: C.line, [D.rtl ? 'paddingRight' : 'paddingLeft']: 12 } : null) }}>
      <Num size={22} color={n ? color : C.faint}>{n}</Num>
      <T size={12} color={C.sub} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

/** Today's plan: the time on the side, then the task in its space's colour */
function PlanRow({ task, now, onOpen, onToggle }: { task: Task; now: Date; onOpen: () => void; onToggle: () => void }) {
  const done = task.status === 'done';
  const at = anchor(task);
  const lateNow = !done && isLate(task, now);
  const sp = SPACES[spaceOf(task.category)];
  const today = at && dayDiff(new Date(at), now) === 0;
  const meta = [catOf(task.category).label, task.kind !== 'todo' ? KINDS[task.kind].label : null, task.person].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: D.row, alignItems: 'stretch', gap: 10 }}>
      <View style={{ width: 54, alignItems: 'center', paddingTop: 14 }}>
        <T size={12.5} w="bold" align="center" color={lateNow ? C.lateText : done ? C.faint : C.indigo}>
          {lateNow ? tx('متأخرة', 'Late') : at ? (today ? clock(new Date(at)) : dayLabel(new Date(at), now)) : '—'}
        </T>
      </View>
      <Pressable onPress={onOpen} style={({ pressed }) => ({ flex: 1, minWidth: 0, ...cardStyle, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12, flexDirection: D.row, alignItems: 'center', gap: 10, opacity: done ? 0.6 : 1, backgroundColor: pressed ? C.bg : C.surface })}>
        <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: sp.color }} />
        <Check on={done} onPress={onToggle} size={22} label={done ? tx('إعادة فتحها', 'Reopen') : tx('تمت', 'Done')} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <T w="bold" size={14} numberOfLines={2} style={done ? { textDecorationLine: 'line-through' } : null}>{task.title}</T>
          {!!meta && <T size={12} color={C.sub} numberOfLines={1}>{meta}</T>}
        </View>
        <SpaceTag category={task.category} />
      </Pressable>
    </View>
  );
}

/** Desktop: one space (work or personal) as a column, its tasks under small time headings */
function SpaceColumn({ space, tasks, doneToday, now, onOpen, onToggle }: { space: Space; tasks: { key: GroupKey; list: Task[] }[]; doneToday: Task[]; now: Date; onOpen: (t: Task) => void; onToggle: (t: Task) => void }) {
  const sp = SPACES[space];
  const count = tasks.reduce((n, g) => n + g.list.length, 0);
  return (
    <View style={{ flex: 1, minWidth: 0, ...cardStyle, overflow: 'hidden' }}>
      <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: sp.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={sp.icon} size={18} color={sp.color} />
        </View>
        <T w="bold" size={16} style={{ flex: 1 }}>{sp.label}</T>
        <T size={13} color={C.sub}>{countTasks(count)}</T>
      </View>
      {tasks.map((g) => (
        <View key={g.key}>
          <T size={12} w="bold" color={g.key === 'late' ? C.lateText : C.sub} style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 }}>{GROUPS[g.key].label}</T>
          {g.list.map((t, i) => (
            <TaskRow key={t.id} task={t} now={now} last={i === g.list.length - 1} onToggle={() => onToggle(t)} onOpen={() => onOpen(t)} />
          ))}
        </View>
      ))}
      {!!doneToday.length && (
        <View>
          <T size={12} w="bold" color={C.sub} style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 }}>{tx('أُنجزت اليوم', 'Done today')}</T>
          {doneToday.slice(0, 5).map((t, i, all) => (
            <TaskRow key={t.id} task={t} now={now} last={i === all.length - 1} onToggle={() => onToggle(t)} onOpen={() => onOpen(t)} />
          ))}
        </View>
      )}
      {!count && !doneToday.length && (
        <T size={TS.small} color={C.sub} align="center" style={{ padding: 24 }}>{tx('لا مهام مفتوحة هنا.', 'No open tasks here.')}</T>
      )}
    </View>
  );
}

/** Desktop: write or paste straight onto the page; Ctrl/⌘ + Enter organises it */
function CaptureBar({ onSubmit, onMic, onEmail, canMic }: { onSubmit: (t: string) => void; onMic: () => void; onEmail: () => void; canMic: boolean }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    onSubmit(t);
  };
  return (
    <View
      style={{
        marginTop: 20,
        backgroundColor: C.surface,
        borderRadius: R.card,
        borderWidth: 1.5,
        borderColor: focused ? tint(C.glow, 0.5) : C.line,
        padding: 10,
        flexDirection: D.row,
        alignItems: 'flex-end',
        gap: 10,
        ...lift,
      }}
    >
      <Pressable
        onPress={onMic}
        disabled={!canMic}
        accessibilityLabel={tx('تسجيل صوتي', 'Record')}
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', opacity: canMic ? 1 : 0.4, backgroundColor: C.indigoHi }}
      >
        <Gradient colors={['#3B3FB8', GRADIENT[1]]} angle="diagonal" radius={24} />
        <Icon name="microphone" size={22} color="#fff" />
      </Pressable>
      <TextInput
        value={text}
        onChangeText={setText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        placeholder={tx('اكتب كل ما لديك: مهام جديدة، تعديلات، أو ما أنجزته… (Ctrl + Enter للترتيب)', 'Write everything: new tasks, changes, or what you have done… (Ctrl + Enter to organise)')}
        placeholderTextColor={C.faint}
        onKeyPress={(e) => {
          const n = e.nativeEvent as { key: string; ctrlKey?: boolean; metaKey?: boolean };
          if (n.key === 'Enter' && (n.ctrlKey || n.metaKey)) send();
        }}
        accessibilityLabel={tx('اكتب لغيث', 'Write to Ghaith')}
        style={{
          flex: 1,
          minHeight: 48,
          maxHeight: 220,
          fontFamily: F.regular,
          fontSize: TS.body,
          lineHeight: 24,
          color: C.text,
          textAlign: D.align,
          writingDirection: D.writing,
          paddingVertical: 12,
          paddingHorizontal: 4,
          ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
        }}
      />
      <Pressable
        onPress={onEmail}
        accessibilityLabel={tx('لصق بريد إلكتروني', 'Paste an email')}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
          height: 48,
          paddingHorizontal: 14,
          borderRadius: 24,
          flexDirection: D.row,
          alignItems: 'center',
          gap: 6,
          backgroundColor: hovered || pressed ? C.surfaceAlt : C.bg,
        })}
      >
        <Icon name="email-outline" size={18} color={C.indigo} />
        <T w="medium" size={TS.small} color={C.indigo}>
          {tx('بريد', 'Email')}
        </T>
      </Pressable>
      <PrimaryButton label={tx('رتّبها', 'Organise')} icon="creation" onPress={send} disabled={!text.trim()} style={{ height: 48, paddingHorizontal: 22 }} />
    </View>
  );
}
