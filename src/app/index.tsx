import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { countTasks, RecordView, ReviewView, ThinkingView, TypeSheet } from '../components/Capture';
import { Logo } from '../components/Logo';
import { Sunrise } from '../components/Sunrise';
import { TaskRow } from '../components/TaskRow';
import { TaskSheet } from '../components/TaskSheet';
import { D, getLang, tx } from '../lib/i18n';
import { Proposal, Source, useStore } from '../lib/store';
import { clock, greeting, GROUP_ORDER, GroupKey, groupOf, GROUPS, longDate, sortTasks, startOfDay, Task } from '../lib/tasks';
import { useNow } from '../lib/useNow';
import { useDictation } from '../lib/voice';
import { useWide } from '../lib/useWide';
import { C, F, GRADIENT, lift, R, tint, TS } from '../theme';
import { Card, Gradient, Icon, IconButton, IconName, Num, PrimaryButton, SectionHead, T } from '../ui';

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

export default function Home() {
  const insets = useSafeAreaInsets();
  const { name, tasks, complete, reopen, capture, apply } = useStore();
  const now = useNow();
  const dict = useDictation();
  const wide = useWide();
  const [flow, setFlow] = useState<Flow>({ step: 'idle' });
  const [captureErr, setCaptureErr] = useState('');
  const [toast, setToast] = useState('');
  const [open, setOpen] = useState<Task | null | 'new'>(null);

  const dayStart = startOfDay(now).getTime();
  const openTasks = useMemo(() => tasks.filter((t) => t.status === 'open'), [tasks]);
  const doneToday = useMemo(() => tasks.filter((t) => t.status === 'done' && t.done_at && new Date(t.done_at).getTime() >= dayStart), [tasks, dayStart]);
  // Every open task, by when it is due
  const groups = useMemo(() => {
    const m = new Map<GroupKey, Task[]>();
    for (const t of sortTasks(openTasks)) {
      const g = groupOf(t, now);
      m.set(g, [...(m.get(g) ?? []), t]);
    }
    return GROUP_ORDER.filter((g) => m.has(g) || (g === 'today' && doneToday.length)).map((g) => ({ key: g, list: [...(m.get(g) ?? []), ...(g === 'today' ? doneToday.slice(0, 5) : [])] }));
  }, [openTasks, doneToday, now]);
  const today = openTasks.filter((t) => ['late', 'today'].includes(groupOf(t, now)));
  const late = openTasks.filter((t) => groupOf(t, now) === 'late').length;
  const waiting = openTasks.filter((t) => t.kind === 'waiting').length;
  const replies = openTasks.filter((t) => t.kind === 'reply').length;
  const total = today.length + doneToday.length;
  const firstTimed = today.map((t) => t.due_at ?? t.remind_at).filter((a): a is string => !!a && new Date(a) > now).sort()[0];

  // The next reminder in the coming three hours
  const upcoming = useMemo(() => {
    const soon = openTasks
      .filter((t) => t.remind_at && new Date(t.remind_at) > now && new Date(t.remind_at).getTime() - now.getTime() < 3 * 3600000)
      .sort((a, b) => (a.remind_at! < b.remind_at! ? -1 : 1));
    return soon[0] ?? null;
  }, [openTasks, now]);

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
  const applyAll = async (list: Proposal[], source: Source) => {
    const e = await apply(list, source);
    if (e) return e;
    setFlow({ step: 'idle' });
    const adds = list.filter((p) => p.op === 'add').length;
    setToast(adds === list.length ? tx(`حُفظت ${countTasks(adds)}`, `Saved ${countTasks(adds)}`) : tx('تم تطبيق التغييرات', 'Changes applied'));
    setTimeout(() => setToast(''), 3200);
    return null;
  };

  const headline = late ? tx('لنبدأ بالمهام المتأخرة', 'Let’s clear what’s overdue first') : total ? tx('لنجعل يومك مركّزاً', 'Let’s make it a focused day') : tx('يومك هادئ، استمتع به', 'A calm day, enjoy it');

  // ---------- pieces shared by the phone and the desktop layouts ----------
  const greetingBlock = (
    <View>
      <T size={TS.small} color={C.sub}>{greeting(now)}{name ? tx(` يا ${name}`, `, ${name}`) : ''}</T>
      <T w="bold" size={wide ? TS.display : TS.h1} style={{ lineHeight: wide ? 42 : 36 }}>{headline}</T>
    </View>
  );

  const hero = (
    <Pressable onPress={() => router.push('/tasks')} style={{ height: wide ? 196 : 160, borderRadius: R.big, overflow: 'hidden', backgroundColor: C.indigo, shadowColor: C.indigo, shadowOpacity: 0.28, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 8, ...(wide ? { flex: 1.25 } : { marginTop: 16 }) }}>
      <Sunrise />
      <View style={{ position: 'absolute', top: 16, [D.end]: 18, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 2 }}>
        <T w="medium" size={TS.tiny} color="#fff">{longDate(now)}</T>
      </View>
      <View style={{ padding: wide ? 22 : 18, paddingTop: wide ? 18 : 14 }}>
        <T size={TS.small} color="rgba(255,255,255,0.8)">{tx('مهام اليوم', 'Today’s tasks')}</T>
        <View style={{ flexDirection: D.row, alignItems: 'baseline', gap: 6 }}>
          <Num size={wide ? 52 : 44} color="#fff">{total}</Num>
          <T w="medium" size={TS.body} color="rgba(255,255,255,0.9)">{getLang() === 'en' ? (total === 1 ? 'task' : 'tasks') : total === 1 ? 'مهمة' : total === 2 ? 'مهمتان' : 'مهام'}</T>
        </View>
        <View style={{ height: 7, width: 190, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', marginTop: 6, flexDirection: D.row, alignSelf: D.rtl ? 'flex-end' : 'flex-start' }}>
          <View style={{ height: '100%', width: `${total ? Math.max(4, (doneToday.length / total) * 100) : 0}%`, borderRadius: 9, backgroundColor: C.teal }} />
        </View>
        <T size={TS.tiny} color="rgba(255,255,255,0.85)" style={{ marginTop: 6 }}>
          {total
            ? tx(`أنجزت ${doneToday.length} · متبقٍّ ${today.length}`, `${doneToday.length} done · ${today.length} left`) + (firstTimed ? tx(` · أقربها ${clock(new Date(firstTimed))}`, ` · next at ${clock(new Date(firstTimed))}`) : '')
            : tx('خطوات صغيرة اليوم، غدٌ أوضح', 'Small steps today, a clearer tomorrow')}
        </T>
      </View>
    </Pressable>
  );

  const stats = (
    <View style={{ flexDirection: D.row, gap: wide ? 14 : 10, ...(wide ? { flex: 1 } : { marginTop: 12 }) }}>
      <Stat tall={wide} n={late} label={tx('متأخرة', 'Overdue')} icon="alert-circle-outline" color={C.late} onPress={() => router.push('/tasks')} />
      <Stat tall={wide} n={waiting} label={tx('بانتظار رد', 'Waiting on')} icon="timer-sand" color={C.glow} onPress={() => router.push({ pathname: '/tasks', params: { kind: 'waiting' } })} />
      <Stat tall={wide} n={replies} label={tx('بحاجة إلى رد', 'Need reply')} icon="reply" color={C.tealDeep} onPress={() => router.push({ pathname: '/tasks', params: { kind: 'reply' } })} />
    </View>
  );

  const reminder = upcoming && (
    <Pressable onPress={() => setOpen(upcoming)} style={{ marginTop: 12, backgroundColor: C.surface, borderRadius: R.pill, paddingVertical: 8, paddingHorizontal: 8, [D.rtl ? 'paddingLeft' : 'paddingRight']: 16, flexDirection: D.row, alignItems: 'center', gap: 10, ...lift }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Gradient colors={['#9B83FF', C.glow]} angle="diagonal" />
        <Icon name="bell-outline" size={17} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <T w="medium" size={TS.tiny} color={C.glow}>{tx('تذكير', 'Reminder')} · {untilLabel(new Date(upcoming.remind_at!), now)}</T>
        <T size={TS.small} numberOfLines={1}>{upcoming.title}</T>
      </View>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.glow }} />
    </Pressable>
  );

  const errorBox = !!captureErr && (
    <View style={{ marginTop: 12, flexDirection: D.row, alignItems: 'center', gap: 8, backgroundColor: tint(C.late, 0.08), borderRadius: 14, padding: 10 }}>
      <Icon name="alert-circle-outline" size={18} color={C.late} />
      <T size={TS.small} color={C.late} style={{ flex: 1 }}>{captureErr}</T>
      <Pressable onPress={() => setCaptureErr('')} hitSlop={10}><Icon name="close" size={16} color={C.late} /></Pressable>
    </View>
  );

  const groupList = (
    <>
      {groups.map((g, gi) => (
        <View key={g.key}>
          <SectionHead
            title={`${GROUPS[g.key].label}  ${g.list.filter((t) => t.status === 'open').length}`}
            color={g.key === 'late' ? C.late : C.text}
            action={gi === 0 && !wide ? tx('عرض الكل', 'See all') : undefined}
            onAction={() => router.push('/tasks')}
          />
          <Card>
            {g.list.map((t, i) => (
              <TaskRow key={t.id} task={t} now={now} last={i === g.list.length - 1} onToggle={() => (t.status === 'done' ? reopen(t.id) : complete(t.id))} onOpen={() => setOpen(t)} />
            ))}
          </Card>
        </View>
      ))}
      {!groups.length && (
        <Card style={{ padding: 24, alignItems: 'center', marginTop: 28 }}>
          <Icon name="weather-sunny" size={28} color={C.teal} />
          <T w="semibold" align="center" style={{ marginTop: 6 }}>{tx('لا توجد مهام بعد', 'No tasks yet')}</T>
          <T size={TS.small} color={C.sub} align="center">
            {wide ? tx('اكتب في الأعلى كل ما عليك دفعة واحدة، وغيث يرتّبه.', 'Write everything above in one go, and Ghaith will organise it.') : tx('اضغط الميكروفون واذكر كل ما عليك دفعة واحدة، وغيث يرتّبه.', 'Tap the mic and say everything at once. Ghaith will organise it.')}
          </T>
        </Card>
      )}
    </>
  );

  const overlays = (
    <>
      {!!toast && (
        <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 10, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, backgroundColor: C.indigo, borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 9, ...lift }}>
            <Icon name="check-circle" size={18} color={C.teal} />
            <T w="medium" size={TS.small} color="#fff">{toast}</T>
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
          onSave={(list) => applyAll(list, flow.source)}
          onClose={() => setFlow({ step: 'idle' })}
          onRetry={() => (flow.source === 'voice' ? startRecording() : setFlow({ step: 'typing', mode: flow.source === 'email' ? 'email' : 'text' }))}
        />
      )}
      {open && <TaskSheet task={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </>
  );

  // ---------- desktop ----------
  if (wide) {
    const side = (title: string, icon: IconName, color: string, list: Task[], kind: 'waiting' | 'reply') => (
      <View style={{ marginTop: 24 }}>
        <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon name={icon} size={18} color={color} />
          <T w="bold" size={TS.h2} style={{ flex: 1 }}>{title}</T>
          <Pressable onPress={() => router.push({ pathname: '/tasks', params: { kind } })} hitSlop={8}>
            <T w="medium" size={TS.small} color={C.glow}>{tx('الكل', 'All')}</T>
          </Pressable>
        </View>
        <Card>
          {list.slice(0, 6).map((t, i, all) => (
            <TaskRow key={t.id} task={t} now={now} last={i === all.length - 1} onToggle={() => complete(t.id)} onOpen={() => setOpen(t)} />
          ))}
          {!list.length && <T size={TS.small} color={C.faint} style={{ padding: 16 }}>{tx('لا شيء هنا الآن.', 'Nothing here right now.')}</T>}
        </Card>
      </View>
    );
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 40, paddingTop: 32, paddingBottom: 48 }}>
          <View style={{ width: '100%', maxWidth: 1180, alignSelf: 'center' }}>
            <View style={{ flexDirection: D.row, alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
              {greetingBlock}
              <Pressable onPress={() => setOpen('new')} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: D.row, alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 42, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.lineHi, backgroundColor: hovered || pressed ? C.surfaceAlt : C.surface })}>
                <Icon name="plus" size={18} color={C.indigo} />
                <T w="medium" color={C.indigo}>{tx('مهمة يدوياً', 'Add manually')}</T>
              </Pressable>
            </View>

            <CaptureBar
              onSubmit={(t) => process(t, 'text')}
              onMic={startRecording}
              onEmail={() => setFlow({ step: 'typing', mode: 'email' })}
              canMic={dict.state !== 'unsupported'}
            />
            {errorBox}

            <View style={{ flexDirection: D.row, gap: 16, marginTop: 20 }}>
              {hero}
              {stats}
            </View>

            <View style={{ flexDirection: D.row, gap: 28, alignItems: 'flex-start' }}>
              <View style={{ flex: 1.7 }}>{groupList}</View>
              <View style={{ flex: 1 }}>
                {reminder && <View style={{ marginTop: 16 }}>{reminder}</View>}
                {side(tx('بانتظار ردّهم', 'Waiting on'), 'timer-sand', C.glow, sortTasks(openTasks.filter((t) => t.kind === 'waiting')), 'waiting')}
                {side(tx('بحاجة إلى ردّك', 'Needs your reply'), 'reply', C.tealDeep, sortTasks(openTasks.filter((t) => t.kind === 'reply')), 'reply')}
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
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 130 }}>
        <View style={{ flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo size={32} />
          <View style={{ flexDirection: D.row, gap: 8 }}>
            <IconButton icon="format-list-checks" label={tx('كل المهام', 'All tasks')} onPress={() => router.push('/tasks')} />
            <IconButton icon="tune-variant" label={tx('الإعدادات', 'Settings')} onPress={() => router.push('/settings')} />
          </View>
        </View>
        <View style={{ marginTop: 16 }}>{greetingBlock}</View>
        {hero}
        {stats}
        {reminder}
        {errorBox}
        {groupList}
      </ScrollView>

      {/* Capture dock */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 16 }}>
        <View style={{ height: 74, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: D.row, alignItems: 'center', justifyContent: 'space-around', shadowColor: C.indigo, shadowOpacity: 0.16, shadowRadius: 30, shadowOffset: { width: 0, height: 14 }, elevation: 10, borderWidth: 1, borderColor: '#fff' }}>
          <DockButton icon="format-text" label={tx('كتابة', 'Type')} onPress={() => setFlow({ step: 'typing', mode: 'text' })} />
          <Pressable onPress={startRecording} accessibilityRole="button" accessibilityLabel={tx('تسجيل صوتي', 'Record')} style={{ alignItems: 'center', width: 96 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, marginTop: -34, alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: '#fff', shadowColor: C.glow, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12, backgroundColor: C.indigoHi }}>
              <Gradient colors={['#3B3FB8', GRADIENT[1]]} angle="diagonal" radius={36} />
              <Icon name="microphone" size={30} color="#fff" />
            </View>
            <T w="medium" size={TS.tiny} color={C.indigo} align="center" style={{ marginTop: 2 }}>{tx('تسجيل', 'Record')}</T>
          </Pressable>
          <DockButton icon="email-outline" label={tx('بريد', 'Email')} onPress={() => setFlow({ step: 'typing', mode: 'email' })} />
        </View>
      </View>
      {overlays}
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
    <View style={{ marginTop: 20, backgroundColor: C.surface, borderRadius: R.card, borderWidth: 1.5, borderColor: focused ? tint(C.glow, 0.5) : C.line, padding: 10, flexDirection: D.row, alignItems: 'flex-end', gap: 10, ...lift }}>
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
        style={{ flex: 1, minHeight: 48, maxHeight: 220, fontFamily: F.regular, fontSize: TS.body, lineHeight: 24, color: C.text, textAlign: D.align, writingDirection: D.writing, paddingVertical: 12, paddingHorizontal: 4, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) }}
      />
      <Pressable onPress={onEmail} accessibilityLabel={tx('لصق بريد إلكتروني', 'Paste an email')} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ height: 48, paddingHorizontal: 14, borderRadius: 24, flexDirection: D.row, alignItems: 'center', gap: 6, backgroundColor: hovered || pressed ? C.surfaceAlt : C.bg })}>
        <Icon name="email-outline" size={18} color={C.indigo} />
        <T w="medium" size={TS.small} color={C.indigo}>{tx('بريد', 'Email')}</T>
      </Pressable>
      <PrimaryButton label={tx('رتّبها', 'Organise')} icon="creation" onPress={send} disabled={!text.trim()} style={{ height: 48, paddingHorizontal: 22 }} />
    </View>
  );
}

function Stat({ n, label, icon, color, onPress, tall }: { n: number; label: string; icon: IconName; color: string; onPress: () => void; tall?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, backgroundColor: pressed ? '#FBFBFF' : C.surface, borderRadius: tall ? R.card : 16, paddingVertical: tall ? 20 : 12, paddingHorizontal: tall ? 18 : 12, gap: 2, justifyContent: tall ? 'space-between' : undefined, ...lift })}>
      <View style={{ flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between' }}>
        <Num size={tall ? 34 : 22} color={n ? color : C.faint}>{n}</Num>
        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: tint(color, 0.12), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={16} color={color} />
        </View>
      </View>
      <T size={TS.small} color={C.sub} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

function DockButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', width: 70, gap: 2 }}>
      <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={21} color={C.indigo} />
      </View>
      <T w="medium" size={TS.tiny} color={C.indigo} align="center">{label}</T>
    </Pressable>
  );
}
