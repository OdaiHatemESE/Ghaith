// The optional conversation with غيث (like a chat assistant): it answers questions about your tasks and acts on them
// directly. The main way in stays the one-shot capture + review; this is for when you'd rather just talk.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLang, tx } from './i18n';
import { supabase } from './supabase';

export type ChatAction = { type: 'added' | 'updated' | 'done' | 'deleted' | 'reopened'; id: string; title: string };
export type ChatMessage = { id: number | string; role: 'user' | 'assistant'; content: string; actions: ChatAction[]; created_at: string; pending?: boolean };

const KEY = 'ghaith.chatSince';

/** When the current conversation started (a new one begins from "New chat") */
export async function chatSince(): Promise<string> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v) return v;
  } catch {
    // fall through
  }
  return newChat();
}

export async function newChat(): Promise<string> {
  const now = new Date().toISOString();
  try {
    await AsyncStorage.setItem(KEY, now);
  } catch {
    // keep going without remembering
  }
  return now;
}

export async function loadChat(since: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('ghaith_messages')
    .select('id,role,content,actions,created_at')
    .or('role.eq.assistant,actions.cs.[{"type":"chat"}]')
    .gte('created_at', since)
    .order('id', { ascending: true })
    .limit(200);
  return ((data ?? []) as ChatMessage[]).map((m) => ({ ...m, actions: m.role === 'assistant' ? (m.actions ?? []) : [] }));
}

/** `spoken`: the voice conversation, where the reply is read aloud and so comes back short */
export async function sendChat(text: string, source: 'voice' | 'text', since: string, spoken = false): Promise<{ reply: string; actions: ChatAction[] }> {
  const { data, error } = await supabase.functions.invoke('ghaith-agent', { body: { text, source, lang: getLang(), since, mode: spoken ? 'voice' : undefined } });
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
  return { reply: String(data?.reply ?? ''), actions: (data?.actions ?? []) as ChatAction[] };
}
