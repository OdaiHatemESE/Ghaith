import React, { useState } from 'react';
import { View } from 'react-native';
import { useStore } from '../lib/store';
import { addDays, atTime, CAT_ORDER, Category, CATS, Kind, KIND_ORDER, KINDS, Priority, Repeat, REPEATS, startOfDay, Task } from '../lib/tasks';
import { C } from '../theme';
import { Chip, ErrorText, Field, GhostButton, HScroll, Label, PrimaryButton } from '../ui';
import { Sheet } from './Sheet';
import { WhenPicker } from './WhenPicker';

const PRIORITIES: [Priority, string][] = [
  ['high', 'مستعجل'],
  ['normal', 'عادي'],
  ['low', 'مش مستعجل'],
];

/** Add a task by hand, or look at and change one: everything غيث can do by voice, by touch */
export function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { save, complete, reopen, remove } = useStore();
  // Mounted fresh each time it opens, so the fields start from the task (or a new one)
  const [title, setTitle] = useState(task?.title ?? '');
  const [kind, setKind] = useState<Kind>(task?.kind ?? 'todo');
  const [category, setCategory] = useState<Category>(task?.category ?? 'work');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  const [person, setPerson] = useState(task?.person ?? '');
  const [due, setDue] = useState<Date | null>(() => (task?.due_at ? new Date(task.due_at) : null));
  const [remind, setRemind] = useState<Date | null>(() => (task ? (task.remind_at ? new Date(task.remind_at) : null) : atTime(addDays(startOfDay(new Date()), 1), 9)));
  const [repeat, setRepeat] = useState<Repeat | null>(task?.repeat ?? null);
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!title.trim()) return setErr('اكتب شو المهمة');
    setBusy(true);
    const e = await save(task?.id ?? null, {
      title: title.trim(),
      kind,
      category,
      priority,
      person: person.trim() || null,
      due_at: due?.toISOString() ?? null,
      remind_at: remind?.toISOString() ?? null,
      repeat,
      notes: notes.trim() || null,
    });
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

  return (
    <Sheet
      visible
      title={task ? 'المهمة' : 'مهمة جديدة'}
      onClose={onClose}
      footer={<PrimaryButton label={task ? 'حفظ' : 'أضف'} onPress={submit} busy={busy} />}
    >
      {task && (
        <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 6 }}>
          {done ? (
            <GhostButton label="رجّعها مفتوحة" icon="restore" onPress={act(() => reopen(task.id))} />
          ) : (
            <>
              <GhostButton label="خلصت" icon="check-circle-outline" color={C.ok} onPress={act(() => complete(task.id))} />
              <GhostButton label="أجّل لبكرة" icon="weather-sunset-up" onPress={postpone} />
            </>
          )}
          <GhostButton label="حذف" icon="trash-can-outline" color={C.late} onPress={act(() => remove(task.id))} />
        </View>
      )}

      <Field label="شو المهمة؟" value={title} onChangeText={setTitle} placeholder="مثلاً: الرد على إيميل المدير" autoFocus={!task} maxLength={300} />

      <Label>النوع</Label>
      <View style={{ flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' }}>
        {KIND_ORDER.map((k) => (
          <Chip key={k} label={KINDS[k].label} icon={KINDS[k].icon} color={KINDS[k].color} on={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>

      <Label>التصنيف</Label>
      <HScroll>
        {CAT_ORDER.map((c) => (
          <Chip key={c} label={CATS[c].label} icon={CATS[c].icon} color={CATS[c].color} on={category === c} onPress={() => setCategory(c)} />
        ))}
      </HScroll>

      <Field
        label={kind === 'waiting' ? 'ناطر مين؟' : kind === 'reply' ? 'لازم ترد على مين؟' : 'شخص أو جهة مرتبطة (اختياري)'}
        value={person}
        onChangeText={setPerson}
        placeholder="المدير، أحمد، قسم IT..."
        maxLength={120}
      />

      <Label>الموعد النهائي</Label>
      <WhenPicker value={due} onChange={setDue} noneLabel="بدون موعد" />

      <Label>ذكّرني</Label>
      <WhenPicker value={remind} onChange={setRemind} noneLabel="بدون تذكير" />

      <Label>الأولوية</Label>
      <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
        {PRIORITIES.map(([p, l]) => (
          <Chip key={p} label={l} on={priority === p} color={p === 'high' ? C.late : C.night} onPress={() => setPriority(p)} />
        ))}
      </View>

      <Label>تتكرر؟</Label>
      <HScroll>
        <Chip label="لا" on={!repeat} onPress={() => setRepeat(null)} />
        {(Object.keys(REPEATS) as Repeat[]).map((r) => (
          <Chip key={r} label={REPEATS[r]} on={repeat === r} onPress={() => setRepeat(r)} />
        ))}
      </HScroll>

      <Field label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="تفاصيل، أرقام، المطلوب بالضبط" multiline maxLength={2000} />
      <ErrorText text={err} />
      <View style={{ height: 12 }} />
    </Sheet>
  );
}
