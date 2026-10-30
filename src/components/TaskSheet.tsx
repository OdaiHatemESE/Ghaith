import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useStore } from '../lib/store';
import { addDays, atTime, CAT_ORDER, Category, CATS, Kind, KIND_ORDER, KINDS, Priority, Repeat, REPEATS, startOfDay, Task } from '../lib/tasks';
import { C, TS } from '../theme';
import { Chip, ErrorText, Field, GhostButton, HScroll, Icon, Label, PrimaryButton, T } from '../ui';
import { Sheet } from './Sheet';
import { WhenPicker } from './WhenPicker';

/** A task by hand: the essentials first (what, which kind, when to remind), the rest under "more details" */
export function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { save, complete, reopen, remove } = useStore();
  const [title, setTitle] = useState(task?.title ?? '');
  const [kind, setKind] = useState<Kind>(task?.kind ?? 'todo');
  const [category, setCategory] = useState<Category>(task?.category ?? 'work');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  const [person, setPerson] = useState(task?.person ?? '');
  const [due, setDue] = useState<Date | null>(() => (task?.due_at ? new Date(task.due_at) : null));
  const [remind, setRemind] = useState<Date | null>(() => (task ? (task.remind_at ? new Date(task.remind_at) : null) : atTime(addDays(startOfDay(new Date()), 1), 9)));
  const [repeat, setRepeat] = useState<Repeat | null>(task?.repeat ?? null);
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [more, setMore] = useState(() => !!(task && (task.due_at || task.person || task.notes || task.repeat || task.priority !== 'normal')));
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
    <Sheet visible title={task ? 'المهمة' : 'مهمة جديدة'} onClose={onClose} footer={<PrimaryButton label={task ? 'حفظ' : 'أضف'} onPress={submit} busy={busy} />}>
      {task && (
        <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 6, marginBottom: 4 }}>
          {done ? (
            <GhostButton label="رجّعها مفتوحة" icon="restore" onPress={act(() => reopen(task.id))} />
          ) : (
            <>
              <GhostButton label="خلصت" icon="check" color={C.ok} onPress={act(() => complete(task.id))} />
              <GhostButton label="لبكرة" icon="weather-sunset-up" onPress={postpone} />
            </>
          )}
          <GhostButton label="حذف" icon="trash-can-outline" color={C.late} onPress={act(() => remove(task.id))} />
        </View>
      )}

      <Field label="شو المهمة؟" value={title} onChangeText={setTitle} placeholder="مثلاً: الرد على إيميل المدير" autoFocus={!task} maxLength={300} />

      <Label>النوع</Label>
      <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
        {KIND_ORDER.map((k) => (
          <Chip key={k} label={KINDS[k].label} icon={KINDS[k].icon} color={KINDS[k].color} on={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>

      <Label>ذكّرني</Label>
      <WhenPicker value={remind} onChange={setRemind} noneLabel="بدون" />

      <Label>التصنيف</Label>
      <HScroll>
        {CAT_ORDER.map((c) => (
          <Chip key={c} label={CATS[c].label} icon={CATS[c].icon} color={CATS[c].color} on={category === c} onPress={() => setCategory(c)} />
        ))}
      </HScroll>

      {!more && (
        <Pressable onPress={() => setMore(true)} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 18 }}>
          <Icon name="chevron-down" size={18} color={C.accent} />
          <T size={TS.small} w="medium" color={C.accent}>تفاصيل أكثر: الموعد النهائي، الشخص، التكرار</T>
        </Pressable>
      )}

      {more && (
        <>
          <Field label={kind === 'waiting' ? 'ناطر مين؟' : kind === 'reply' ? 'ترد على مين؟' : 'شخص أو جهة'} value={person} onChangeText={setPerson} placeholder="المدير، أحمد، قسم IT…" maxLength={120} />

          <Label>الموعد النهائي</Label>
          <WhenPicker value={due} onChange={setDue} noneLabel="بدون" />

          <Label>مستعجل؟</Label>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            <Chip label="مستعجل" on={priority === 'high'} color={C.amber} onPress={() => setPriority(priority === 'high' ? 'normal' : 'high')} />
          </View>

          <Label>تتكرر؟</Label>
          <HScroll>
            <Chip label="لا" on={!repeat} onPress={() => setRepeat(null)} />
            {(Object.keys(REPEATS) as Repeat[]).map((r) => (
              <Chip key={r} label={REPEATS[r]} on={repeat === r} onPress={() => setRepeat(r)} />
            ))}
          </HScroll>

          <Field label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="تفاصيل، أرقام، المطلوب بالضبط" multiline maxLength={2000} />
        </>
      )}
      <ErrorText text={err} />
      <View style={{ height: 12 }} />
    </Sheet>
  );
}
