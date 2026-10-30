// Reminders are local notifications scheduled on this phone from the task list: each task's reminder, a morning
// briefing and an evening check-in. They are rebuilt whenever tasks or settings change. Web has no notifications.
// Each task reminder carries buttons (done / in an hour / tomorrow) handled in `useReminderActions`.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Settings } from './store';
import { addDays, anchor, atTime, groupOf, isLate, KINDS, startOfDay, Task, timeLabel } from './tasks';

export const notificationsSupported = Platform.OS === 'android' || Platform.OS === 'ios';

const CHANNEL = 'ghaith';
const CATEGORY = 'ghaith-task';
const MAX_SCHEDULED = 60; // iOS keeps at most 64

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

let prepared = false;
async function prepare() {
  if (prepared || !notificationsSupported) return;
  prepared = true;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'تذكيرات غيث',
      description: 'تذكير بالمهام والمتابعات، وملخص الصبح والمسا',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: 'done', buttonTitle: 'خلصت ✓', options: { opensAppToForeground: true } },
    { identifier: 'hour', buttonTitle: 'بعد ساعة', options: { opensAppToForeground: true } },
    { identifier: 'tomorrow', buttonTitle: 'بكرة الصبح', options: { opensAppToForeground: true } },
  ]);
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function notificationPermission(ask = false): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported';
  try {
    await prepare();
    let p = await Notifications.getPermissionsAsync();
    if (!p.granted && ask && p.canAskAgain) p = await Notifications.requestPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

type Planned = { at: Date; title: string; body: string; data: Record<string, string>; actions?: boolean };

function taskBody(t: Task): string {
  const who = t.person ? ` ${t.person}` : '';
  if (t.kind === 'waiting') return `لسا ناطر رد${who ? ' من' + who : ''}. بدك تلحقه؟`;
  if (t.kind === 'reply') return `لسا ما رديت${who ? ' على' + who : ''}.`;
  if (t.due_at) {
    const d = new Date(t.due_at);
    const sameDay = startOfDay(d).getTime() === startOfDay(new Date()).getTime();
    return sameDay ? `موعدها اليوم ${timeLabel(d)}` : `${KINDS.todo.label} · موعدها ${d.getDate()}/${d.getMonth() + 1} ${timeLabel(d)}`;
  }
  return 'لا تنساها';
}

const parseHM = (hm: string | null) => {
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  return Number.isFinite(h) ? { h, m: m || 0 } : null;
};

const shortList = (list: Task[]) =>
  list
    .slice(0, 3)
    .map((t) => '• ' + t.title)
    .join('\n') + (list.length > 3 ? `\nو${list.length - 3} غيرهم` : '');

/** Everything that should ring in the coming week, nearest first */
export function plan(tasks: Task[], settings: Settings, now = new Date()): Planned[] {
  const open = tasks.filter((t) => t.status === 'open');
  const out: Planned[] = [];

  for (const t of open) {
    if (t.remind_at && new Date(t.remind_at) > now) {
      out.push({ at: new Date(t.remind_at), title: t.kind === 'todo' ? t.title : `${KINDS[t.kind].label}: ${t.title}`, body: taskBody(t), data: { taskId: t.id }, actions: true });
    }
    // At the deadline itself, unless the reminder already rings then
    const due = t.due_at ? new Date(t.due_at).getTime() : 0;
    if (due > now.getTime() && (!t.remind_at || new Date(t.remind_at).getTime() < due - 10 * 60000)) {
      out.push({ at: new Date(due), title: `وصل الموعد: ${t.title}`, body: 'خلصت؟ إذا لا، أجّلها لوقت يناسبك.', data: { taskId: t.id }, actions: true });
    }
  }

  const morning = parseHM(settings.morning_time);
  const evening = parseHM(settings.evening_time);
  for (let i = 0; i < 7; i++) {
    const day = addDays(startOfDay(now), i);
    if (morning) {
      const at = atTime(day, morning.h, morning.m);
      if (at > now) {
        const due = open.filter((t) => {
          const a = anchor(t);
          return a && startOfDay(new Date(a)).getTime() === day.getTime();
        });
        const late = open.filter((t) => isLate(t, at));
        const waiting = open.filter((t) => t.kind === 'waiting').length;
        const parts: string[] = [];
        if (due.length) parts.push(`${due.length} لليوم`);
        if (late.length) parts.push(`${late.length} متأخر`);
        if (waiting) parts.push(`ناطر رد على ${waiting}`);
        const body = parts.length ? `${parts.join('، ')}\n${shortList([...late, ...due])}` : 'ما عندك شيء مستعجل اليوم. احكيلي إذا في شيء جديد.';
        out.push({ at, title: 'صباح الخير، هاد يومك', body, data: { screen: 'home' } });
      }
    }
    if (evening) {
      const at = atTime(day, evening.h, evening.m);
      if (at > now) {
        const left = open.filter((t) => {
          const g = groupOf(t, at);
          return g === 'today' || g === 'late';
        });
        if (left.length) {
          out.push({ at, title: 'شو صار مع مهام اليوم؟', body: `باقي ${left.length} مفتوحين. علّم اللي خلص، أو احكيلي أأجّل الباقي.\n${shortList(left)}`, data: { screen: 'home' } });
        }
      }
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

/** Replaces every scheduled notification with the current plan */
export async function syncReminders(tasks: Task[], settings: Settings): Promise<void> {
  if (!notificationsSupported) return;
  try {
    if ((await notificationPermission()) !== 'granted') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const p of plan(tasks, settings)) {
      await Notifications.scheduleNotificationAsync({
        content: { title: p.title, body: p.body, data: p.data, categoryIdentifier: p.actions ? CATEGORY : undefined },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
      });
    }
  } catch (e) {
    console.warn('[reminders] could not schedule', e);
  }
}

export async function clearReminders(): Promise<void> {
  if (!notificationsSupported) return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

export type ReminderTap = { taskId?: string; action: 'open' | 'done' | 'hour' | 'tomorrow' };

/** Calls `handle` for taps on notifications and their buttons, including the one that opened the app */
export function onReminderTap(handle: (t: ReminderTap) => void): () => void {
  if (!notificationsSupported) return () => {};
  const seen = new Set<string>();
  const run = (r: Notifications.NotificationResponse | null) => {
    if (!r) return;
    const key = r.notification.request.identifier + r.actionIdentifier;
    if (seen.has(key)) return;
    seen.add(key);
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
    Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {});
    const data = r.notification.request.content.data as { taskId?: string };
    const a = r.actionIdentifier;
    handle({ taskId: data?.taskId, action: a === 'done' || a === 'hour' || a === 'tomorrow' ? a : 'open' });
  };
  Notifications.getLastNotificationResponseAsync().then(run).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(run);
  return () => sub.remove();
}
