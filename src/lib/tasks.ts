import type { IconName } from '../ui';

export type Kind = 'todo' | 'waiting' | 'reply';
export type Category = 'work' | 'home' | 'car' | 'family' | 'personal' | 'money' | 'other';
export type Priority = 'high' | 'normal' | 'low';
export type Repeat = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  kind: Kind;
  category: Category;
  priority: Priority;
  person: string | null;
  due_at: string | null;
  remind_at: string | null;
  repeat: Repeat | null;
  status: 'open' | 'done';
  done_at: string | null;
  source: 'voice' | 'text' | 'manual';
  created_at: string;
  updated_at: string;
};

export const TASK_FIELDS = 'id,title,notes,kind,category,priority,person,due_at,remind_at,repeat,status,done_at,source,created_at,updated_at';

export const KINDS: Record<Kind, { label: string; short: string; icon: IconName; color: string }> = {
  todo: { label: 'عليّ', short: 'عليّ', icon: 'checkbox-blank-circle-outline', color: '#2366E8' },
  waiting: { label: 'ناطر رد', short: 'ناطر', icon: 'timer-sand', color: '#C27A0B' },
  reply: { label: 'لازم أرد', short: 'ما رديت', icon: 'reply', color: '#7A3FE0' },
};
export const KIND_ORDER: Kind[] = ['todo', 'waiting', 'reply'];

export const CATS: Record<Category, { label: string; icon: IconName; color: string }> = {
  work: { label: 'عمل', icon: 'briefcase-outline', color: '#2366E8' },
  home: { label: 'بيت', icon: 'home-outline', color: '#0E8F6B' },
  car: { label: 'سيارة', icon: 'car-outline', color: '#DC6A2C' },
  family: { label: 'عائلة', icon: 'account-group-outline', color: '#CF4D86' },
  personal: { label: 'شخصي', icon: 'account-outline', color: '#7A3FE0' },
  money: { label: 'فلوس', icon: 'cash-multiple', color: '#A8761A' },
  other: { label: 'أخرى', icon: 'dots-horizontal', color: '#64748B' },
};
export const CAT_ORDER: Category[] = ['work', 'home', 'car', 'family', 'personal', 'money', 'other'];

export const REPEATS: Record<Repeat, string> = { daily: 'كل يوم', weekly: 'كل أسبوع', monthly: 'كل شهر', yearly: 'كل سنة' };

// ---------- dates (device local time; the app is used in the UAE) ----------
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
const dayDiff = (d: Date, now = new Date()) => Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);

export function timeLabel(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 4 ? 'بالليل' : h < 12 ? 'الصبح' : h < 16 ? 'الظهر' : h < 19 ? 'العصر' : h < 23 ? 'المسا' : 'بالليل';
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${part}`;
}

export function dayLabel(d: Date, now = new Date()): string {
  const diff = dayDiff(d, now);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'بكرة';
  if (diff === -1) return 'مبارح';
  if (diff === 2) return 'بعد بكرة';
  if (diff > 2 && diff < 7) return DAYS[d.getDay()];
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const whenLabel = (iso: string) => {
  const d = new Date(iso);
  return `${dayLabel(d)} ${timeLabel(d)}`;
};

export function longDate(d = new Date()): string {
  return `${DAYS[d.getDay()]}، ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'سهرانين';
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'نهارك سعيد';
  return 'مسا الخير';
}

/** When the task "lives": its deadline, otherwise its reminder */
export const anchor = (t: Task) => t.due_at ?? t.remind_at;
export const isLate = (t: Task, now = new Date()) => t.status === 'open' && !!t.due_at && new Date(t.due_at) < now;

export type GroupKey = 'late' | 'today' | 'tomorrow' | 'week' | 'later' | 'someday';
export const GROUPS: Record<GroupKey, string> = {
  late: 'متأخر',
  today: 'اليوم',
  tomorrow: 'بكرة',
  week: 'هالأسبوع',
  later: 'لاحقاً',
  someday: 'بدون موعد',
};

export function groupOf(t: Task, now = new Date()): GroupKey {
  if (isLate(t, now)) return 'late';
  const a = anchor(t);
  if (!a) return 'someday';
  const diff = dayDiff(new Date(a), now);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return 'week';
  return 'later';
}

const PRI = { high: 0, normal: 1, low: 2 };
export function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    const p = PRI[a.priority] - PRI[b.priority];
    if (p) return p;
    const aa = anchor(a);
    const bb = anchor(b);
    if (aa && bb && aa !== bb) return aa < bb ? -1 : 1;
    if (!aa !== !bb) return aa ? -1 : 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

/** Quick picks for dates and times in the edit sheet */
export function atTime(day: Date, hh: number, mm = 0): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
}
export function nextMonday(now = new Date()): Date {
  const d = startOfDay(now);
  const add = ((8 - d.getDay()) % 7) || 7;
  return addDays(d, add);
}
