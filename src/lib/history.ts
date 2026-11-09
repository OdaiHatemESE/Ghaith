// A task's timeline: what happened to it (recorded by the database on every change) and the user's own notes.
import { tx } from './i18n';
import { supabase } from './supabase';
import { catOf, clock, dayLabel, Kind, KINDS, Repeat, REPEATS, whenLabel } from './tasks';

export type TaskEvent = {
  id: number;
  task_id: string;
  kind: 'created' | 'updated' | 'done' | 'reopened' | 'note';
  changes: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
};

/** null when the history isn't available (table not set up yet, or offline) */
export async function loadEvents(taskId: string): Promise<TaskEvent[] | null> {
  const { data, error } = await supabase.from('ghaith_task_events').select('id,task_id,kind,changes,note,created_at').eq('task_id', taskId).order('created_at', { ascending: false }).limit(200);
  return error ? null : ((data ?? []) as TaskEvent[]);
}

export async function addNote(taskId: string, note: string): Promise<TaskEvent | null> {
  const { data, error } = await supabase.from('ghaith_task_events').insert({ task_id: taskId, kind: 'note', note }).select('id,task_id,kind,changes,note,created_at').single();
  return error ? null : (data as TaskEvent);
}

export async function removeNote(id: number): Promise<boolean> {
  const { error } = await supabase.from('ghaith_task_events').delete().eq('id', id);
  return !error;
}

/** "اليوم 9:12 ص" / "أمس 4:30 م" */
export const eventTime = (iso: string) => {
  const d = new Date(iso);
  return `${dayLabel(d)} ${clock(d)}`;
};

const when = (v: unknown) => (typeof v === 'string' && v ? whenLabel(v) : tx('دون موعد', 'none'));

const FIELD: Record<string, () => string> = {
  title: () => tx('العنوان', 'Title'),
  notes: () => tx('الملاحظات', 'Notes'),
  kind: () => tx('النوع', 'Type'),
  category: () => tx('التصنيف', 'Category'),
  priority: () => tx('الأولوية', 'Priority'),
  person: () => tx('الشخص', 'Person'),
  due_at: () => tx('الموعد النهائي', 'Deadline'),
  remind_at: () => tx('التذكير', 'Reminder'),
  repeat: () => tx('التكرار', 'Repeat'),
};

function value(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') {
    return field === 'repeat' ? tx('لا يتكرر', 'never') : field === 'due_at' || field === 'remind_at' ? tx('دون موعد', 'none') : tx('فارغ', 'empty');
  }
  if (field === 'due_at' || field === 'remind_at') return when(v);
  if (field === 'kind') return KINDS[v as Kind]?.label ?? String(v);
  if (field === 'category') return v ? catOf(String(v)).label : String(v);
  if (field === 'priority') return v === 'high' ? tx('عاجلة', 'urgent') : tx('عادية', 'normal');
  if (field === 'repeat') return REPEATS[v as Repeat]?.label ?? String(v);
  return String(v);
}

/** One line per changed field: "التذكير: غداً 9:00 ص ← الخميس 11:00 ص" */
export function describeChanges(changes: Record<string, unknown> | null): string[] {
  if (!changes) return [];
  const out: string[] = [];
  for (const [field, pair] of Object.entries(changes)) {
    if (!FIELD[field] || !Array.isArray(pair)) continue;
    const [o, n] = pair;
    if (field === 'notes') out.push(n ? tx('حُدّثت الملاحظات', 'Notes updated') : tx('حُذفت الملاحظات', 'Notes removed'));
    else if (field === 'title') out.push(`${FIELD.title()}: ${value(field, n)}`);
    else out.push(`${FIELD[field]()}: ${value(field, o)} ${tx('←', '→')} ${value(field, n)}`);
  }
  return out;
}

/** What the comment on an event is: the reason for a change, how it was done, or a note added by hand */
export function noteLabel(e: TaskEvent): string {
  if (e.kind === 'done') return tx('كيف أُنجزت', 'How it was done');
  if (e.kind === 'updated' || e.kind === 'reopened') return tx('السبب', 'Why');
  return '';
}

export function eventTitle(e: TaskEvent): string {
  if (e.kind === 'created') {
    const s = (e.changes?.source as string) ?? 'manual';
    return s === 'voice' ? tx('أُنشئت من تسجيل صوتي', 'Created from a voice note') : s === 'text' ? tx('أُنشئت من نص مكتوب', 'Created from text') : s === 'email' ? tx('أُنشئت من بريد', 'Created from an email') : tx('أُنشئت يدوياً', 'Created by hand');
  }
  if (e.kind === 'done') return tx('أُنجزت', 'Marked done');
  if (e.kind === 'reopened') return tx('أُعيد فتحها', 'Reopened');
  if (e.kind === 'updated') {
    // Moved later or earlier: say so, rather than just "edited"
    const moved = (e.changes?.due_at ?? e.changes?.remind_at) as [string | null, string | null] | undefined;
    if (Array.isArray(moved) && moved[0] && moved[1]) return new Date(moved[1]) > new Date(moved[0]) ? tx('أُجّلت', 'Postponed') : tx('قُدّمت', 'Brought forward');
    return tx('عُدّلت', 'Edited');
  }
  return tx('ملاحظة', 'Note');
}
