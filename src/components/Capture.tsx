// The capture flow: talk (or type / paste an email) once -> غيث turns it into proposed changes (new tasks, edits,
// tasks done, tasks removed) -> review -> apply.
import React, { useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { D, getLang, tx } from '../lib/i18n';
import { Draft, Fields, Proposal, Source } from '../lib/store';
import { CATS, KINDS, shortWhen } from '../lib/tasks';
import { useTick } from '../lib/useTick';
import { C, liftMd, R, tint, TS } from '../theme';
import { Card, Check, ErrorText, Field, GhostButton, Icon, IconButton, IconName, Num, PrimaryButton, T } from '../ui';
import { Mark } from './Logo';
import { Sheet } from './Sheet';
import { TaskSheet } from './TaskSheet';

/** "مهمة واحدة"، "مهمتان"، "4 مهام"، "12 مهمة" / "1 task", "4 tasks" */
export function countTasks(n: number): string {
  if (getLang() === 'en') return `${n} ${n === 1 ? 'task' : 'tasks'}`;
  if (n === 1) return 'مهمة واحدة';
  if (n === 2) return 'مهمتان';
  if (n <= 10) return `${n} مهام`;
  return `${n} مهمة`;
}
function countChanges(n: number): string {
  if (getLang() === 'en') return `${n} ${n === 1 ? 'change' : 'changes'}`;
  if (n === 1) return 'تغيير واحد';
  if (n === 2) return 'تغييران';
  if (n <= 10) return `${n} تغييرات`;
  return `${n} تغييراً`;
}

/** Soft violet and teal light behind the full-screen capture views */
function Glow() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="gv" cx="50%" cy="36%" r="55%">
            <Stop offset="0" stopColor="#E1DBFF" stopOpacity="1" />
            <Stop offset="1" stopColor="#E1DBFF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="gt" cx="15%" cy="62%" r="45%">
            <Stop offset="0" stopColor="#D2F7F8" stopOpacity="1" />
            <Stop offset="1" stopColor="#D2F7F8" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={C.bg} />
        <Rect width="100%" height="100%" fill="url(#gt)" />
        <Rect width="100%" height="100%" fill="url(#gv)" />
      </Svg>
    </View>
  );
}

function useBack(onBack: () => void) {
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (onBack(), true));
    return () => sub.remove();
  }, [onBack]);
}

// ---------------------------------------------------------------- recording
export function RecordView({ text, level, error, startedAt, onDone, onCancel }: { text: string; level: number; error: string; startedAt: number; onDone: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const now = useTick(110);
  useBack(onCancel);
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  const phase = now / 160;
  const bars = Array.from({ length: 24 }, (_, i) => {
    const shape = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + 0.6));
    const wobble = 0.55 + 0.45 * Math.sin(phase + i * 1.3);
    return 6 + 40 * shape * Math.max(0.12, level) * wobble;
  });
  const ring = 1 + level * 0.12;

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Glow />
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, flexDirection: D.row }}>
          <IconButton icon="close" label={tx('إلغاء', 'Cancel')} onPress={onCancel} />
        </View>
        <View style={{ alignItems: 'center', marginTop: 8, paddingHorizontal: 24 }}>
          <T w="bold" size={TS.h1} align="center" style={{ lineHeight: 36 }}>{tx('تحدّث، وغيث يرتّب', 'Talk, Ghaith organises')}</T>
          <T size={TS.small} color={C.sub} align="center">{tx('اذكر كل ما لديك دفعة واحدة: مهام جديدة، تعديلات، أو ما أنجزته', 'Say it all at once: new tasks, changes, or what you have done')}</T>
        </View>

        <View style={{ alignItems: 'center', justifyContent: 'center', height: 230, marginTop: 6 }}>
          {[230, 190, 156].map((s, i) => (
            <View
              key={s}
              style={{
                position: 'absolute',
                width: s,
                height: s,
                borderRadius: s / 2,
                borderWidth: 1.5,
                borderColor: i === 1 ? tint(C.teal, 0.35) : tint(C.glow, 0.25),
                transform: [{ scale: i === 0 ? ring : 1 + level * 0.06 * (2 - i) }],
              }}
            />
          ))}
          <View style={{ width: 124, height: 124, borderRadius: 38, backgroundColor: C.indigo, alignItems: 'center', justifyContent: 'center', shadowColor: C.teal, shadowOpacity: 0.45, shadowRadius: 40, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}>
            <Mark size={78} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, height: 50 }}>
          {bars.map((h, i) => (
            <View key={i} style={{ width: 5, height: h, borderRadius: 3, backgroundColor: i % 3 === 0 ? C.teal : i % 3 === 1 ? '#3FA3F0' : C.glow }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.late }} />
          <Num size={TS.body}>{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</Num>
        </View>

        <ScrollView style={{ flex: 1, marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: R.card, padding: 16, minHeight: 96 }}>
            <T w="medium" size={TS.tiny} color={C.glow}>{text ? tx('أستمع إليك…', 'Listening…') : tx('جاهز، تفضّل…', 'Ready, go ahead…')}</T>
            <T color={text ? C.text : C.faint}>
              {text ||
                tx(
                  'مثال: «غداً صباحاً أرد على بريد خالد، وأجّل تأمين السيارة للخميس، ورد قسم التقنية وصلني»',
                  'e.g. “Reply to Khalid’s email tomorrow morning, move the car insurance to Thursday, and IT already replied”',
                )}
            </T>
          </View>
          <ErrorText text={error} />
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20, paddingTop: 10, gap: 10 }}>
          <PrimaryButton label={tx('انتهيت، رتّبها', 'Done, organise it')} icon="stop-circle-outline" onPress={onDone} disabled={!text} />
          <View style={{ flexDirection: 'row' }}>
            <GhostButton label={tx('إلغاء', 'Cancel')} onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- typing / pasting
export function TypeSheet({ mode, onSubmit, onClose }: { mode: 'text' | 'email'; onSubmit: (t: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const email = mode === 'email';
  return (
    <Sheet
      visible
      title={email ? tx('لصق بريد إلكتروني', 'Paste an email') : tx('اكتب لغيث', 'Write to Ghaith')}
      onClose={onClose}
      footer={<PrimaryButton label={tx('رتّبها', 'Organise')} icon="creation" onPress={() => text.trim() && onSubmit(text.trim())} disabled={!text.trim()} />}
    >
      <T size={TS.small} color={C.sub} style={{ marginBottom: 10 }}>
        {email
          ? tx('انسخ نص البريد (أو جزءاً منه) والصقه هنا، وسيستخرج غيث المطلوب منك وما تنتظره من غيرك.', 'Copy the email text (or part of it) and paste it here. Ghaith will pull out what you need to do and what you are waiting for.')
          : tx('اكتب كل ما لديك دفعة واحدة: مهام جديدة، أو تعديل مهمة، أو ما أنجزته.', 'Write everything at once: new tasks, changes to a task, or what you have done.')}
      </T>
      <Field
        value={text}
        onChangeText={setText}
        placeholder={email ? tx('الصق نص البريد هنا…', 'Paste the email here…') : tx('مثال: أرسل التقرير للمدير غداً، وأجّل اجتماع اللجنة إلى الإثنين', 'e.g. Send the report to the manager tomorrow, and move the committee meeting to Monday')}
        multiline
        autoFocus
        maxLength={6000}
        minHeight={email ? 200 : 130}
      />
      <View style={{ height: 8 }} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- thinking
export function ThinkingView() {
  const insets = useSafeAreaInsets();
  const now = useTick(80);
  const s = 1 + 0.06 * Math.sin(now / 260);
  const dots = '.'.repeat(1 + (Math.floor(now / 400) % 3));
  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: insets.bottom }}>
        <Glow />
        <View style={{ transform: [{ scale: s }], width: 124, height: 124, borderRadius: 38, backgroundColor: C.indigo, alignItems: 'center', justifyContent: 'center', shadowColor: C.glow, shadowOpacity: 0.5, shadowRadius: 40, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}>
          <Mark size={78} />
        </View>
        <T w="bold" size={TS.h2} align="center" style={{ marginTop: 28 }}>{tx('غيث يرتّب', 'Ghaith is organising')}{dots}</T>
        <T size={TS.small} color={C.sub} align="center">{tx('يحوّل كلامك إلى مهام وتعديلات واضحة', 'Turning what you said into clear tasks and changes')}</T>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- review
type Item = { key: number; p: Proposal; keep: boolean };

const OPS: Record<Proposal['op'], { icon: IconName; color: string; label: () => string }> = {
  add: { icon: 'plus', color: C.indigo, label: () => tx('جديدة', 'New') },
  update: { icon: 'pencil-outline', color: C.glow, label: () => tx('تعديل', 'Edit') },
  complete: { icon: 'check', color: C.tealDeep, label: () => tx('إنجاز', 'Done') },
  delete: { icon: 'trash-can-outline', color: C.late, label: () => tx('حذف', 'Delete') },
};

/** The task as it will be after this proposal */
function result(p: Proposal): Fields {
  if (p.op === 'add') return p.task;
  if (p.op === 'update') return { ...p.current, ...p.changes };
  return p.current;
}

function describe(p: Proposal): { sub: string; warn: string } {
  const f = result(p);
  const remind = f.remind_at ?? f.due_at;
  const unsure = 'unsure' in p && p.unsure ? tx('تأكّد أنها المهمة المقصودة', 'Check this is the right task') : '';
  if (p.op === 'update') {
    const at = p.changes.due_at ?? p.changes.remind_at;
    const auto = [at ? shortWhen(at) : null, p.changes.kind ? KINDS[p.changes.kind].label : null, p.changes.person].filter(Boolean).join(' · ');
    return { sub: p.change || auto || tx('تحديث التفاصيل', 'Details updated'), warn: unsure };
  }
  if (p.op === 'complete') return { sub: tx('ستُعلَّم كمنجزة', 'Will be marked as done'), warn: unsure };
  if (p.op === 'delete') return { sub: tx('ستُحذف نهائياً', 'Will be deleted'), warn: unsure };
  const sub = [KINDS[f.kind].label, remind ? (f.kind === 'waiting' && !f.due_at ? tx('متابعة ', 'follow up ') : '') + shortWhen(remind) : null, CATS[f.category].label, f.person].filter(Boolean).join(' · ');
  return { sub, warn: remind ? '' : tx('دون موعد، اضغط لتحديد وقت التذكير', 'No time yet, tap to set a reminder') };
}

function ProposalRow({ item, last, onToggle, onRemove, onOpen }: { item: Item; last: boolean; onToggle: () => void; onRemove: () => void; onOpen?: () => void }) {
  const { p } = item;
  const f = result(p);
  const op = OPS[p.op];
  const { sub, warn } = describe(p);
  return (
    <Pressable
      onPress={onOpen ?? onToggle}
      style={({ pressed }) => ({ flexDirection: D.row, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: pressed ? C.bg : 'transparent', opacity: item.keep ? 1 : 0.5 })}
    >
      <Check on={item.keep} onPress={onToggle} size={24} label={item.keep ? tx('استبعادها', 'Skip it') : tx('اعتمادها', 'Keep it')} />
      <View style={{ flex: 1, [D.rtl ? 'marginRight' : 'marginLeft']: 12, [D.rtl ? 'marginLeft' : 'marginRight']: 8 }}>
        <View style={{ flexDirection: D.row, alignItems: 'center', gap: 6 }}>
          {p.op !== 'add' && (
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 3, backgroundColor: tint(op.color, 0.1), borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 1 }}>
              <Icon name={op.icon} size={12} color={op.color} />
              <T w="medium" size={TS.tiny} color={op.color}>{op.label()}</T>
            </View>
          )}
          <T w="medium" numberOfLines={2} color={p.op === 'delete' ? C.sub : C.text} style={[{ flexShrink: 1 }, p.op === 'delete' ? { textDecorationLine: 'line-through' } : null]}>{f.title}</T>
          {p.op === 'add' && f.priority === 'high' && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.late }} />}
        </View>
        <T size={TS.small} color={p.op === 'update' ? C.glow : C.sub} numberOfLines={2}>{sub}</T>
        {!!warn && <T size={TS.tiny} color={C.amberText} numberOfLines={1}>{warn}</T>}
      </View>
      <Pressable onPress={onRemove} hitSlop={12} accessibilityLabel={tx('إزالة', 'Remove')}>
        <Icon name="close" size={18} color={C.faint} />
      </Pressable>
      {!last && <View style={{ position: 'absolute', bottom: 0, [D.end]: 16, [D.start]: 52, height: 1, backgroundColor: C.line }} />}
    </Pressable>
  );
}

export function ReviewView({ said, source, proposals, onSave, onClose, onRetry }: { said: string; source: Source; proposals: Proposal[]; onSave: (p: Proposal[]) => Promise<string | null>; onClose: () => void; onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>(() => proposals.map((p, i) => ({ key: i, p, keep: true })));
  const [edit, setEdit] = useState<{ key: number | null } | null>(null);
  const [showSaid, setShowSaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useBack(onClose);

  const kept = items.filter((i) => i.keep);
  const onlyAdds = kept.every((i) => i.p.op === 'add');
  const save = async () => {
    setBusy(true);
    const e = await onSave(kept.map((i) => i.p));
    setBusy(false);
    if (e) setErr(e);
  };
  const editing = edit && edit.key !== null ? items.find((i) => i.key === edit.key) ?? null : null;
  /** Puts an edited task back into its proposal: a new task stays new, an edit keeps only what differs */
  const onDraft = (d: Draft) => {
    const { similar_to: _s, ...f } = d;
    if (!edit || edit.key === null) return setItems((l) => [...l, { key: Date.now(), p: { op: 'add', task: f }, keep: true }]);
    setItems((l) =>
      l.map((x) => {
        if (x.key !== edit.key) return x;
        if (x.p.op === 'add') return { ...x, keep: true, p: { op: 'add', task: f } };
        if (x.p.op === 'update') {
          const cur = x.p.current;
          const changes = Object.fromEntries(Object.entries(f).filter(([k, v]) => cur[k as keyof Fields] !== v)) as Partial<Fields>;
          return { ...x, keep: true, p: { ...x.p, changes, change: null } };
        }
        return x;
      }),
    );
  };
  const n = items.length;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 130 }}>
          <View style={{ flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 6, backgroundColor: tint(C.glow, 0.1), paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.pill }}>
              <Icon name="creation" size={14} color={C.glow} />
              <T w="medium" size={TS.tiny} color={C.glow}>{n ? tx('جاهزة للمراجعة', 'Ready to review') : tx('لا توجد مهام', 'Nothing found')}</T>
            </View>
            <IconButton icon="close" label={tx('إغلاق', 'Close')} onPress={onClose} />
          </View>
          <T w="bold" size={TS.h1} style={{ marginTop: 10, lineHeight: 36 }}>
            {!n
              ? tx('لم أجد ما يمكن تسجيله', 'Nothing to record')
              : items.every((i) => i.p.op === 'add')
                ? tx(`استخرجت ${countTasks(n)}`, `Found ${countTasks(n)}`)
                : tx(`جهّزت ${countChanges(n)}`, `Prepared ${countChanges(n)}`)}
          </T>
          <T size={TS.small} color={C.sub}>
            {n ? tx('راجعها قبل الاعتماد: اضغط على أي بند لتعديله، أو أزله من القائمة.', 'Review before applying: tap any item to edit it, or remove it.') : tx('جرّب صياغة أخرى، أو أضف المهمة يدوياً.', 'Try saying it another way, or add the task by hand.')}
          </T>

          <Pressable onPress={() => setShowSaid((v) => !v)} style={{ marginTop: 16, marginBottom: 16, borderRadius: 14, backgroundColor: C.surfaceAlt, paddingHorizontal: 12, paddingVertical: 9, flexDirection: D.row, alignItems: showSaid ? 'flex-start' : 'center', gap: 8 }}>
            <Icon name={source === 'voice' ? 'microphone-outline' : source === 'email' ? 'email-outline' : 'text'} size={17} color={C.indigo} />
            <T size={TS.small} color={C.sub} style={{ flex: 1 }} numberOfLines={showSaid ? undefined : 1}>«{said}»</T>
            <T size={TS.small} w="medium" color={C.glow}>{showSaid ? tx('إخفاء', 'Hide') : tx('النص الأصلي', 'Original')}</T>
          </Pressable>

          {!!n && (
            <Card>
              {items.map((it, i) => (
                <ProposalRow
                  key={it.key}
                  item={it}
                  last={i === n - 1}
                  onToggle={() => setItems((l) => l.map((x) => (x.key === it.key ? { ...x, keep: !x.keep } : x)))}
                  onRemove={() => setItems((l) => l.filter((x) => x.key !== it.key))}
                  onOpen={it.p.op === 'add' || it.p.op === 'update' ? () => setEdit({ key: it.key }) : undefined}
                />
              ))}
            </Card>
          )}
          {!n && (
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <GhostButton label={tx('حاول مرة أخرى', 'Try again')} icon="microphone-outline" onPress={onRetry} />
            </View>
          )}
          <ErrorText text={err} />
        </ScrollView>

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 20, backgroundColor: 'rgba(248,250,255,0.96)', flexDirection: D.row, gap: 10 }}>
          <PrimaryButton
            style={{ flex: 1 }}
            label={!kept.length ? tx('اختر بنداً لاعتماده', 'Pick something to apply') : onlyAdds ? tx(`حفظ ${countTasks(kept.length)}`, `Save ${countTasks(kept.length)}`) : tx(`اعتماد ${countChanges(kept.length)}`, `Apply ${countChanges(kept.length)}`)}
            icon="check"
            onPress={save}
            busy={busy}
            disabled={!kept.length}
          />
          <Pressable onPress={() => setEdit({ key: null })} accessibilityLabel={tx('إضافة مهمة', 'Add a task')} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', ...liftMd, shadowOpacity: 0.06 }}>
            <Icon name="plus" size={24} color={C.indigo} />
          </Pressable>
        </View>

        {edit && <TaskSheet task={null} draft={editing ? result(editing.p) : null} onDraft={onDraft} onClose={() => setEdit(null)} />}
      </View>
    </Modal>
  );
}
