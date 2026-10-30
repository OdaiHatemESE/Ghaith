// The signed-in person, their tasks, the conversation with غيث and their settings, in one place.
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { loginEmail } from './config';
import { friendlyError, supabase } from './supabase';
import { Task, TASK_FIELDS } from './tasks';

export type Action = { type: 'added' | 'updated' | 'done' | 'deleted' | 'reopened'; id: string; title: string };
export type Message = { id: number; role: 'user' | 'assistant'; content: string; actions: Action[]; created_at: string };
export type Settings = { morning_time: string | null; evening_time: string | null; speak_replies: boolean; follow_up_days: number };
export const DEFAULT_SETTINGS: Settings = { morning_time: '08:00', evening_time: '20:00', speak_replies: true, follow_up_days: 3 };

type Status = 'loading' | 'out' | 'in';

type Store = {
  status: Status;
  name: string;
  tasks: Task[];
  messages: Message[];
  settings: Settings;
  loaded: boolean;
  signIn: (username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Sends what the user said to غيث; resolves with غيث's reply (or throws a readable error) */
  ask: (text: string, source: 'voice' | 'text') => Promise<{ reply: string; actions: Action[] }>;
  complete: (id: string) => Promise<void>;
  reopen: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  save: (id: string | null, fields: Partial<Task>) => Promise<string | null>;
  saveSettings: (s: Partial<Settings>) => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
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
        setMessages([]);
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

  const loadMessages = useCallback(async () => {
    const { data } = await supabase.from('ghaith_messages').select('id,role,content,actions,created_at').order('id', { ascending: false }).limit(60);
    if (data) setMessages((data as Message[]).reverse());
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    await Promise.all([loadTasks(), loadMessages()]);
    setLoaded(true);
  }, [userId, loadTasks, loadMessages]);

  // First load after sign-in: tasks, conversation, settings and the display name from the shared account
  useEffect(() => {
    if (!userId) return;
    // The state updates happen after the network calls resolve, not synchronously in this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([loadTasks(), loadMessages()]).then(() => setLoaded(true));
    supabase.from('ghaith_settings').select('morning_time,evening_time,speak_replies,follow_up_days').maybeSingle().then(({ data }) => {
      if (data) setSettings({ ...DEFAULT_SETTINGS, ...data, morning_time: data.morning_time?.slice(0, 5) ?? null, evening_time: data.evening_time?.slice(0, 5) ?? null });
    });
    supabase.from('profiles').select('display_name,username').eq('id', userId).maybeSingle().then(({ data }) => {
      setName((data?.display_name || data?.username || '').trim());
    });
  }, [userId, loadTasks, loadMessages]);

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

  const ask = useCallback(
    async (text: string, source: 'voice' | 'text') => {
      // Show what was said right away, the reply follows
      const temp: Message = { id: -Date.now(), role: 'user', content: text, actions: [], created_at: new Date().toISOString() };
      setMessages((m) => [...m, temp]);
      const { data, error } = await supabase.functions.invoke('ghaith-agent', { body: { text, source } });
      if (error) {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        let message = 'ما قدرت أوصل لغيث، تأكد من الإنترنت وجرّب كمان مرة.';
        try {
          const ctx = (error as { context?: Response }).context;
          const body = ctx ? await ctx.json() : null;
          if (body?.message) message = body.message;
        } catch {
          // keep the general message
        }
        throw new Error(message);
      }
      await Promise.all([loadTasks(), loadMessages()]);
      return { reply: String(data?.reply ?? ''), actions: (data?.actions ?? []) as Action[] };
    },
    [loadTasks, loadMessages],
  );

  const patchLocal = (id: string, fields: Partial<Task>) => setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...fields } : t)));

  const complete = useCallback(
    async (id: string) => {
      patchLocal(id, { status: 'done', done_at: new Date().toISOString() });
      const { error } = await supabase.rpc('ghaith_complete_task', { p_id: id });
      if (error) patchLocal(id, { status: 'open', done_at: null });
      await loadTasks();
    },
    [loadTasks],
  );

  const reopen = useCallback(
    async (id: string) => {
      patchLocal(id, { status: 'open', done_at: null });
      await supabase.from('ghaith_tasks').update({ status: 'open' }).eq('id', id);
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
    async (id: string | null, fields: Partial<Task>) => {
      const { id: _i, created_at: _c, updated_at: _u, done_at: _d, ...clean } = fields;
      if (id) patchLocal(id, clean);
      const res = id
        ? await supabase.from('ghaith_tasks').update(clean).eq('id', id)
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
    () => ({ status, name, tasks, messages, settings, loaded, signIn, signOut, refresh, ask, complete, reopen, remove, save, saveSettings }),
    [status, name, tasks, messages, settings, loaded, signIn, signOut, refresh, ask, complete, reopen, remove, save, saveSettings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
