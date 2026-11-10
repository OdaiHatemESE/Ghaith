// The signed-in person, their tasks and settings, and the capture step (what was said -> draft tasks), in one place.
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { botEmit } from './bot';
import { loginEmail } from './config';
import { friendlyError, supabase } from './supabase';
import { getLang, tx } from './i18n';
import { Task, TASK_FIELDS } from './tasks';

export type Voice = 'hamdan' | 'fatima' | 'device';
export type Settings = { morning_time: string | null; evening_time: string | null; speak_replies: boolean; follow_up_days: number; voice: Voice; keep_listening: boolean; lang: 'ar' | 'en'; radar_every_hours: RadarEvery };
/** How often Ghaith Radar checks automatically on the server; 0 = off */
export type RadarEvery = 0 | 2 | 4 | 8 | 12 | 24;
export const DEFAULT_SETTINGS: Settings = { morning_time: '08:00', evening_time: '20:00', speak_replies: true, follow_up_days: 3, voice: 'hamdan', keep_listening: true, lang: 'ar', radar_every_hours: 8 };
export type Source = 'voice' | 'text' | 'email';
export type Fields = Pick<Task, 'title' | 'kind' | 'category' | 'priority' | 'person' | 'due_at' | 'remind_at' | 'repeat' | 'notes'>;
/** A task being edited before it is saved (a new one from a capture, or an edit غيث proposed) */
export type Draft = Fields & { similar_to?: string | null };
/** One change غيث proposes from a capture; nothing is applied until the user saves */
export type Proposal =
  | { op: 'add'; task: Fields }
  | { op: 'update'; id: string; current: Fields; changes: Partial<Fields>; change: string | null; unsure: boolean }
  | { op: 'complete' | 'delete'; id: string; current: Fields; unsure: boolean };

type Status = 'loading' | 'out' | 'in';
/** `meeting_id`: new tasks come from that meeting's minutes; `comment`: the reason kept in each task's history */
export type ApplyOptions = { meeting_id?: string; comment?: string };

type Store = {
  status: Status;
  name: string;
  tasks: Task[];
  settings: Settings;
  loaded: boolean;
  signIn: (username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Sends one capture to غيث; resolves with the proposed changes (or throws a readable error) */
  capture: (text: string, source: Source) => Promise<Proposal[]>;
  /** Applies the proposals the user kept; returns an error sentence or null */
  apply: (list: Proposal[], source: Source, said?: string, opts?: ApplyOptions) => Promise<string | null>;
  /** `comment` (optional) is kept with the change in the task's history */
  complete: (id: string, comment?: string) => Promise<void>;
  reopen: (id: string, comment?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  save: (id: string | null, fields: Partial<Task>, comment?: string) => Promise<string | null>;
  saveSettings: (s: Partial<Settings>) => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const userId = session?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        // Signed out: forget everything that belonged to the previous person
        setTasks([]);
        setSettings(DEFAULT_SETTINGS);
        setName('');
        setLoaded(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadTasks = useCallback(async () => {
    const since = new Date(Date.now() - 21 * 86400000).toISOString();
    const [open, done] = await Promise.all([
      supabase.from('ghaith_tasks').select(TASK_FIELDS).eq('status', 'open').limit(500),
      supabase.from('ghaith_tasks').select(TASK_FIELDS).eq('status', 'done').gte('done_at', since).order('done_at', { ascending: false }).limit(100),
    ]);
    if (!open.error && !done.error) setTasks([...(open.data as Task[]), ...(done.data as Task[])]);
  }, []);


  const refresh = useCallback(async () => {
    if (!userId) return;
    await loadTasks();
    setLoaded(true);
  }, [userId, loadTasks]);

  // First load after sign-in: tasks, settings and the display name from the shared account
  useEffect(() => {
    if (!userId) return;
    // The state updates happen after the network calls resolve, not synchronously in this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTasks().then(() => setLoaded(true));
    supabase.from('ghaith_settings').select('morning_time,evening_time,speak_replies,follow_up_days,voice,keep_listening,lang,radar_every_hours').maybeSingle().then(({ data }) => {
      // The server writes Radar findings and advice in this language: keep it in step with the app
      if (!data || data.lang !== getLang()) supabase.from('ghaith_settings').upsert({ user_id: userId, lang: getLang(), updated_at: new Date().toISOString() }).then(() => {});
      if (data) setSettings({ ...DEFAULT_SETTINGS, ...data, morning_time: data.morning_time?.slice(0, 5) ?? null, evening_time: data.evening_time?.slice(0, 5) ?? null });
    });
    supabase.from('profiles').select('display_name,username').eq('id', userId).maybeSingle().then(({ data }) => {
      setName((data?.display_name || data?.username || '').trim());
    });
  }, [userId, loadTasks]);

  // Back to the app: pick up anything that changed (a reminder done from another device, a new day)
  const last = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - last.current > 30000) {
        last.current = Date.now();
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const signIn = useCallback(async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(username), password });
    return error ? friendlyError(error) : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const capture = useCallback(async (text: string, source: Source): Promise<Proposal[]> => {
    const { data, error } = await supabase.functions.invoke('ghaith-capture', { body: { text, source, lang: getLang() } });
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
    return (data?.actions ?? []) as Proposal[];
  }, []);

  const apply = useCallback(
    async (list: Proposal[], source: Source, said?: string, opts?: ApplyOptions) => {
      const errors: string[] = [];
      // What the person said becomes the reason for the changes Ghaith made from it, in each task's history
      const s = said?.trim().replace(/\s+/g, ' ');
      const quote = s ? (s.length > 240 ? `${s.slice(0, 240)}…` : s) : '';
      const comment = opts?.comment ?? (quote ? (source === 'voice' ? tx(`من تسجيل صوتي: «${quote}»`, `From a voice note: “${quote}”`) : source === 'email' ? tx(`من بريد: «${quote}»`, `From an email: “${quote}”`) : tx(`كتبتُ: «${quote}»`, `I wrote: “${quote}”`)) : null);
      const adds = list.filter((p): p is Extract<Proposal, { op: 'add' }> => p.op === 'add');
      if (adds.length) {
        const { error } = await supabase.from('ghaith_tasks').insert(adds.map((p) => ({ ...p.task, source: source === 'email' ? 'text' : source, ...(opts?.meeting_id ? { meeting_id: opts.meeting_id } : null) })));
        if (error) errors.push(friendlyError(error));
      }
      for (const p of list) {
        const res =
          p.op === 'update'
            ? await supabase.rpc('ghaith_change_task', { p_id: p.id, p_fields: p.changes, p_comment: comment })
            : p.op === 'complete'
              ? await supabase.rpc('ghaith_complete_task', { p_id: p.id, p_comment: comment })
              : p.op === 'delete'
                ? await supabase.from('ghaith_tasks').delete().eq('id', p.id)
                : null;
        if (res?.error) errors.push(friendlyError(res.error));
      }
      await loadTasks();
      return errors[0] ?? null;
    },
    [loadTasks],
  );

  const patchLocal = (id: string, fields: Partial<Task>) => setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...fields } : t)));

  const complete = useCallback(
    async (id: string, comment?: string) => {
      const title = tasks.find((t) => t.id === id)?.title ?? '';
      patchLocal(id, { status: 'done', done_at: new Date().toISOString() });
      const { error } = await supabase.rpc('ghaith_complete_task', { p_id: id, p_comment: comment?.trim() || null });
      if (error) patchLocal(id, { status: 'open', done_at: null });
      else botEmit({ kind: 'done', title });
      await loadTasks();
    },
    [loadTasks, tasks],
  );

  const reopen = useCallback(
    async (id: string, comment?: string) => {
      patchLocal(id, { status: 'open', done_at: null });
      await supabase.rpc('ghaith_reopen_task', { p_id: id, p_comment: comment?.trim() || null });
      await loadTasks();
    },
    [loadTasks],
  );

  const remove = useCallback(
    async (id: string) => {
      setTasks((list) => list.filter((t) => t.id !== id));
      await supabase.from('ghaith_tasks').delete().eq('id', id);
      await loadTasks();
    },
    [loadTasks],
  );

  /** Creates (id null) or updates a task by hand; returns an error sentence or null */
  const save = useCallback(
    async (id: string | null, fields: Partial<Task>, comment?: string) => {
      const { id: _i, created_at: _c, updated_at: _u, done_at: _d, ...clean } = fields;
      if (id) patchLocal(id, clean);
      // Changes go through ghaith_change_task so the comment lands in the task's history with the change
      const res = id
        ? await supabase.rpc('ghaith_change_task', { p_id: id, p_fields: clean, p_comment: comment?.trim() || null })
        : await supabase.from('ghaith_tasks').insert({ ...clean, source: 'manual' });
      await loadTasks();
      return res.error ? friendlyError(res.error) : null;
    },
    [loadTasks],
  );

  const saveSettings = useCallback(
    async (s: Partial<Settings>) => {
      const next = { ...settings, ...s };
      setSettings(next);
      if (!userId) return;
      await supabase.from('ghaith_settings').upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
    },
    [settings, userId],
  );

  const status: Status = session === undefined ? 'loading' : session ? 'in' : 'out';
  const value = useMemo(
    () => ({ status, name, tasks, settings, loaded, signIn, signOut, refresh, capture, apply, complete, reopen, remove, save, saveSettings }),
    [status, name, tasks, settings, loaded, signIn, signOut, refresh, capture, apply, complete, reopen, remove, save, saveSettings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
