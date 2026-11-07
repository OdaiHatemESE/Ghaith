// Email to Ghaith in the app: the addresses this person sends from (linked and verified), Ghaith's own address, and
// what arrived by email waiting for approval. Shared by Settings, the Inbox screen, the home card and the sidebar badge.
// Nothing arriving by email changes a task until the person approves it here.
import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';
import { tx } from './i18n';
import type { Proposal } from './store';
import { friendlyError, supabase } from './supabase';

export type Sender = { id: string; email: string; code: string; verified_at: string | null; created_at: string };
export type InboxItem = {
  id: string;
  sender: string;
  sender_name: string | null;
  subject: string | null;
  excerpt: string | null;
  proposals: Proposal[];
  status: 'pending' | 'done' | 'dismissed' | 'failed';
  error: string | null;
  received_at: string;
};

type State = { items: InboxItem[]; senders: Sender[]; address: string | null; loaded: boolean };
let state: State = { items: [], senders: [], address: null, loaded: false };
const listeners = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

export function useInbox() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  );
}

/** Emails waiting for a decision (or that could not be read), the linked addresses, and Ghaith's address */
export async function loadInbox(): Promise<void> {
  const [items, senders, address] = await Promise.all([
    supabase
      .from('ghaith_inbox')
      .select('id,sender,sender_name,subject,excerpt,proposals,status,error,received_at')
      .eq('kind', 'email')
      .in('status', ['pending', 'failed'])
      .order('received_at', { ascending: false })
      .limit(40),
    supabase.from('ghaith_senders').select('id,email,code,verified_at,created_at').order('created_at'),
    supabase.rpc('ghaith_inbox_address'),
  ]);
  if (items.error && senders.error) return; // offline: keep what was shown
  set({
    items: items.error ? state.items : ((items.data ?? []) as InboxItem[]),
    senders: senders.error ? state.senders : ((senders.data ?? []) as Sender[]),
    address: typeof address.data === 'string' && address.data.includes('@') ? address.data : null,
    loaded: true,
  });
}

export function clearInbox() {
  set({ items: [], senders: [], address: null, loaded: false });
}

/** Links an address; the database gives it a code. Returns an error sentence or null */
export async function addSender(raw: string): Promise<string | null> {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return tx('اكتب عنوان بريد صحيحاً، مثل name@mohesr.gov.ae', 'Enter a valid address, like name@company.com');
  if (state.senders.some((s) => s.email === email)) return tx('هذا العنوان مضاف من قبل.', 'This address is already added.');
  if (state.senders.length >= 5) return tx('يمكنك ربط 5 عناوين على الأكثر.', 'You can link up to 5 addresses.');
  const { error } = await supabase.from('ghaith_senders').insert({ email });
  if (error) return friendlyError(error);
  await loadInbox();
  return null;
}

export async function removeSender(id: string): Promise<void> {
  set({ senders: state.senders.filter((s) => s.id !== id) });
  await supabase.from('ghaith_senders').delete().eq('id', id);
  await loadInbox();
}

/** The person approved (done) or set aside (dismissed) what Ghaith proposed from one email */
export async function decide(id: string, status: 'done' | 'dismissed'): Promise<void> {
  set({ items: state.items.filter((i) => i.id !== id) });
  await supabase.from('ghaith_inbox').update({ status, decided_at: new Date().toISOString() }).eq('id', id);
}

/** Opens the mail app with a message to Ghaith carrying the code, ready to send */
export function sendCode(address: string, code: string) {
  const body = tx('رمز ربط هذا البريد بغيث', 'Code linking this address to Ghaith');
  Linking.openURL(`mailto:${address}?subject=${encodeURIComponent(code)}&body=${encodeURIComponent(`${body}: ${code}`)}`).catch(() => {});
}

/** Copies text where the platform allows it without a native module (the web); returns whether it worked */
export async function copy(text: string): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The email shown above the proposals in the review: who sent it, its subject, and the start of the text */
export const saidOf = (i: InboxItem) => [i.sender_name || i.sender, i.subject, i.excerpt].filter(Boolean).join(' — ');
