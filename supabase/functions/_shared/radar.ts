// Ghaith Radar: the rules that decide which open tasks need the user's attention, and why.
// Pure functions with no imports, shared by the scheduled scan (ghaith-radar), the app (to word findings in the
// user's language) and the tests (radar.test.ts). Deterministic and explainable: every finding carries the facts
// it was based on; nothing here guesses how likely a task is to be finished.

export type Kind = 'todo' | 'waiting' | 'reply';
export type Lang = 'ar' | 'en';
export type RiskType = 'overdue' | 'reply_pending' | 'waiting_followup' | 'due_soon' | 'stale';
export type Severity = 'low' | 'medium' | 'high';
export type NudgeStatus = 'new' | 'seen' | 'dismissed' | 'acted' | 'resolved';

export type RadarTask = {
  id: string;
  user_id: string;
  title: string;
  kind: Kind;
  priority: 'high' | 'normal' | 'low';
  person: string | null;
  due_at: string | null;
  remind_at: string | null;
  repeat: string | null;
  status: 'open' | 'done';
  created_at: string;
  updated_at: string;
};

export type RadarSettings = { follow_up_days: number; lang: Lang };

/** What the rules measured; enough to word the finding again in either language */
export type Facts = {
  kind: Kind;
  priority: RadarTask['priority'];
  person: string | null;
  due_at: string | null;
  hours_late?: number;
  hours_left?: number;
  age_hours?: number;
  hours_waiting?: number;
  hours_past_follow_up?: number;
  hours_unchanged?: number;
  busy_count?: number;
};

export type Finding = {
  user_id: string;
  task_id: string;
  risk_type: RiskType;
  severity: Severity;
  score: number;
  facts: Facts;
  fingerprint: string;
  lang: Lang;
  reason: string;
  recommendation: string;
  notify_after: string;
  ai_status: 'pending' | 'skipped';
};

export type Nudge = {
  id: string;
  user_id: string;
  task_id: string;
  risk_type: RiskType;
  severity: Severity;
  score: number;
  fingerprint: string;
  status: NudgeStatus;
  detect_count: number;
  dismissed_at: string | null;
  acted_at: string | null;
  resolved_at: string | null;
};

const H = 3_600_000;
const D = 24 * H;
export const TZ_OFFSET_H = 4; // Asia/Dubai, no daylight saving

/** Policy, in one place so it can be read and tuned */
export const POLICY = {
  freshTaskHours: 1, // a task created in the last hour is not flagged as "due soon" or "no reply yet": the user just added it
  dueSoonHours: 24,
  dueSoonHoursWide: 48, // low severity, normal priority
  dueSoonHoursUrgent: 72, // high-priority tasks are flagged earlier
  replyNoDueDays: 2, // a reply with no deadline is flagged after 2 days
  staleDays: 14,
  busyDayCount: 3, // three or more tasks due within 24 hours make each of them more urgent
  reopenCooldownHours: 24, // a dismissed (or acted on) finding never comes back sooner than this
  quietFrom: 22, // findings made at night don't light the badge until the morning
  quietTo: 7,
};

const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };
// When two rules fire on the same task, the higher score wins; on a tie, this order
const ORDER: RiskType[] = ['overdue', 'reply_pending', 'waiting_followup', 'due_soon', 'stale'];

const t = (iso: string | null) => (iso ? Date.parse(iso) : NaN);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const severityOf = (score: number): Severity => (score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low');
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The next moment outside quiet hours (Dubai), or now */
export function notifyAfter(now: Date): string {
  const local = new Date(now.getTime() + TZ_OFFSET_H * H);
  const h = local.getUTCHours();
  if (h >= POLICY.quietFrom || h < POLICY.quietTo) {
    const morning = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), POLICY.quietTo) - TZ_OFFSET_H * H);
    if (h >= POLICY.quietFrom) morning.setTime(morning.getTime() + D);
    return morning.toISOString();
  }
  return now.toISOString();
}

type Candidate = { risk_type: RiskType; score: number; facts: Facts };

/** Every rule that fires for one task (usually none or one) */
export function candidates(task: RadarTask, settings: RadarSettings, now: Date, busyCount: number): Candidate[] {
  if (task.status !== 'open') return [];
  const nowMs = now.getTime();
  const due = t(task.due_at);
  const created = t(task.created_at);
  const updated = t(task.updated_at);
  const high = task.priority === 'high';
  const base: Facts = { kind: task.kind, priority: task.priority, person: task.person, due_at: task.due_at };
  const ageH = (nowMs - created) / H;
  const fresh = ageH < POLICY.freshTaskHours;
  const out: Candidate[] = [];

  // A. Overdue: the deadline itself has passed
  if (!isNaN(due) && due < nowMs) {
    const hoursLate = (nowMs - due) / H;
    const score = 60 + (high ? 20 : 0) + Math.min(20, Math.floor(hoursLate / 24) * 5) + (task.kind === 'reply' ? 5 : 0);
    out.push({ risk_type: 'overdue', score: clamp(score), facts: { ...base, hours_late: round1(hoursLate) } });
    return out; // nothing else matters more than a missed deadline
  }
  const hoursLeft = isNaN(due) ? null : (due - nowMs) / H;

  // D. A reply I owe someone
  if (task.kind === 'reply' && !fresh) {
    if (hoursLeft !== null && hoursLeft <= POLICY.dueSoonHoursWide) {
      const score = (hoursLeft <= POLICY.dueSoonHours ? 70 : 50) + (high ? 15 : 0);
      out.push({ risk_type: 'reply_pending', score: clamp(score), facts: { ...base, hours_left: round1(hoursLeft), age_hours: round1(ageH) } });
    } else if (hoursLeft === null && ageH >= POLICY.replyNoDueDays * 24) {
      const score = 45 + Math.min(30, ((ageH - POLICY.replyNoDueDays * 24) / 24) * 6) + (high ? 15 : 0);
      out.push({ risk_type: 'reply_pending', score: clamp(score), facts: { ...base, age_hours: round1(ageH) } });
    }
  }

  // C. Waiting on someone past the follow-up date (the follow-up reminder, or created + follow-up days)
  if (task.kind === 'waiting') {
    const followUp = !isNaN(t(task.remind_at)) ? t(task.remind_at) : created + settings.follow_up_days * D;
    if (nowMs >= followUp) {
      const past = (nowMs - followUp) / H;
      const score = 50 + Math.min(30, (past / 24) * 10) + (high ? 15 : 0);
      out.push({ risk_type: 'waiting_followup', score: clamp(score), facts: { ...base, hours_waiting: round1(ageH), hours_past_follow_up: round1(past) } });
    }
  }

  // B. At risk: the deadline is close (replies are covered above)
  if (task.kind !== 'reply' && hoursLeft !== null && !fresh) {
    let score = -1;
    if (hoursLeft <= POLICY.dueSoonHours) score = 55;
    else if (hoursLeft <= POLICY.dueSoonHoursWide) score = 40;
    else if (hoursLeft <= POLICY.dueSoonHoursUrgent && high) score = 30;
    if (score >= 0) {
      if (high) score += 20;
      const busy = hoursLeft <= POLICY.dueSoonHours && busyCount >= POLICY.busyDayCount;
      if (busy) score += 10;
      out.push({ risk_type: 'due_soon', score: clamp(score), facts: { ...base, hours_left: round1(hoursLeft), ...(busy ? { busy_count: busyCount } : {}) } });
    }
  }

  // E. Stale: open a long time with no change and no near deadline. No update doesn't mean no progress, so this is
  // only ever low severity and worded as a question.
  const farOrNone = hoursLeft === null || hoursLeft > 7 * 24;
  if (!task.repeat && farOrNone && out.length === 0) {
    const unchangedH = (nowMs - Math.max(created, isNaN(updated) ? created : updated)) / H;
    if (ageH >= POLICY.staleDays * 24 && unchangedH >= POLICY.staleDays * 24) {
      out.push({ risk_type: 'stale', score: unchangedH >= 30 * 24 ? 40 : 30, facts: { ...base, hours_unchanged: round1(unchangedH) } });
    }
  }
  return out;
}

/** Fields whose change makes a dismissed finding worth showing again */
export const fingerprintOf = (task: RadarTask, risk: RiskType) => [risk, task.due_at ?? '', task.remind_at ?? '', task.kind, task.priority].join('|');

/** The single most important finding per open task */
export function detect(tasks: RadarTask[], settingsByUser: Map<string, RadarSettings>, now: Date): Finding[] {
  const byUser = new Map<string, RadarTask[]>();
  for (const task of tasks) if (task.status === 'open') byUser.set(task.user_id, [...(byUser.get(task.user_id) ?? []), task]);
  const out: Finding[] = [];
  const after = notifyAfter(now);
  for (const [userId, list] of byUser) {
    const settings = settingsByUser.get(userId) ?? { follow_up_days: 3, lang: 'ar' as Lang };
    const busy = list.filter((x) => {
      const due = t(x.due_at);
      return !isNaN(due) && due >= now.getTime() && due - now.getTime() <= POLICY.dueSoonHours * H;
    }).length;
    for (const task of list) {
      const all = candidates(task, settings, now, busy);
      if (!all.length) continue;
      all.sort((a, b) => b.score - a.score || ORDER.indexOf(a.risk_type) - ORDER.indexOf(b.risk_type));
      const best = all[0];
      const severity = severityOf(best.score);
      const words = explain(best.risk_type, best.facts, settings.lang);
      out.push({
        user_id: userId,
        task_id: task.id,
        risk_type: best.risk_type,
        severity,
        score: best.score,
        facts: best.facts,
        fingerprint: fingerprintOf(task, best.risk_type),
        lang: settings.lang,
        reason: words.reason,
        recommendation: words.recommendation,
        notify_after: after,
        ai_status: severity === 'low' ? 'skipped' : 'pending',
      });
    }
  }
  return out;
}

export type Patch = Partial<{
  severity: Severity;
  score: number;
  facts: Facts;
  fingerprint: string;
  lang: Lang;
  reason: string;
  recommendation: string;
  status: NudgeStatus;
  resolved_reason: string | null;
  detect_count: number;
  last_detected_at: string;
  notify_after: string;
  seen_at: null;
  dismissed_at: null;
  acted_at: null;
  resolved_at: string | null;
  ai_status: 'pending' | 'skipped';
  ai_recommendation: null;
}>;

export type Plan = { inserts: Finding[]; updates: { id: string; patch: Patch }[]; counts: { created: number; refreshed: number; reopened: number; resolved: number; kept_dismissed: number } };

const ACTIVE: NudgeStatus[] = ['new', 'seen'];

/**
 * Turns this scan's findings into database changes, against what is already stored. Running it twice on the same
 * state changes nothing new (only timestamps), so a retried or doubled scan can't create duplicates.
 * `scope` is the set of users this scan looked at: stored findings of other users are never touched.
 */
export function reconcile(existing: Nudge[], findings: Finding[], openTaskIds: Set<string>, scope: Set<string>, now: Date): Plan {
  const nowIso = now.toISOString();
  const key = (taskId: string, risk: string) => `${taskId}|${risk}`;
  const stored = new Map(existing.filter((n) => scope.has(n.user_id)).map((n) => [key(n.task_id, n.risk_type), n]));
  const found = new Map(findings.filter((f) => scope.has(f.user_id)).map((f) => [key(f.task_id, f.risk_type), f]));
  const plan: Plan = { inserts: [], updates: [], counts: { created: 0, refreshed: 0, reopened: 0, resolved: 0, kept_dismissed: 0 } };
  const words = (f: Finding): Patch => ({ severity: f.severity, score: f.score, facts: f.facts, fingerprint: f.fingerprint, lang: f.lang, reason: f.reason, recommendation: f.recommendation });

  // Stored findings whose condition is gone
  for (const [k, n] of stored) {
    if (found.has(k) || n.status === 'resolved' || n.status === 'dismissed') continue;
    const why = !openTaskIds.has(n.task_id) ? 'task_closed' : findings.some((f) => f.task_id === n.task_id) ? 'superseded' : 'condition_cleared';
    plan.updates.push({ id: n.id, patch: { status: 'resolved', resolved_reason: why, resolved_at: nowIso } });
    plan.counts.resolved++;
  }

  for (const [k, f] of found) {
    const n = stored.get(k);
    if (!n) {
      plan.inserts.push(f);
      plan.counts.created++;
      continue;
    }
    const escalated = RANK[f.severity] > RANK[n.severity];
    const changed = f.fingerprint !== n.fingerprint;
    if (ACTIVE.includes(n.status)) {
      // Still true: refresh it; worse than before → unread again with fresh advice
      const patch: Patch = { ...words(f), last_detected_at: nowIso, detect_count: n.detect_count + 1 };
      if (escalated) Object.assign(patch, { status: 'new', seen_at: null, notify_after: f.notify_after });
      if (escalated || changed) Object.assign(patch, { ai_status: f.ai_status, ai_recommendation: null });
      plan.updates.push({ id: n.id, patch });
      plan.counts.refreshed++;
    } else if (n.status === 'dismissed' || n.status === 'acted') {
      // The user already dealt with it: back only for a real reason, and not too soon
      const since = Date.parse((n.status === 'dismissed' ? n.dismissed_at : n.acted_at) ?? nowIso);
      const cooled = now.getTime() - since >= POLICY.reopenCooldownHours * H;
      if ((escalated || changed) && cooled) {
        plan.updates.push({ id: n.id, patch: { ...words(f), status: 'new', seen_at: null, dismissed_at: null, acted_at: null, resolved_at: null, resolved_reason: null, last_detected_at: nowIso, notify_after: f.notify_after, detect_count: n.detect_count + 1, ai_status: f.ai_status, ai_recommendation: null } });
        plan.counts.reopened++;
      } else plan.counts.kept_dismissed++;
    } else {
      // Resolved before, true again (e.g. a task reopened): a new finding on the same row
      plan.updates.push({ id: n.id, patch: { ...words(f), status: 'new', seen_at: null, dismissed_at: null, acted_at: null, resolved_at: null, resolved_reason: null, last_detected_at: nowIso, notify_after: f.notify_after, detect_count: n.detect_count + 1, ai_status: f.ai_status, ai_recommendation: null } });
      plan.counts.reopened++;
    }
  }
  return plan;
}

// ---------- wording (Arabic and English), from the facts alone ----------

function arCount(n: number, one: string, two: string, few: string, many: string) {
  if (n <= 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}
/** "ساعتين" / "3 أيام" / "يوم واحد" ... from hours */
export function spanAr(hours: number): string {
  if (hours < 1) return 'أقل من ساعة';
  if (hours < 24) return arCount(Math.round(hours), 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  return arCount(Math.floor(hours / 24), 'يوم واحد', 'يومين', 'أيام', 'يوماً');
}
export function spanEn(hours: number): string {
  if (hours < 1) return 'less than an hour';
  if (hours < 24) {
    const h = Math.round(hours);
    return h === 1 ? '1 hour' : `${h} hours`;
  }
  const d = Math.floor(hours / 24);
  return d === 1 ? '1 day' : `${d} days`;
}

/** The reason and the suggested next step, worded from the facts */
export function explain(risk: RiskType, f: Facts, lang: Lang): { reason: string; recommendation: string } {
  const ar = lang === 'ar';
  const span = ar ? spanAr : spanEn;
  const who = f.person;
  switch (risk) {
    case 'overdue':
      return ar
        ? { reason: `تجاوزت موعدها النهائي منذ ${span(f.hours_late ?? 0)}${f.priority === 'high' ? '، وهي عاجلة' : ''}.`, recommendation: f.kind === 'waiting' ? `تابع مع ${who ?? 'الطرف المعني'} اليوم، أو اتفق على موعد جديد وعدّله.` : 'أنجزها اليوم إن أمكن، أو حدّد لها موعداً جديداً واقعياً.' }
        : { reason: `Its deadline passed ${span(f.hours_late ?? 0)} ago${f.priority === 'high' ? ', and it is urgent' : ''}.`, recommendation: f.kind === 'waiting' ? `Follow up with ${who ?? 'them'} today, or agree a new date and update it.` : 'Finish it today if you can, or set a realistic new date.' };
    case 'reply_pending':
      if (f.hours_left !== undefined)
        return ar
          ? { reason: `${who ? `لم تردّ على ${who} بعد` : 'لم تردّ بعد'}، والموعد خلال ${span(f.hours_left)}.`, recommendation: 'خصّص لها وقتاً اليوم. يستطيع غيث تجهيز مسودة الرد.' }
          : { reason: `${who ? `You haven’t replied to ${who} yet` : 'You haven’t replied yet'}, and it is due in ${span(f.hours_left)}.`, recommendation: 'Set aside time for it today. Ghaith can draft the reply.' };
      return ar
        ? { reason: `${who ? `ينتظر ${who} ردّك` : 'هذا الرد معلّق'} منذ ${span(f.age_hours ?? 0)}.`, recommendation: 'ردّ اليوم ولو برسالة قصيرة. يستطيع غيث تجهيز مسودة الرد.' }
        : { reason: `${who ? `${who} has been waiting for your reply` : 'This reply has been pending'} for ${span(f.age_hours ?? 0)}.`, recommendation: 'Reply today, even briefly. Ghaith can draft it.' };
    case 'waiting_followup':
      return ar
        ? { reason: `${who ? `طلبت هذا من ${who}` : 'طلبت هذا'} قبل ${span(f.hours_waiting ?? 0)} وما زال بانتظار الرد.`, recommendation: 'تابع اليوم برسالة قصيرة. يستطيع غيث تجهيز رسالة المتابعة.' }
        : { reason: `You asked ${who ?? 'for this'} ${span(f.hours_waiting ?? 0)} ago and it is still waiting.`, recommendation: 'Follow up today with a short message. Ghaith can draft it.' };
    case 'due_soon': {
      const others = (f.busy_count ?? 1) - 1;
      const busy = others > 0 ? (ar ? ` ومعها ${arCount(others, 'مهمة أخرى', 'مهمتان أخريان', 'مهام أخرى', 'مهمة أخرى')} في اليوم نفسه` : `, with ${others} other task${others === 1 ? '' : 's'} due the same day`) : '';
      const urgent = f.priority === 'high' ? (ar ? '، وهي عاجلة' : ', and it is urgent') : '';
      const soon = (f.hours_left ?? 99) <= POLICY.dueSoonHours;
      return ar
        ? { reason: `موعدها خلال ${span(f.hours_left ?? 0)}${urgent}${busy}.`, recommendation: soon ? 'ابدأ بها الآن، أو خصّص لها وقتاً محدداً اليوم.' : 'ابدأ بمسودتها اليوم حتى لا تتراكم.' }
        : { reason: `It is due in ${span(f.hours_left ?? 0)}${urgent}${busy}.`, recommendation: soon ? 'Start it now, or block a set time for it today.' : 'Start a first draft today so it doesn’t pile up.' };
    }
    case 'stale':
      return ar
        ? { reason: `لم تتغيّر منذ ${span(f.hours_unchanged ?? 0)}. قد تكون تعمل عليها، لكن لم يُسجَّل أي تحديث.`, recommendation: 'هل ما زالت مطلوبة؟ حدّث موعدها أو أغلقها.' }
        : { reason: `Unchanged for ${span(f.hours_unchanged ?? 0)}. You may be on it, but nothing was updated.`, recommendation: 'Is it still needed? Give it a date or close it.' };
  }
}

// ---------- AI advice (optional): the request and a strict reading of the answer ----------

export type AdviceInput = { id: string; title: string; kind: Kind; person: string | null; priority: string; due_local: string | null; risk_type: RiskType; reason: string };

/** The system prompt and tool for one user's new findings. Only titles, people and dates go out, never notes. */
export function advicePrompt(lang: Lang): { system: string; tool: Record<string, unknown> } {
  return {
    system:
      `You are Ghaith (غيث), a calm personal assistant for a government employee in the UAE. The radar flagged the tasks below. ` +
      `For each one, write ONE short, practical next step (at most 22 words) in ${lang === 'ar' ? 'formal, simple Arabic (فصحى مبسّطة)' : 'clear English'}. ` +
      `If several are urgent, you may say which to do first. Use only the facts given. Never claim that anything happened: no replies received, no progress, no messages sent. ` +
      `Do not invent names, dates or numbers. You may offer to draft a follow-up or a reply. Do not repeat the reason. Call the advise tool once.`,
    tool: {
      name: 'advise',
      description: 'One next step per flagged task',
      input_schema: {
        type: 'object',
        properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, advice: { type: 'string' } }, required: ['id', 'advice'] } } },
        required: ['items'],
      },
    },
  };
}

/** Keeps only advice for ids that were asked about, trimmed; anything else is dropped */
export function readAdvice(content: unknown, askedIds: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(content)) return out;
  const use = content.find((b) => b && typeof b === 'object' && (b as { type?: string }).type === 'tool_use') as { input?: { items?: unknown } } | undefined;
  const items = Array.isArray(use?.input?.items) ? (use!.input!.items as unknown[]) : [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const { id, advice } = it as { id?: unknown; advice?: unknown };
    if (typeof id !== 'string' || typeof advice !== 'string' || !askedIds.includes(id)) continue;
    const text = advice.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (text.length >= 4) out.set(id, text);
  }
  return out;
}

/** "الخميس 12 نوفمبر 5:00 م" / "Thu 12 Nov 5:00 PM" in Dubai time, for the AI and the app */
export function localWhen(iso: string | null, lang: Lang): string | null {
  if (!iso) return null;
  const d = new Date(Date.parse(iso) + TZ_OFFSET_H * H);
  const days = lang === 'ar' ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = lang === 'ar' ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  const h12 = h % 12 || 12;
  const ampm = lang === 'ar' ? (h < 12 ? 'ص' : 'م') : h < 12 ? 'AM' : 'PM';
  return `${days.at(d.getUTCDay())} ${d.getUTCDate()} ${months.at(d.getUTCMonth())} ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
