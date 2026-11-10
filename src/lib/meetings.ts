// Meeting minutes: the person writes a meeting's title and its points as they come (typed or spoken), then Ghaith
// organises them into minutes (summary, topics, decisions, open questions) and proposes the actions as tasks.
// Tasks added from a meeting keep its id (ghaith_tasks.meeting_id), so the minutes show how their actions are going.
import { useSyncExternalStore } from 'react';
import { Platform, Share } from 'react-native';
import { getLang, tx } from './i18n';
import type { Proposal } from './store';
import { friendlyError, supabase } from './supabase';
import { clock, longDate } from './tasks';

export type Point = { id: string; text: string };
export type MinutesAction = { title: string; owner: 'me' | 'other'; person: string | null; category: string; priority: string; due_at: string | null; remind_at: string | null; notes: string };
export type Minutes = {
  summary: string;
  sections: { heading: string; points: string[] }[];
  decisions: string[];
  open_questions: string[];
  next_meeting: string | null;
  actions: MinutesAction[];
  proposals: Proposal[];
};
export type Meeting = {
  id: string;
  title: string;
  held_at: string;
  attendees: string | null;
  points: Point[];
  minutes: Minutes | null;
  organized_at: string | null;
  actions_added_at: string | null;
  created_at: string;
  updated_at: string;
};

const FIELDS = 'id,title,held_at,attendees,points,minutes,organized_at,actions_added_at,created_at,updated_at';

type State = { list: Meeting[]; loaded: boolean };
let state: State = { list: [], loaded: false };
const listeners = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};
const put = (m: Meeting) => set({ list: [m, ...state.list.filter((x) => x.id !== m.id)].sort((a, b) => (a.held_at < b.held_at ? 1 : -1)) });

export function useMeetings() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  );
}

export async function loadMeetings(): Promise<void> {
  const { data, error } = await supabase.from('ghaith_meetings').select(FIELDS).order('held_at', { ascending: false }).limit(100);
  if (!error) set({ list: (data ?? []) as Meeting[], loaded: true });
}

export async function loadMeeting(id: string): Promise<Meeting | null> {
  const { data } = await supabase.from('ghaith_meetings').select(FIELDS).eq('id', id).maybeSingle();
  if (data) put(data as Meeting);
  return (data as Meeting) ?? null;
}

type Editable = Partial<Pick<Meeting, 'title' | 'attendees' | 'points' | 'held_at'>>;

/** Creates the meeting the first time something is written in it */
export async function createMeeting(fields: Editable): Promise<{ meeting: Meeting | null; error: string | null }> {
  const { data, error } = await supabase.from('ghaith_meetings').insert(fields).select(FIELDS).single();
  if (error) return { meeting: null, error: friendlyError(error) };
  put(data as Meeting);
  return { meeting: data as Meeting, error: null };
}

export async function updateMeeting(id: string, fields: Editable & { actions_added_at?: string }): Promise<string | null> {
  const old = state.list.find((m) => m.id === id);
  if (old) put({ ...old, ...fields });
  const { error } = await supabase.from('ghaith_meetings').update(fields).eq('id', id);
  return error ? friendlyError(error) : null;
}

export async function deleteMeeting(id: string): Promise<void> {
  set({ list: state.list.filter((m) => m.id !== id) });
  await supabase.from('ghaith_meetings').delete().eq('id', id);
}

export function clearMeetings() {
  set({ list: [], loaded: false });
}

/** Ghaith organises the points (saved on the meeting first); resolves with the minutes or throws a readable error */
export async function organise(id: string): Promise<Minutes> {
  const { data, error } = await supabase.functions.invoke('ghaith-minutes', { body: { meeting_id: id, lang: getLang() } });
  if (error) {
    let message = tx('تعذّر الوصول إلى غيث، تحقّق من الإنترنت وحاول مرة أخرى.', 'Could not reach Ghaith. Check your connection and try again.');
    try {
      const ctx = (error as { context?: Response }).context;
      const body = ctx ? await ctx.json() : null;
      if (body?.message) message = body.message;
    } catch {
      // keep the general message
    }
    throw new Error(message);
  }
  const minutes = data.minutes as Minutes;
  const old = state.list.find((m) => m.id === id);
  if (old) put({ ...old, minutes, organized_at: new Date().toISOString() });
  return minutes;
}

export const newPointId = () => Math.random().toString(36).slice(2, 10);

/** "الأحد 9 نوفمبر · 10:30 ص" */
export const meetingWhen = (iso: string) => `${longDate(new Date(iso))} · ${clock(new Date(iso))}`;

/** The minutes as plain text, for email, WhatsApp or a document */
export function minutesText(m: Meeting): string {
  const n = m.minutes;
  const lines: string[] = [tx(`محضر اجتماع: ${m.title || 'بدون عنوان'}`, `Minutes: ${m.title || 'Untitled'}`), meetingWhen(m.held_at)];
  if (m.attendees) lines.push(tx(`الحضور: ${m.attendees}`, `Attendees: ${m.attendees}`));
  if (!n) {
    lines.push('', ...m.points.map((p, i) => `${i + 1}. ${p.text}`));
    return lines.join('\n');
  }
  if (n.summary) lines.push('', tx('الملخص', 'Summary'), n.summary);
  for (const s of n.sections) lines.push('', s.heading, ...s.points.map((p) => `• ${p}`));
  if (n.decisions.length) lines.push('', tx('القرارات', 'Decisions'), ...n.decisions.map((d, i) => `${i + 1}. ${d}`));
  if (n.actions.length)
    lines.push(
      '',
      tx('الإجراءات', 'Actions'),
      ...n.actions.map((a, i) => {
        const who = a.owner === 'me' ? tx('أنا', 'Me') : a.person || tx('آخرون', 'Others');
        const due = a.due_at ? ` — ${tx('قبل', 'by')} ${longDate(new Date(a.due_at))}` : '';
        return `${i + 1}. ${a.title} (${who})${due}`;
      }),
    );
  if (n.open_questions.length) lines.push('', tx('نقاط مفتوحة', 'Open questions'), ...n.open_questions.map((q) => `• ${q}`));
  if (n.next_meeting) lines.push('', tx(`الاجتماع القادم: ${n.next_meeting}`, `Next meeting: ${n.next_meeting}`));
  return lines.join('\n');
}

/** The phone's share sheet; on the web the browser's, or a copy to the clipboard. Returns 'copied' when it copied */
export async function shareMinutes(m: Meeting): Promise<'shared' | 'copied' | 'failed'> {
  const message = minutesText(m);
  if (Platform.OS !== 'web') {
    try {
      await Share.share({ message, title: m.title });
      return 'shared';
    } catch {
      return 'failed';
    }
  }
  const nav = globalThis.navigator as Navigator | undefined;
  if (nav?.share && /Mobi|Android|iPhone/i.test(nav.userAgent)) {
    try {
      await nav.share({ title: m.title, text: message });
      return 'shared';
    } catch {
      // cancelled: fall through to copying
    }
  }
  try {
    await nav!.clipboard.writeText(message);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Opens the mail app with the minutes ready to send */
export function mailMinutes(m: Meeting): string {
  return `mailto:?subject=${encodeURIComponent(tx(`محضر اجتماع: ${m.title}`, `Minutes: ${m.title}`))}&body=${encodeURIComponent(minutesText(m))}`;
}
