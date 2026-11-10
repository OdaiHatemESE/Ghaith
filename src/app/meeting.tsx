// One meeting: write its title and points as they come (typed, or spoken one point at a time), then Ghaith organises
// them into minutes and proposes the actions as tasks. The minutes can be shared (email, WhatsApp, copy).
// Saved as you write; the meeting is created with its first word. `?id=` opens an existing one.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { countTasks, ReviewView, ThinkingView } from '../components/Capture';
import { GhaithBot } from '../components/GhaithBot';
import { ScreenHeader } from '../components/ScreenHeader';
import { botEmit } from '../lib/bot';
import { D, getLang, tx } from '../lib/i18n';
import { createMeeting, deleteMeeting, loadMeeting, mailMinutes, Meeting, meetingWhen, Minutes, newPointId, organise, Point, shareMinutes, updateMeeting, useMeetings } from '../lib/meetings';
import { Proposal, useStore } from '../lib/store';
import { catOf, shortWhen, Task } from '../lib/tasks';
import { useDictation } from '../lib/voice';
import { useWide } from '../lib/useWide';
import { C, F, GRADIENT, lift, R, tint, TS } from '../theme';
import { ErrorText, Gradient, Icon, IconName, PrimaryButton, T } from '../ui';

type Flow = { step: 'idle' } | { step: 'thinking' } | { step: 'review'; proposals: Proposal[] };

const webInput = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

export default function MeetingScreen() {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const params = useLocalSearchParams<{ id?: string }>();
  const { list } = useMeetings();
  const { tasks, apply } = useStore();
  const dict = useDictation();

  const [id, setId] = useState<string | null>(params.id ?? null);
  const meeting = list.find((m) => m.id === id) ?? null;
  const [title, setTitle] = useState('');
  const [attendees, setAttendees] = useState('');
  const [points, setPoints] = useState<Point[]>([]);
  const [ready, setReady] = useState(!params.id);
  const [mode, setMode] = useState<'write' | 'view'>('write');
  const [flow, setFlow] = useState<Flow>({ step: 'idle' });
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = useRef(false);
  const creating = useRef<Promise<string | null> | null>(null);

  // Opening an existing meeting: its fields, and the minutes if Ghaith already organised it
  useEffect(() => {
    if (!params.id) return;
    loadMeeting(params.id).then((m) => {
      if (m) {
        setTitle(m.title);
        setAttendees(m.attendees ?? '');
        setPoints(m.points ?? []);
        if (m.minutes) setMode('view');
      }
      setReady(true);
    });
  }, [params.id]);

  const say = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(''), 2600);
  };

  /** Saves what is written; creates the meeting the first time. Resolves with its id */
  const persist = useCallback(async (): Promise<string | null> => {
    const fields = { title: title.trim(), attendees: attendees.trim() || null, points };
    if (id) {
      const e = await updateMeeting(id, fields);
      if (e) setErr(e);
      return id;
    }
    if (!fields.title && !points.length) return null;
    if (!creating.current)
      creating.current = createMeeting(fields).then(({ meeting: m, error }) => {
        if (error) setErr(error);
        if (m) {
          setId(m.id);
          router.setParams({ id: m.id });
        }
        creating.current = null;
        return m?.id ?? null;
      });
    return creating.current;
  }, [id, title, attendees, points]);

  // Saved as you write
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      persist();
    }, 700);
    return () => clearTimeout(t);
  }, [persist]);
  const edit = <V,>(fn: (v: V) => void) => (v: V) => {
    dirty.current = true;
    fn(v);
  };

  const addPoint = (text: string) => {
    const t = text.trim();
    if (!t) return;
    dirty.current = true;
    setPoints((l) => [...l, { id: newPointId(), text: t }]);
  };

  const organiseNow = async () => {
    setErr('');
    if (dict.state === 'listening') await dict.finish();
    dirty.current = false;
    const mid = await persist();
    if (!mid) return;
    setFlow({ step: 'thinking' });
    try {
      await organise(mid);
      setFlow({ step: 'idle' });
      setMode('view');
    } catch (e) {
      setErr((e as Error).message);
      setFlow({ step: 'idle' });
    }
  };

  const addActions = async (chosen: Proposal[]) => {
    if (!meeting) return null;
    const e = await apply(chosen, 'text', undefined, {
      meeting_id: meeting.id,
      comment: tx(`من محضر اجتماع: «${meeting.title || 'بدون عنوان'}»`, `From the minutes of “${meeting.title || 'Untitled'}”`),
    });
    if (e) return e;
    await updateMeeting(meeting.id, { actions_added_at: new Date().toISOString() });
    setFlow({ step: 'idle' });
    botEmit({ kind: 'saved', count: chosen.length });
    say(tx(`أُضيفت ${countTasks(chosen.length)} إلى مهامك`, `${countTasks(chosen.length)} added to your tasks`));
    return null;
  };

  const share = async () => {
    if (!meeting) return;
    const r = await shareMinutes(meeting);
    if (r === 'copied') say(tx('نُسخ المحضر، الصقه حيث تريد', 'Minutes copied, paste them anywhere'));
  };

  const remove = async () => {
    if (id) await deleteMeeting(id);
    if (router.canGoBack()) router.back();
    else router.replace('/meetings');
  };

  const linked = useMemo(() => tasks.filter((t) => id && t.meeting_id === id), [tasks, id]);
  const view = mode === 'view' && meeting?.minutes;
  const column = { width: '100%' as const, maxWidth: wide ? 880 : undefined, alignSelf: 'center' as const };

  const headerRight = (
    <View style={{ flexDirection: D.row, gap: 4 }}>
      {view && <HeaderIcon icon="share-variant-outline" label={tx('مشاركة المحضر', 'Share the minutes')} onPress={share} />}
      {!!id && <HeaderIcon icon="trash-can-outline" label={tx('حذف الاجتماع', 'Delete the meeting')} onPress={() => setConfirmDelete((v) => !v)} />}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: wide ? 36 : 0 }}>
        <ScreenHeader title={view ? tx('محضر الاجتماع', 'Meeting minutes') : id ? tx('نقاط الاجتماع', 'Meeting notes') : tx('اجتماع جديد', 'New meeting')} right={headerRight} />
      </View>

      {confirmDelete && (
        <View style={{ ...column, paddingHorizontal: wide ? 0 : 16 }}>
          <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10, backgroundColor: tint(C.late, 0.08), borderRadius: 14, padding: 12, marginBottom: 8 }}>
            <T size={TS.small} color={C.lateText} style={{ flex: 1 }}>{tx('حذف الاجتماع ومحضره؟ المهام التي أضفتها منه تبقى.', 'Delete this meeting and its minutes? Tasks you added from it stay.')}</T>
            <Pressable onPress={remove} accessibilityRole="button" style={{ height: 34, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.lateText, justifyContent: 'center' }}>
              <T size={13} w="bold" color="#fff">{tx('احذف', 'Delete')}</T>
            </Pressable>
            <Pressable onPress={() => setConfirmDelete(false)} hitSlop={8}>
              <T size={13} w="bold" color={C.sub}>{tx('إلغاء', 'Cancel')}</T>
            </Pressable>
          </View>
        </View>
      )}

      {!ready ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <GhaithBot state="think" size={110} />
        </View>
      ) : view && meeting ? (
        <MinutesView
          meeting={meeting}
          minutes={meeting.minutes!}
          linked={linked}
          column={column}
          onAdd={() => setFlow({ step: 'review', proposals: meeting.minutes!.proposals })}
          onEdit={() => setMode('write')}
          onShare={share}
          onMail={() => Linking.openURL(mailMinutes(meeting)).catch(() => {})}
          onReorganise={organiseNow}
          err={err}
        />
      ) : (
        <Writer
          column={column}
          title={title}
          attendees={attendees}
          points={points}
          when={meeting?.held_at ?? null}
          onTitle={edit(setTitle)}
          onAttendees={edit(setAttendees)}
          onAdd={addPoint}
          onChange={(pid, text) => (dirty.current = true, setPoints((l) => l.map((p) => (p.id === pid ? { ...p, text } : p))))}
          onRemove={(pid) => (dirty.current = true, setPoints((l) => l.filter((p) => p.id !== pid)))}
          dict={dict}
          organised={!!meeting?.minutes}
          onBack={meeting?.minutes ? () => (persist(), setMode('view')) : undefined}
          onOrganise={organiseNow}
          err={err}
          bottom={insets.bottom}
        />
      )}

      {!!toast && (
        <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 10, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, backgroundColor: C.indigo, borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 9, ...lift }}>
            <Icon name="check-circle" size={18} color={C.teal} />
            <T w="medium" size={TS.small} color="#fff">{toast}</T>
          </View>
        </View>
      )}
      {flow.step === 'thinking' && <ThinkingView title={tx('غيث يكتب المحضر', 'Ghaith is writing the minutes')} sub={tx('يرتّب النقاط ويستخرج القرارات والمهام', 'Grouping the points, pulling out decisions and actions')} />}
      {flow.step === 'review' && meeting && (
        <ReviewView said={meeting.title || tx('اجتماع', 'Meeting')} source="text" proposals={flow.proposals} onSave={addActions} onClose={() => setFlow({ step: 'idle' })} onRetry={() => setFlow({ step: 'idle' })} />
      )}
    </View>
  );
}

function HeaderIcon({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? C.surfaceAlt : C.surface, borderWidth: 1, borderColor: C.line })}>
      <Icon name={icon} size={20} color={C.indigo} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- writing the points
function Writer(p: {
  column: object;
  title: string;
  attendees: string;
  points: Point[];
  when: string | null;
  onTitle: (t: string) => void;
  onAttendees: (t: string) => void;
  onAdd: (t: string) => void;
  onChange: (id: string, t: string) => void;
  onRemove: (id: string) => void;
  dict: ReturnType<typeof useDictation>;
  organised: boolean;
  onBack?: () => void;
  onOrganise: () => void;
  err: string;
  bottom: number;
}) {
  const wide = useWide();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  const listening = p.dict.state === 'listening';
  const canMic = p.dict.state !== 'unsupported';
  const scroll = useRef<ScrollView>(null);

  const submit = () => {
    if (!draft.trim()) return;
    p.onAdd(draft);
    setDraft('');
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  };
  const mic = () => {
    if (listening) return void p.dict.finish();
    // On web this must run inside the tap
    p.dict.start((t) => {
      p.onAdd(t);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: wide ? 36 : 16, paddingBottom: 24 }}>
        <View style={p.column}>
          {/* Title and who attended */}
          <View style={{ backgroundColor: C.surface, borderRadius: R.card, padding: 16, gap: 10, ...lift }}>
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8 }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: tint(C.indigoHi, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="account-group-outline" size={17} color={C.indigoHi} />
              </View>
              <T size={TS.small} color={C.sub}>{p.when ? meetingWhen(p.when) : tx('اجتماع اليوم', 'Today’s meeting')}</T>
            </View>
            <TextInput
              value={p.title}
              onChangeText={p.onTitle}
              placeholder={tx('عنوان الاجتماع', 'Meeting title')}
              placeholderTextColor={C.faint}
              maxLength={300}
              returnKeyType="next"
              onSubmitEditing={() => input.current?.focus()}
              accessibilityLabel={tx('عنوان الاجتماع', 'Meeting title')}
              style={{ fontFamily: F.bold, fontSize: 22, color: C.indigo, textAlign: D.align, writingDirection: D.writing, paddingVertical: 4, ...webInput }}
            />
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
              <Icon name="account-multiple-outline" size={18} color={C.faint} />
              <TextInput
                value={p.attendees}
                onChangeText={p.onAttendees}
                placeholder={tx('الحضور (اختياري): سالم، قسم التقنية…', 'Attendees (optional): Salem, IT…')}
                placeholderTextColor={C.faint}
                maxLength={1000}
                accessibilityLabel={tx('الحضور', 'Attendees')}
                style={{ flex: 1, fontFamily: F.regular, fontSize: TS.body, color: C.text, textAlign: D.align, writingDirection: D.writing, paddingVertical: 4, ...webInput }}
              />
            </View>
          </View>

          {/* The points */}
          <View style={{ flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }}>
            <T w="bold" size={17}>{tx('النقاط', 'Points')}</T>
            <T size={TS.small} color={C.sub}>{p.points.length ? tx(`${p.points.length} ${p.points.length === 1 ? 'نقطة' : p.points.length === 2 ? 'نقطتان' : p.points.length <= 10 ? 'نقاط' : 'نقطة'}`, `${p.points.length} point${p.points.length === 1 ? '' : 's'}`) : ''}</T>
          </View>

          {p.points.length > 0 && (
            <View style={{ backgroundColor: C.surface, borderRadius: R.card, ...lift, overflow: 'hidden' }}>
              {p.points.map((pt, i) => (
                <View key={pt.id} style={{ flexDirection: D.row, alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: tint(C.glow, 0.12), alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <T size={12} w="bold" color={C.glowText}>{i + 1}</T>
                  </View>
                  {editing === pt.id ? (
                    <TextInput
                      value={pt.text}
                      onChangeText={(t) => p.onChange(pt.id, t)}
                      onBlur={() => (setEditing(null), !pt.text.trim() && p.onRemove(pt.id))}
                      autoFocus
                      multiline
                      maxLength={1000}
                      style={{ flex: 1, fontFamily: F.regular, fontSize: TS.body, lineHeight: 24, color: C.text, textAlign: D.align, writingDirection: D.writing, padding: 0, ...webInput }}
                    />
                  ) : (
                    <Pressable onPress={() => setEditing(pt.id)} style={{ flex: 1 }} accessibilityHint={tx('اضغط للتعديل', 'Tap to edit')}>
                      <T style={{ lineHeight: 24 }}>{pt.text}</T>
                    </Pressable>
                  )}
                  <Pressable onPress={() => p.onRemove(pt.id)} hitSlop={10} accessibilityLabel={tx('حذف النقطة', 'Delete the point')} style={{ marginTop: 3 }}>
                    <Icon name="close" size={17} color={C.faint} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {!p.points.length && (
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 12, padding: 14, borderRadius: R.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.lineHi }}>
              <GhaithBot state="idle" size={58} />
              <T size={TS.small} color={C.sub} style={{ flex: 1, lineHeight: 21 }}>
                {tx('اكتب كل نقطة كما تأتي في الاجتماع، باختصار وبالعامية إن شئت: «سالم يرسل الميزانية الخميس»، «اتفقنا نأجل الإطلاق». في النهاية أرتّبها لك محضراً وأستخرج المهام.', 'Write each point as it comes, short is fine: “Salem sends the budget Thursday”, “agreed to delay the launch”. At the end I turn them into minutes and pull out the actions.')}
              </T>
            </View>
          )}
          <ErrorText text={p.err} />
        </View>
      </ScrollView>

      {/* Writing the next point, and organising */}
      <View style={{ borderTopWidth: 1, borderTopColor: C.line, backgroundColor: 'rgba(248,250,255,0.97)', paddingHorizontal: wide ? 36 : 16, paddingTop: 10, paddingBottom: p.bottom + 14 }}>
        <View style={[p.column, { gap: 10 }]}>
          <View style={{ flexDirection: D.row, alignItems: 'flex-end', gap: 8, backgroundColor: C.surface, borderRadius: 24, borderWidth: 1.5, borderColor: listening ? tint(C.late, 0.5) : C.line, padding: 5 }}>
            <Pressable
              onPress={mic}
              disabled={!canMic}
              accessibilityRole="button"
              accessibilityLabel={listening ? tx('إيقاف', 'Stop') : tx('قل النقطة', 'Say the point')}
              style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? C.late : C.indigo, opacity: canMic ? 1 : 0.35 }}
            >
              <Icon name={listening ? 'stop' : 'microphone'} size={21} color="#fff" />
            </Pressable>
            <TextInput
              ref={input}
              value={listening ? p.dict.text : draft}
              editable={!listening}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              submitBehavior="submit"
              returnKeyType="done"
              placeholder={listening ? tx('أستمع… قل النقطة', 'Listening… say the point') : tx('اكتب نقطة واضغط إدخال', 'Type a point, press Enter')}
              placeholderTextColor={listening ? C.late : C.faint}
              maxLength={1000}
              accessibilityLabel={tx('نقطة جديدة', 'New point')}
              style={{ flex: 1, minHeight: 42, fontFamily: F.regular, fontSize: TS.body, color: C.text, textAlign: D.align, writingDirection: D.writing, paddingVertical: 10, paddingHorizontal: 4, ...webInput }}
            />
            <Pressable
              onPress={submit}
              disabled={!draft.trim() || listening}
              accessibilityRole="button"
              accessibilityLabel={tx('أضف النقطة', 'Add the point')}
              style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: draft.trim() && !listening ? C.teal : C.surfaceAlt }}
            >
              <Icon name="plus" size={22} color={draft.trim() && !listening ? '#fff' : C.faint} />
            </Pressable>
          </View>
          {!!p.dict.error && <T size={TS.tiny} color={C.lateText}>{p.dict.error}</T>}
          <View style={{ flexDirection: D.row, gap: 10 }}>
            <PrimaryButton
              style={{ flex: 1 }}
              icon="creation"
              label={p.organised ? tx('أعد ترتيب المحضر', 'Organise again') : tx('رتّب المحضر مع غيث', 'Organise with Ghaith')}
              onPress={p.onOrganise}
              disabled={!p.points.length}
            />
            {p.onBack && (
              <Pressable onPress={p.onBack} accessibilityRole="button" style={{ height: 54, paddingHorizontal: 18, borderRadius: 27, borderWidth: 1.5, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }}>
                <T w="bold" color={C.indigo}>{tx('المحضر', 'Minutes')}</T>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- the organised minutes
function Block({ icon, color, title, children }: { icon: IconName; color: string; title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: R.card, padding: 16, marginTop: 14, ...lift }}>
      <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: tint(color, 0.12), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={17} color={color} />
        </View>
        <T w="bold" size={16} style={{ flex: 1 }}>{title}</T>
      </View>
      {children}
    </View>
  );
}

function Bullet({ text, mark, color = C.indigoHi }: { text: string; mark?: string; color?: string }) {
  return (
    <View style={{ flexDirection: D.row, alignItems: 'flex-start', gap: 10, paddingVertical: 5 }}>
      {mark ? (
        <T size={13} w="bold" color={color} style={{ minWidth: 16, lineHeight: 24 }}>{mark}</T>
      ) : (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginTop: 10 }} />
      )}
      <T style={{ flex: 1, lineHeight: 24 }}>{text}</T>
    </View>
  );
}

function MinutesView(p: {
  meeting: Meeting;
  minutes: Minutes;
  linked: Task[];
  column: object;
  onAdd: () => void;
  onEdit: () => void;
  onShare: () => void;
  onMail: () => void;
  onReorganise: () => void;
  err: string;
}) {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const [showPoints, setShowPoints] = useState(false);
  const { meeting: m, minutes: n } = p;
  const added = !!m.actions_added_at;
  const done = p.linked.filter((t) => t.status === 'done').length;
  const mine = n.actions.filter((a) => a.owner === 'me').length;
  const stat = (v: number, ar: string, en: string) => (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: R.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
      <T size={12} w="bold" color="#fff">{getLang() === 'en' ? `${v} ${en}` : `${v} ${ar}`}</T>
    </View>
  );
  /** A proposed action's task once added: matched by title */
  const taskFor = (title: string) => p.linked.find((t) => t.title === title);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 36 : 16, paddingBottom: 24 }}>
        <View style={p.column}>
          {/* Title, when, who, and the shape of it */}
          <View style={{ borderRadius: R.big, overflow: 'hidden' }}>
            <Gradient colors={[C.indigo, GRADIENT[0]]} angle="diagonal" />
            <View style={{ padding: 18, gap: 8 }}>
              <View style={{ flexDirection: D.row, alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <T w="bold" size={21} color="#fff" style={{ lineHeight: 30 }}>{m.title || tx('اجتماع بدون عنوان', 'Untitled meeting')}</T>
                  <T size={TS.small} color="rgba(255,255,255,0.75)">{meetingWhen(m.held_at)}</T>
                  {!!m.attendees && <T size={TS.small} color="rgba(255,255,255,0.75)" numberOfLines={2}>{tx('الحضور: ', 'Attendees: ')}{m.attendees}</T>}
                </View>
                <GhaithBot state="happy" size={70} />
              </View>
              <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {stat(m.points.length, 'نقاط', 'points')}
                {!!n.decisions.length && stat(n.decisions.length, 'قرارات', 'decisions')}
                {stat(n.actions.length, 'إجراءات', 'actions')}
              </View>
            </View>
          </View>

          {!!n.summary && (
            <Block icon="text-box-outline" color={C.indigoHi} title={tx('الملخص', 'Summary')}>
              <T style={{ lineHeight: 25 }}>{n.summary}</T>
            </Block>
          )}

          {/* What has to happen next, first: it is what the person acts on */}
          {!!n.actions.length && (
            <Block icon="checkbox-marked-circle-outline" color={C.tealDeep} title={tx('الإجراءات', 'Actions')}>
              {added && (
                <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, marginBottom: 6, backgroundColor: tint(C.teal, 0.1), borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }}>
                  <Icon name="check-all" size={16} color={C.tealText} />
                  <T size={TS.small} w="bold" color={C.tealText} style={{ flex: 1 }}>
                    {p.linked.length ? tx(`في مهامك: أُنجز ${done} من ${p.linked.length}`, `In your tasks: ${done} of ${p.linked.length} done`) : tx('أُضيفت إلى مهامك', 'Added to your tasks')}
                  </T>
                </View>
              )}
              {n.actions.map((a, i) => {
                const t = added ? taskFor(a.title) : undefined;
                const finished = t?.status === 'done';
                const who = a.owner === 'me' ? tx('أنا', 'Me') : a.person || tx('آخرون', 'Others');
                const meta = [a.due_at ? tx(`قبل ${shortWhen(a.due_at)}`, `by ${shortWhen(a.due_at)}`) : null, catOf(a.category).label].filter(Boolean).join(' · ');
                return (
                  <View key={i} style={{ flexDirection: D.row, alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                    <View style={{ minWidth: 44, height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: a.owner === 'me' ? C.indigo : tint(C.glow, 0.12), alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <T size={11.5} w="bold" color={a.owner === 'me' ? '#fff' : C.glowText} numberOfLines={1}>{who.length > 12 ? `${who.slice(0, 11)}…` : who}</T>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <T w="bold" size={14.5} style={[{ lineHeight: 22 }, finished ? { textDecorationLine: 'line-through', color: C.sub } : null]}>{a.title}</T>
                      {!!meta && <T size={12} color={C.sub}>{meta}</T>}
                    </View>
                    {finished && <Icon name="check-circle" size={20} color={C.teal} />}
                  </View>
                );
              })}
              {!added && !!mine && <T size={TS.tiny} color={C.sub} style={{ marginTop: 6 }}>{tx('ما عليك يصبح مهمة، وما على غيرك يصبح متابعة «بانتظار رد».', 'Yours become tasks; others’ become “waiting on” follow-ups.')}</T>}
            </Block>
          )}

          {!!n.decisions.length && (
            <Block icon="gavel" color={C.glow} title={tx('القرارات', 'Decisions')}>
              {n.decisions.map((d, i) => (
                <Bullet key={i} text={d} mark={`${i + 1}.`} color={C.glowText} />
              ))}
            </Block>
          )}

          {n.sections.map((s, i) => (
            <Block key={i} icon="format-list-bulleted" color={C.indigoHi} title={s.heading}>
              {s.points.map((pt, j) => (
                <Bullet key={j} text={pt} />
              ))}
            </Block>
          ))}

          {!!n.open_questions.length && (
            <Block icon="help-circle-outline" color={C.amber} title={tx('نقاط مفتوحة', 'Open questions')}>
              {n.open_questions.map((q, i) => (
                <Bullet key={i} text={q} color={C.amberText} />
              ))}
            </Block>
          )}

          {!!n.next_meeting && (
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10, marginTop: 14, backgroundColor: tint(C.indigoHi, 0.07), borderRadius: 16, padding: 14 }}>
              <Icon name="calendar-clock" size={20} color={C.indigoHi} />
              <T w="bold" color={C.indigoHi} style={{ flex: 1 }}>{tx('الاجتماع القادم: ', 'Next meeting: ')}{n.next_meeting}</T>
            </View>
          )}

          {/* What was written in the meeting, as written */}
          <Pressable onPress={() => setShowPoints((v) => !v)} style={{ marginTop: 16, flexDirection: D.row, alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <Icon name={showPoints ? 'chevron-up' : 'chevron-down'} size={18} color={C.sub} />
            <T size={TS.small} w="bold" color={C.sub}>{tx(`النقاط كما كتبتها (${m.points.length})`, `Your points as written (${m.points.length})`)}</T>
          </Pressable>
          {showPoints && (
            <View style={{ backgroundColor: C.surfaceAlt, borderRadius: 16, padding: 14 }}>
              {m.points.map((pt, i) => (
                <Bullet key={pt.id} text={pt.text} mark={`${i + 1}.`} color={C.sub} />
              ))}
            </View>
          )}

          <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <SmallButton icon="pencil-outline" label={tx('عدّل النقاط', 'Edit points')} onPress={p.onEdit} />
            <SmallButton icon="email-outline" label={tx('أرسل بالبريد', 'Email it')} onPress={p.onMail} />
            <SmallButton icon="share-variant-outline" label={Platform.OS === 'web' ? tx('انسخ المحضر', 'Copy the minutes') : tx('شارك المحضر', 'Share the minutes')} onPress={p.onShare} />
            <SmallButton icon="refresh" label={tx('أعد الترتيب', 'Organise again')} onPress={p.onReorganise} />
          </View>
          <ErrorText text={p.err} />
        </View>
      </ScrollView>

      {!!n.proposals.length && !added && (
        <View style={{ borderTopWidth: 1, borderTopColor: C.line, backgroundColor: 'rgba(248,250,255,0.97)', paddingHorizontal: wide ? 36 : 16, paddingTop: 12, paddingBottom: insets.bottom + 16 }}>
          <View style={p.column}>
            <PrimaryButton icon="playlist-plus" label={tx(`راجع وأضف ${countTasks(n.proposals.length)} إلى غيث`, `Review and add ${countTasks(n.proposals.length)}`)} onPress={p.onAdd} />
          </View>
        </View>
      )}
    </View>
  );
}

function SmallButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: D.row, alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1.5, borderColor: C.lineHi, backgroundColor: pressed ? C.surfaceAlt : C.surface })}
    >
      <Icon name={icon} size={16} color={C.indigo} />
      <T size={13} w="bold" color={C.indigo}>{label}</T>
    </Pressable>
  );
}
