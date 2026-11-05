// The task form: a large title, then the task's properties as one tidy list. Each property shows its current value
// and opens its editor in place (one at a time). Quick actions for an existing task sit at the top.
import React, { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { D, tx } from '../lib/i18n';
import { Draft, useStore } from '../lib/store';
import { addDays, atTime, CAT_ORDER, Category, CATS, clock, dayLabel, Kind, KIND_ORDER, KINDS, Priority, Repeat, REPEATS, startOfDay, Task } from '../lib/tasks';
import { C, F, R, tint, TS } from '../theme';
import { Card, Chip, ErrorText, Icon, IconName, PrimaryButton, T, Toggle } from '../ui';
import { Sheet } from './Sheet';
import { TaskHistory } from './TaskHistory';
import { WhenPicker } from './WhenPicker';

type Prop = 'kind' | 'remind' | 'due' | 'category' | 'person' | 'repeat' | 'notes';

const when = (d: Date | null) => (d ? `${dayLabel(d)} · ${clock(d)}` : tx('دون موعد', 'None'));

function Row({
  icon,
  color = C.indigo,
  label,
  value,
  open,
  onPress,
  last,
  right,
  children,
}: {
  icon: IconName;
  color?: string;
  label: string;
  value?: string;
  open?: boolean;
  onPress?: () => void;
  last?: boolean;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ flexDirection: D.row, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 12, backgroundColor: pressed ? C.bg : 'transparent' })}
      >
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tint(color, 0.12), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={color} />
        </View>
        <T w="medium" style={{ flex: 1 }}>{label}</T>
        {right ?? (
          <>
            {!!value && <T size={TS.small} color={open ? C.glow : C.sub} numberOfLines={1} style={{ maxWidth: '55%' }}>{value}</T>}
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.faint} />
          </>
        )}
      </Pressable>
      {open && <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View>}
      {!last && <View style={{ height: 1, backgroundColor: C.line, [D.start]: 58, [D.end]: 14, position: 'absolute', bottom: 0 }} />}
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 16, backgroundColor: pressed ? tint(color, 0.16) : tint(color, 0.09) })}>
      <Icon name={icon} size={20} color={color} />
      <T w="medium" size={TS.small} color={color} align="center">{label}</T>
    </Pressable>
  );
}

/**
 * Creates or edits a task. With `onDraft` it edits a draft from a capture instead of the database.
 */
export function TaskSheet({ task, draft, onDraft, onClose }: { task: Task | null; draft?: Draft | null; onDraft?: (d: Draft) => void; onClose: () => void }) {
  const { save, complete, reopen, remove } = useStore();
  const src = task ?? draft ?? null;
  const [title, setTitle] = useState(src?.title ?? '');
  const [kind, setKind] = useState<Kind>(src?.kind ?? 'todo');
  const [category, setCategory] = useState<Category>(src?.category ?? 'work');
  const [priority, setPriority] = useState<Priority>(src?.priority ?? 'normal');
  const [person, setPerson] = useState(src?.person ?? '');
  const [due, setDue] = useState<Date | null>(() => (src?.due_at ? new Date(src.due_at) : null));
  const [remind, setRemind] = useState<Date | null>(() => (src ? (src.remind_at ? new Date(src.remind_at) : null) : atTime(addDays(startOfDay(new Date()), 1), 9)));
  const [repeat, setRepeat] = useState<Repeat | null>(src?.repeat ?? null);
  const [notes, setNotes] = useState(src?.notes ?? '');
  const [open, setOpen] = useState<Prop | null>(() => (src && !src.remind_at && !src.due_at ? 'remind' : null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = (p: Prop) => setOpen((o) => (o === p ? null : p));

  const submit = async () => {
    if (!title.trim()) return setErr(tx('اكتب عنوان المهمة.', 'Write the task title.'));
    const fields = {
      title: title.trim(),
      kind,
      category,
      priority,
      person: person.trim() || null,
      due_at: due?.toISOString() ?? null,
      remind_at: remind?.toISOString() ?? null,
      repeat,
      notes: notes.trim() || null,
    };
    if (onDraft) {
      onDraft({ ...fields, similar_to: draft?.similar_to ?? null });
      return onClose();
    }
    setBusy(true);
    const e = await save(task?.id ?? null, fields);
    setBusy(false);
    if (e) setErr(e);
    else onClose();
  };

  const act = (fn: () => Promise<void>) => async () => {
    onClose();
    await fn();
  };

  /** Moves the reminder to tomorrow 9:00, and the deadline by the same amount (never before the reminder) */
  async function postpone() {
    if (!task) return;
    onClose();
    const morning = atTime(addDays(startOfDay(new Date()), 1), 9);
    const shift = morning.getTime() - (task.remind_at ? new Date(task.remind_at).getTime() : new Date().getTime());
    await save(task.id, {
      remind_at: morning.toISOString(),
      due_at: task.due_at ? new Date(Math.max(new Date(task.due_at).getTime() + shift, morning.getTime())).toISOString() : null,
    });
  }

  const done = task?.status === 'done';
  const personLabel = kind === 'waiting' ? tx('بانتظار من؟', 'Waiting on whom?') : kind === 'reply' ? tx('الرد على من؟', 'Reply to whom?') : tx('الشخص أو الجهة', 'Person or party');
  const heading = onDraft ? (draft ? tx('تعديل المهمة', 'Edit task') : tx('مهمة إضافية', 'Another task')) : task ? tx('تفاصيل المهمة', 'Task details') : tx('مهمة جديدة', 'New task');
  const cat = CATS[category];

  return (
    <Sheet visible title={heading} onClose={onClose} footer={<PrimaryButton label={onDraft ? tx('اعتماد', 'Done') : task ? tx('حفظ التغييرات', 'Save changes') : tx('إضافة المهمة', 'Add task')} icon="check" onPress={submit} busy={busy} />}>
      {task && (
        <View style={{ flexDirection: D.row, gap: 8, marginTop: 4, marginBottom: 14 }}>
          {done ? (
            <QuickAction icon="restore" label={tx('إعادة فتحها', 'Reopen')} color={C.indigo} onPress={act(() => reopen(task.id))} />
          ) : (
            <>
              <QuickAction icon="check-circle-outline" label={tx('أُنجزت', 'Done')} color={C.tealDeep} onPress={act(() => complete(task.id))} />
              <QuickAction icon="weather-sunset-up" label={tx('تأجيل للغد', 'Tomorrow')} color={C.glow} onPress={postpone} />
            </>
          )}
          <QuickAction icon="trash-can-outline" label={tx('حذف', 'Delete')} color={C.late} onPress={act(() => remove(task.id))} />
        </View>
      )}

      {/* Title */}
      <View style={{ backgroundColor: C.surface, borderRadius: R.card, paddingHorizontal: 14, paddingVertical: 10 }}>
        <T w="medium" size={TS.tiny} color={C.sub}>{tx('المهمة', 'Task')}</T>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={tx('مثال: الرد على بريد المدير بشأن الميزانية', 'e.g. Reply to the manager about the budget')}
          placeholderTextColor={C.faint}
          autoFocus={!src}
          multiline
          maxLength={300}
          accessibilityLabel={tx('عنوان المهمة', 'Task title')}
          style={{ fontFamily: F.semibold, fontSize: 18, lineHeight: 28, color: C.text, textAlign: D.align, writingDirection: D.writing, paddingVertical: 2, minHeight: 32, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) }}
        />
      </View>

      {/* Type */}
      <View style={{ flexDirection: D.row, backgroundColor: C.surfaceAlt, borderRadius: R.pill, padding: 4, marginTop: 12 }}>
        {KIND_ORDER.map((k) => {
          const on = kind === k;
          return (
            <Pressable key={k} onPress={() => setKind(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, flexDirection: D.row, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: R.pill, backgroundColor: on ? C.surface : 'transparent' }}>
              <Icon name={KINDS[k].icon} size={15} color={on ? KINDS[k].color : C.sub} />
              <T size={TS.small} w={on ? 'semibold' : 'regular'} color={on ? C.text : C.sub}>{KINDS[k].label}</T>
            </Pressable>
          );
        })}
      </View>

      {/* When */}
      <T w="semibold" size={TS.small} color={C.sub} style={{ marginTop: 18, marginBottom: 8 }}>{tx('التوقيت', 'Timing')}</T>
      <Card>
        <Row icon="bell-outline" color={C.glow} label={kind === 'waiting' ? tx('موعد المتابعة', 'Follow up') : tx('التذكير', 'Reminder')} value={when(remind)} open={open === 'remind'} onPress={() => toggle('remind')}>
          <WhenPicker value={remind} onChange={setRemind} />
        </Row>
        <Row icon="calendar-blank-outline" color={C.late} label={tx('الموعد النهائي', 'Deadline')} value={when(due)} open={open === 'due'} onPress={() => toggle('due')}>
          <WhenPicker value={due} onChange={setDue} />
        </Row>
        <Row icon="repeat" label={tx('التكرار', 'Repeat')} value={repeat ? REPEATS[repeat].label : tx('لا يتكرر', 'Never')} open={open === 'repeat'} onPress={() => toggle('repeat')} last>
          <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 8 }}>
            <Chip label={tx('لا يتكرر', 'Never')} on={!repeat} onPress={() => setRepeat(null)} />
            {(Object.keys(REPEATS) as Repeat[]).map((r) => (
              <Chip key={r} label={REPEATS[r].label} on={repeat === r} onPress={() => setRepeat(r)} />
            ))}
          </View>
        </Row>
      </Card>

      {/* Details */}
      <T w="semibold" size={TS.small} color={C.sub} style={{ marginTop: 18, marginBottom: 8 }}>{tx('التفاصيل', 'Details')}</T>
      <Card>
        <Row icon={cat.icon} color={cat.color} label={tx('التصنيف', 'Category')} value={cat.label} open={open === 'category'} onPress={() => toggle('category')}>
          <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 8 }}>
            {CAT_ORDER.map((c) => (
              <Chip key={c} label={CATS[c].label} icon={CATS[c].icon} color={CATS[c].color} on={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>
        </Row>
        <Row icon="account-outline" label={personLabel} value={person.trim() || tx('غير محدد', 'Not set')} open={open === 'person'} onPress={() => toggle('person')}>
          <TextInput
            value={person}
            onChangeText={setPerson}
            placeholder={tx('المدير، أحمد، قسم تقنية المعلومات…', 'Manager, Ahmed, IT department…')}
            placeholderTextColor={C.faint}
            autoFocus
            maxLength={120}
            style={{ fontFamily: F.regular, fontSize: TS.body, color: C.text, textAlign: D.align, writingDirection: D.writing, backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) }}
          />
        </Row>
        <Row
          icon="flag-outline"
          color={priority === 'high' ? C.late : C.indigo}
          label={tx('مهمة عاجلة', 'Urgent')}
          right={<Toggle label={tx('مهمة عاجلة', 'Urgent')} value={priority === 'high'} onChange={(v) => setPriority(v ? 'high' : 'normal')} />}
        />
        <Row icon="text" label={tx('ملاحظات', 'Notes')} value={notes.trim() ? notes.trim().slice(0, 40) : tx('لا توجد', 'None')} open={open === 'notes'} onPress={() => toggle('notes')} last>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={tx('تفاصيل، أرقام، المطلوب بالتحديد', 'Details, numbers, exactly what is needed')}
            placeholderTextColor={C.faint}
            multiline
            autoFocus
            maxLength={2000}
            style={{ fontFamily: F.regular, fontSize: TS.body, lineHeight: 24, color: C.text, textAlign: D.align, writingDirection: D.writing, backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 90, textAlignVertical: 'top', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) }}
          />
        </Row>
      </Card>

      {task && <TaskHistory taskId={task.id} />}

      <ErrorText text={err} />
      <View style={{ height: 12 }} />
    </Sheet>
  );
}
