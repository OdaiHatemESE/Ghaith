import type { IconName } from '../ui';
import { getLang, tx } from './i18n';

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

type Labelled = { readonly label: string };
/** An object whose `label` follows the current language */
function L<T extends object>(ar: string, en: string, rest?: T): T & Labelled {
  return Object.defineProperty({ ...(rest ?? {}) }, 'label', { get: () => tx(ar, en), enumerable: true }) as T & Labelled;
}

export const KINDS: Record<Kind, Labelled & { icon: IconName; color: string }> = {
  todo: L('مهمة', 'To-do', { icon: 'check', color: '#1B1F6B' }),
  waiting: L('بانتظار رد', 'Waiting on', { icon: 'timer-sand', color: '#7C5CFF' }),
  reply: L('بحاجة إلى رد', 'Needs reply', { icon: 'reply', color: '#0E8F91' }),
};
export const KIND_ORDER: Kind[] = ['todo', 'waiting', 'reply'];

export const CATS: Record<Category, Labelled & { icon: IconName; color: string }> = {
  work: L('عمل', 'Work', { icon: 'briefcase-outline', color: '#2F35A8' }),
  home: L('منزل', 'Home', { icon: 'home-outline', color: '#0E8F91' }),
  car: L('سيارة', 'Car', { icon: 'car-outline', color: '#C2570C' }),
  family: L('عائلة', 'Family', { icon: 'account-group-outline', color: '#D9468F' }),
  personal: L('شخصي', 'Personal', { icon: 'account-outline', color: '#7C5CFF' }),
  money: L('مالية', 'Money', { icon: 'cash-multiple', color: '#B76E00' }),
  other: L('أخرى', 'Other', { icon: 'dots-horizontal', color: '#6B7280' }),
};
export const CAT_ORDER: Category[] = ['work', 'home', 'car', 'family', 'personal', 'money', 'other'];

export const REPEATS: Record<Repeat, Labelled> = {
  daily: L('يومياً', 'Daily'),
  weekly: L('أسبوعياً', 'Weekly'),
  monthly: L('شهرياً', 'Monthly'),
  yearly: L('سنوياً', 'Yearly'),
};

// ---------- dates (device local time; the app is used in the UAE) ----------
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayName = (d: Date) => (getLang() === 'en' ? DAYS_EN : DAYS_AR)[d.getDay()];
const monthName = (d: Date) => (getLang() === 'en' ? MONTHS_EN : MONTHS_AR)[d.getMonth()];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const dayDiff = (d: Date, now = new Date()) => Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);

/** "10:30 ص" / "10:30 AM" */
export function clock(d: Date): string {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? tx('ص', 'AM') : tx('م', 'PM')}`;
}
export const timeLabel = clock;

/** "اليوم"، "غداً"، "الخميس"، "الخميس 12 نوفمبر" */
export function dayLabel(d: Date, now = new Date()): string {
  const diff = dayDiff(d, now);
  if (diff === 0) return tx('اليوم', 'Today');
  if (diff === 1) return tx('غداً', 'Tomorrow');
  if (diff === -1) return tx('أمس', 'Yesterday');
  if (diff > 1 && diff < 7) return dayName(d);
  return getLang() === 'en' ? `${dayName(d).slice(0, 3)} ${d.getDate()} ${monthName(d).slice(0, 3)}` : `${dayName(d)} ${d.getDate()} ${monthName(d)}`;
}

/** "9:00 ص" today, otherwise "غداً 9:00 ص" */
export function shortWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return (dayDiff(d, now) === 0 ? '' : dayLabel(d, now) + ' ') + clock(d);
}

export const whenLabel = (iso: string) => {
  const d = new Date(iso);
  return `${dayLabel(d)} ${clock(d)}`;
};

export function longDate(d = new Date()): string {
  return getLang() === 'en' ? `${dayName(d)}, ${d.getDate()} ${monthName(d)}` : `${dayName(d)}، ${d.getDate()} ${monthName(d)}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return tx('صباح الخير', 'Good morning');
  if (h < 17) return tx('طاب يومك', 'Good afternoon');
  return tx('مساء الخير', 'Good evening');
}

/** When the task "lives": its deadline, otherwise its reminder */
export const anchor = (t: Task) => t.due_at ?? t.remind_at;
export const isLate = (t: Task, now = new Date()) => t.status === 'open' && !!t.due_at && new Date(t.due_at) < now;

export type GroupKey = 'late' | 'today' | 'tomorrow' | 'week' | 'later' | 'someday';
export const GROUPS: Record<GroupKey, Labelled> = {
  late: L('متأخرة', 'Overdue'),
  today: L('اليوم', 'Today'),
  tomorrow: L('غداً', 'Tomorrow'),
  week: L('هذا الأسبوع', 'This week'),
  later: L('لاحقاً', 'Later'),
  someday: L('دون موعد', 'No date'),
};
export const GROUP_ORDER: GroupKey[] = ['late', 'today', 'tomorrow', 'week', 'later', 'someday'];

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
