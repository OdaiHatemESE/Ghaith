// Reminders are local notifications scheduled on this phone from the task list: each task's reminder, a morning
// briefing and an evening check-in. They are rebuilt whenever tasks or settings change. Web has no notifications.
// Each task reminder carries buttons (done / in an hour / tomorrow) handled in `useReminderActions`.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Settings } from './store';
import { getLang, tx } from './i18n';
import { addDays, anchor, atTime, dayLabel, groupOf, isLate, KINDS, startOfDay, Task, timeLabel } from './tasks';

export const notificationsSupported = Platform.OS === 'android' || Platform.OS === 'ios';

const CHANNEL = 'ghaith';
const CATEGORY = 'ghaith-task';
const MAX_SCHEDULED = 60; // iOS keeps at most 64

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

let prepared: string | null = null;
async function prepare() {
  if (prepared === getLang() || !notificationsSupported) return;
  prepared = getLang();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: tx('تذكيرات غيث', 'Ghaith reminders'),
      description: tx('تذكير بالمهام والمتابعات، وملخص الصباح والمساء', 'Task and follow-up reminders, plus the morning and evening summaries'),
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: 'done', buttonTitle: tx('أُنجزت ✓', 'Done ✓'), options: { opensAppToForeground: true } },
    { identifier: 'hour', buttonTitle: tx('بعد ساعة', 'In an hour'), options: { opensAppToForeground: true } },
    { identifier: 'tomorrow', buttonTitle: tx('صباح الغد', 'Tomorrow morning'), options: { opensAppToForeground: true } },
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
  const who = t.person;
  if (t.kind === 'waiting') return who ? tx(`ما زلت بانتظار رد ${who}. هل تتابع معه؟`, `Still waiting on ${who}. Follow up?`) : tx('ما زلت بانتظار الرد. هل تتابع؟', 'Still waiting for a reply. Follow up?');
  if (t.kind === 'reply') return who ? tx(`لم تردّ على ${who} بعد.`, `You haven’t replied to ${who} yet.`) : tx('لم تردّ بعد.', 'You haven’t replied yet.');
  if (t.due_at) {
    const d = new Date(t.due_at);
    const sameDay = startOfDay(d).getTime() === startOfDay(new Date()).getTime();
    return sameDay ? tx(`موعدها اليوم ${timeLabel(d)}`, `Due today at ${timeLabel(d)}`) : tx(`موعدها ${dayLabel(d)} ${timeLabel(d)}`, `Due ${dayLabel(d)} at ${timeLabel(d)}`);
  }
  return tx('لا تنسَها.', 'Don’t forget it.');
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
    .join('\n') + (list.length > 3 ? tx(`\nو${list.length - 3} غيرها`, `\nand ${list.length - 3} more`) : '');

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
      out.push({ at: new Date(due), title: tx(`حان الموعد: ${t.title}`, `Due now: ${t.title}`), body: tx('هل أنجزتها؟ إن لم تفعل، أجّلها إلى وقت يناسبك.', 'Done? If not, move it to a time that suits you.'), data: { taskId: t.id }, actions: true });
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
        if (due.length) parts.push(tx(`${due.length} لليوم`, `${due.length} today`));
        if (late.length) parts.push(tx(`${late.length} متأخرة`, `${late.length} overdue`));
        if (waiting) parts.push(tx(`${waiting} بانتظار رد`, `waiting on ${waiting}`));
        const body = parts.length ? `${parts.join(tx('، ', ', '))}\n${shortList([...late, ...due])}` : tx('لا شيء عاجل اليوم. أخبر غيث إن استجد شيء.', 'Nothing urgent today. Tell Ghaith if anything comes up.');
        out.push({ at, title: tx('صباح الخير، هذا يومك', 'Good morning, here’s your day'), body, data: { screen: 'home' } });
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
          out.push({ at, title: tx('ماذا عن مهام اليوم؟', 'How did today go?'), body: tx(`ما زالت ${left.length} مفتوحة. علّم ما أنجزته، أو أجّل الباقي.`, `${left.length} still open. Mark what’s done, or move the rest.`) + `\n${shortList(left)}`, data: { screen: 'home' } });
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
