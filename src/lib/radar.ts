// Ghaith Radar in the app: the findings the server scan saved (ghaith_nudges), shared by the home card, the sidebar
// badge and the Radar screen. The wording comes from the same rules the server uses, so it follows the app's
// language. Nothing here changes a task by itself: every action is a button the user presses.
import { useSyncExternalStore } from 'react';
import { explain, Facts, localWhen, NudgeStatus, RiskType, Severity } from '../../supabase/functions/_shared/radar';
import { getLang, tx } from './i18n';
import { supabase } from './supabase';

export type RadarItem = {
  id: string;
  task_id: string;
  risk_type: RiskType;
  severity: Severity;
  score: number;
  facts: Facts;
  lang: 'ar' | 'en';
  ai_recommendation: string | null;
  ai_status: 'pending' | 'done' | 'failed' | 'skipped';
  status: NudgeStatus;
  first_detected_at: string;
  last_detected_at: string;
  notify_after: string;
};

type State = { items: RadarItem[]; loaded: boolean; lastScan: string | null; scanOk: boolean };
let state: State = { items: [], loaded: false, lastScan: null, scanOk: true };
const listeners = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

const FIELDS = 'id,task_id,risk_type,severity,score,facts,lang,ai_recommendation,ai_status,status,first_detected_at,last_detected_at,notify_after';

/** Active findings (new or seen), most important first, and when this person was last checked automatically */
export async function loadRadar(): Promise<void> {
  const [list, status, mine] = await Promise.all([
    supabase.from('ghaith_nudges').select(FIELDS).in('status', ['new', 'seen']).order('score', { ascending: false }).limit(60),
    supabase.rpc('ghaith_radar_status'),
    supabase.from('ghaith_settings').select('radar_checked_at').maybeSingle(),
  ]);
  if (list.error) return; // table not reachable (offline): keep what was shown
  const row = Array.isArray(status.data) ? status.data[0] : null;
  // The last automatic check of *this* person (each person has their own interval), not the scheduler's last run
  const checked = (mine.data as { radar_checked_at?: string | null } | null)?.radar_checked_at ?? null;
  set({ items: (Array.isArray(list.data) ? list.data : []) as RadarItem[], loaded: true, lastScan: checked ?? state.lastScan, scanOk: row ? !!row.ok : state.scanOk });
}

export function clearRadar() {
  set({ items: [], loaded: false, lastScan: null });
}

export function useRadar() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => state,
  );
}

/** Unread = new and past the quiet hours */
export const unreadCount = (items: RadarItem[], openIds: Set<string>, now = Date.now()) =>
  items.filter((i) => i.status === 'new' && openIds.has(i.task_id) && Date.parse(i.notify_after) <= now).length;

async function setStatus(ids: string[], status: 'seen' | 'dismissed' | 'acted') {
  if (!ids.length) return;
  const at = new Date().toISOString();
  const stamp = status === 'seen' ? { seen_at: at } : status === 'dismissed' ? { dismissed_at: at } : { acted_at: at };
  set({ items: status === 'seen' ? state.items.map((i) => (ids.includes(i.id) ? { ...i, status: 'seen' } : i)) : state.items.filter((i) => !ids.includes(i.id)) });
  let q = supabase.from('ghaith_nudges').update({ status, ...stamp }).in('id', ids);
  if (status === 'seen') q = q.eq('status', 'new');
  await q;
}
export const markSeen = (ids: string[]) => setStatus(ids, 'seen');
export const dismiss = (id: string) => setStatus([id], 'dismissed');
/** The user did something about it (completed / postponed): off the list until something new happens */
export const markActed = (id: string) => setStatus([id], 'acted');

/** "Check now": the same engine as the scheduled scan, for the signed-in user only */
export async function runCheck(): Promise<{ ok: true; created: number; refreshed: number } | { ok: false; message: string }> {
  const { data, error } = await supabase.functions.invoke('ghaith-radar', { body: { mode: 'manual' } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx?.status === 429) return { ok: false, message: tx('انتظر قليلاً قبل الفحص التالي.', 'Wait a few seconds before checking again.') };
    return { ok: false, message: tx('تعذّر الفحص الآن، حاول بعد قليل.', 'Could not check right now, try again shortly.') };
  }
  await loadRadar();
  return { ok: true, created: Number(data?.created ?? 0), refreshed: Number(data?.refreshed ?? 0) };
}

/** Reason, suggested step and whether the step came from the AI, in the app's current language */
export function wording(item: RadarItem): { reason: string; step: string; fromAI: boolean } {
  const lang = getLang() === 'en' ? 'en' : 'ar';
  const base = explain(item.risk_type, item.facts, lang);
  const ai = item.ai_status === 'done' && item.ai_recommendation && item.lang === lang ? item.ai_recommendation : null;
  return { reason: base.reason, step: ai ?? base.recommendation, fromAI: !!ai };
}

export const RISK_LABEL: Record<RiskType, () => string> = {
  overdue: () => tx('متأخرة', 'Overdue'),
  due_soon: () => tx('موعدها قريب', 'Due soon'),
  reply_pending: () => tx('بحاجة إلى ردّك', 'Needs your reply'),
  waiting_followup: () => tx('تحتاج متابعة', 'Follow up'),
  stale: () => tx('بلا تحديث', 'No update'),
};
export const SEVERITY_LABEL: Record<Severity, () => string> = {
  high: () => tx('عاجل', 'Urgent'),
  medium: () => tx('مهم', 'Important'),
  low: () => tx('للعلم', 'For your info'),
};

/** The date that matters for this finding (deadline), in the app's language */
export const relevantDate = (item: RadarItem) => localWhen(item.facts.due_at, getLang() === 'en' ? 'en' : 'ar');

/** What "Ask Ghaith" sends to the chat composer for this finding */
export function askFor(item: RadarItem, title: string): string {
  const who = item.facts.person;
  switch (item.risk_type) {
    case 'waiting_followup':
      return tx(`اكتب لي رسالة متابعة قصيرة ومهذّبة${who ? ` إلى ${who}` : ''} بخصوص: ${title}`, `Write me a short, polite follow-up message${who ? ` to ${who}` : ''} about: ${title}`);
    case 'reply_pending':
      return tx(`ساعدني في كتابة مسودة رد${who ? ` على ${who}` : ''} بخصوص: ${title}`, `Help me draft a reply${who ? ` to ${who}` : ''} about: ${title}`);
    case 'overdue':
      return tx(`المهمة «${title}» متأخرة. ساعدني أقرر: أنجزها اليوم أم أحدد موعداً جديداً؟`, `“${title}” is overdue. Help me decide: finish it today or set a new date?`);
    case 'due_soon':
      return tx(`موعد «${title}» قريب. ساعدني أقسّمها إلى خطوات صغيرة أبدأ بها الآن.`, `“${title}” is due soon. Help me break it into small steps to start now.`);
    default:
      return tx(`هل ما زالت «${title}» مطلوبة؟ ساعدني أقرر ماذا أفعل بها.`, `Is “${title}” still needed? Help me decide what to do with it.`);
  }
}

/** "every 8 hours" / "off", for the Radar screen and settings */
export function everyLabel(h: number): string {
  if (!h) return tx('متوقف', 'Off');
  if (h === 24) return tx('مرة يومياً', 'Once a day');
  return tx(`كل ${h === 2 ? 'ساعتين' : `${h} ساعات`}`, `Every ${h} hours`);
}
