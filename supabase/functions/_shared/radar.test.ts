// Tests for the Radar rules. Run: node --test supabase/functions/_shared/radar.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect, explain, notifyAfter, readAdvice, reconcile, spanAr, type Finding, type Nudge, type RadarSettings, type RadarTask } from './radar.ts';

const NOW = new Date('2026-11-10T08:00:00Z'); // 12:00 Dubai, a Tuesday
const H = 3_600_000;
const at = (hours: number) => new Date(NOW.getTime() + hours * H).toISOString();
const S = new Map<string, RadarSettings>([['u1', { follow_up_days: 3, lang: 'ar' }], ['u2', { follow_up_days: 3, lang: 'en' }]]);

let seq = 0;
function task(p: Partial<RadarTask> = {}): RadarTask {
  seq++;
  return { id: `t${seq}`, user_id: 'u1', title: `Task ${seq}`, kind: 'todo', priority: 'normal', person: null, due_at: null, remind_at: null, repeat: null, status: 'open', created_at: at(-48), updated_at: at(-48), ...p };
}
const one = (t: RadarTask, now = NOW) => detect([t], S, now)[0];
function stored(f: Finding, p: Partial<Nudge> = {}): Nudge {
  return { id: `n-${f.task_id}-${f.risk_type}`, user_id: f.user_id, task_id: f.task_id, risk_type: f.risk_type, severity: f.severity, score: f.score, fingerprint: f.fingerprint, status: 'new', detect_count: 1, dismissed_at: null, acted_at: null, resolved_at: null, ...p };
}
const scope = new Set(['u1', 'u2']);

test('overdue: a passed deadline is overdue, never "at risk"', () => {
  const f = one(task({ due_at: at(-50) }));
  assert.equal(f.risk_type, 'overdue');
  assert.equal(f.severity, 'medium'); // 60 + 2 full days × 5 = 70
  assert.equal(one(task({ due_at: at(-75) })).severity, 'high'); // 3 days late = 75
});

test('overdue severity: a few hours late is medium, urgent is high', () => {
  assert.equal(one(task({ due_at: at(-3) })).severity, 'medium');
  assert.equal(one(task({ due_at: at(-3), priority: 'high' })).severity, 'high');
  assert.match(one(task({ due_at: at(-3) })).reason, /3 ساعات/);
});

test('due soon: urgent task due in 6 hours is high; normal in 30 hours is low; normal in 60 hours is nothing', () => {
  const a = one(task({ due_at: at(6), priority: 'high' }));
  assert.equal(a.risk_type, 'due_soon');
  assert.equal(a.severity, 'high');
  assert.equal(one(task({ due_at: at(30) })).severity, 'low');
  assert.equal(one(task({ due_at: at(60) })), undefined);
  assert.equal(one(task({ due_at: at(60), priority: 'high' })).risk_type, 'due_soon');
});

test('due soon: a task created minutes ago is not flagged (the user just added it)', () => {
  assert.equal(one(task({ due_at: at(5), created_at: at(-0.2), updated_at: at(-0.2) })), undefined);
});

test('busy day: three tasks due within 24h raise each one', () => {
  const list = [task({ due_at: at(5) }), task({ due_at: at(8) }), task({ due_at: at(20) })];
  const fs = detect(list, S, NOW);
  assert.equal(fs.length, 3);
  for (const f of fs) assert.equal(f.facts.busy_count, 3);
  assert.equal(fs[0].score, 65);
});

test('waiting: past the follow-up reminder is flagged with the person', () => {
  const f = one(task({ kind: 'waiting', person: 'أحمد', created_at: at(-5 * 24), remind_at: at(-2 * 24) }));
  assert.equal(f.risk_type, 'waiting_followup');
  assert.equal(f.severity, 'medium'); // 50 + 2 days past follow-up × 10 = 70
  assert.match(f.reason, /أحمد/);
  assert.equal(one(task({ kind: 'waiting', created_at: at(-7 * 24), remind_at: at(-3 * 24) })).severity, 'high'); // 80
  assert.match(f.reason, /5 أيام/);
});

test('waiting: with no reminder, follow-up date = created + follow_up_days', () => {
  assert.equal(one(task({ kind: 'waiting', created_at: at(-2 * 24) })), undefined); // 2 < 3 days
  assert.equal(one(task({ kind: 'waiting', created_at: at(-4 * 24) })).risk_type, 'waiting_followup');
});

test('waiting: a snoozed follow-up (reminder in the future) is not flagged', () => {
  assert.equal(one(task({ kind: 'waiting', created_at: at(-10 * 24), remind_at: at(24) })), undefined);
});

test('reply: due within 24h is pending; with no deadline, after 2 days', () => {
  const a = one(task({ kind: 'reply', due_at: at(10), person: 'خالد' }));
  assert.equal(a.risk_type, 'reply_pending');
  assert.equal(a.severity, 'medium');
  assert.equal(one(task({ kind: 'reply', created_at: at(-24) })), undefined);
  assert.equal(one(task({ kind: 'reply', created_at: at(-3 * 24) })).risk_type, 'reply_pending');
});

test('normal task with no risk produces nothing; completed tasks produce nothing', () => {
  assert.equal(one(task({ due_at: at(10 * 24) })), undefined);
  assert.equal(one(task()), undefined);
  assert.equal(one(task({ due_at: at(-5), status: 'done' })), undefined);
});

test('stale: only after 14 days unchanged with no near deadline, always low', () => {
  assert.equal(one(task({ created_at: at(-10 * 24), updated_at: at(-10 * 24) })), undefined);
  const f = one(task({ created_at: at(-20 * 24), updated_at: at(-15 * 24) }));
  assert.equal(f.risk_type, 'stale');
  assert.equal(f.severity, 'low');
  assert.equal(f.ai_status, 'skipped');
  assert.equal(one(task({ created_at: at(-20 * 24), updated_at: at(-2 * 24) })), undefined); // touched recently
  assert.equal(one(task({ created_at: at(-20 * 24), updated_at: at(-20 * 24), repeat: 'weekly' })), undefined);
});

test('one finding per task: the strongest rule wins', () => {
  // waiting on someone AND due in 5 hours: both fire, one is kept
  const fs = detect([task({ kind: 'waiting', created_at: at(-6 * 24), due_at: at(5) })], S, NOW);
  assert.equal(fs.length, 1);
});

test('reconcile: first scan creates, an identical second scan creates nothing (duplicate run)', () => {
  const tasks = [task({ due_at: at(-5) }), task({ kind: 'waiting', created_at: at(-5 * 24) })];
  const open = new Set(tasks.map((t) => t.id));
  const fs = detect(tasks, S, NOW);
  const p1 = reconcile([], fs, open, scope, NOW);
  assert.equal(p1.inserts.length, 2);
  const after = p1.inserts.map((f) => stored(f));
  const p2 = reconcile(after, detect(tasks, S, new Date(NOW.getTime() + 15 * 60_000)), open, scope, new Date(NOW.getTime() + 15 * 60_000));
  assert.equal(p2.inserts.length, 0);
  assert.equal(p2.counts.refreshed, 2);
  for (const u of p2.updates) assert.equal(u.patch.status, undefined); // stays as it was (no re-alert)
});

test('reconcile: a completed task resolves its finding', () => {
  const t = task({ due_at: at(-5) });
  const f = one(t);
  const p = reconcile([stored(f)], [], new Set(), scope, NOW);
  assert.equal(p.updates[0].patch.status, 'resolved');
  assert.equal(p.updates[0].patch.resolved_reason, 'task_closed');
});

test('reconcile: escalation (due soon → overdue) resolves the old one as superseded and creates the new one', () => {
  const t = task({ due_at: at(5) });
  const soon = one(t);
  const later = new Date(NOW.getTime() + 6 * H);
  const p = reconcile([stored(soon)], detect([t], S, later), new Set([t.id]), scope, later);
  assert.equal(p.inserts[0].risk_type, 'overdue');
  assert.equal(p.updates[0].patch.resolved_reason, 'superseded');
});

test('reconcile: a dismissed finding stays dismissed while nothing meaningful changes', () => {
  const t = task({ due_at: at(-5) });
  const f = one(t);
  const n = stored(f, { status: 'dismissed', dismissed_at: at(-1) });
  const p = reconcile([n], [f], new Set([t.id]), scope, NOW);
  assert.equal(p.updates.length, 0);
  assert.equal(p.counts.kept_dismissed, 1);
});

test('reconcile: dismissed comes back only after the cooldown AND a real change', () => {
  const t = task({ due_at: at(-5) });
  const f = one(t);
  // severity escalated (medium → high) but dismissed an hour ago: still quiet
  const n1 = stored({ ...f, severity: 'low' }, { status: 'dismissed', dismissed_at: at(-1) });
  assert.equal(reconcile([n1], [f], new Set([t.id]), scope, NOW).updates.length, 0);
  // escalated and dismissed 2 days ago: back as new
  const n2 = stored({ ...f, severity: 'low' }, { status: 'dismissed', dismissed_at: at(-48) });
  const p = reconcile([n2], [f], new Set([t.id]), scope, NOW);
  assert.equal(p.updates[0].patch.status, 'new');
  // dismissed 2 days ago but unchanged: stays dismissed
  const n3 = stored(f, { status: 'dismissed', dismissed_at: at(-48) });
  assert.equal(reconcile([n3], [f], new Set([t.id]), scope, NOW).updates.length, 0);
});

test('reconcile: an active finding that gets worse becomes unread again with fresh advice', () => {
  const t = task({ due_at: at(-5) });
  const f = one(t);
  const n = stored({ ...f, severity: 'medium' }, { status: 'seen' });
  const worse = { ...f, severity: 'high' as const };
  const p = reconcile([n], [worse], new Set([t.id]), scope, NOW);
  assert.equal(p.updates[0].patch.status, 'new');
  assert.equal(p.updates[0].patch.ai_recommendation, null);
});

test('isolation: a scan scoped to one user never touches another user’s findings', () => {
  const mine = task({ user_id: 'u1', due_at: at(-5) });
  const theirs = task({ user_id: 'u2', due_at: at(-5) });
  const theirsStored = stored(one(theirs));
  const fs = detect([mine], S, NOW); // user 1 only
  const p = reconcile([theirsStored], fs, new Set([mine.id]), new Set(['u1']), NOW);
  assert.equal(p.inserts.length, 1);
  assert.equal(p.inserts[0].user_id, 'u1');
  assert.equal(p.updates.length, 0); // user 2's finding left alone, not "resolved"
});

test('language: each user gets findings in their language', () => {
  const fs = detect([task({ user_id: 'u2', due_at: at(-30) })], S, NOW);
  assert.equal(fs[0].lang, 'en');
  assert.match(fs[0].reason, /1 day ago/);
  assert.match(explain('waiting_followup', { kind: 'waiting', priority: 'normal', person: 'Sara', due_at: null, hours_waiting: 100 }, 'en').reason, /Sara/);
  assert.equal(spanAr(48), 'يومين');
  assert.equal(spanAr(5 * 24), '5 أيام');
  assert.equal(spanAr(20 * 24), '20 يوماً');
});

test('quiet hours: found at night, the badge waits until 7:00 Dubai', () => {
  assert.equal(notifyAfter(new Date('2026-11-10T19:30:00Z')), '2026-11-11T03:00:00.000Z'); // 23:30 → 07:00 next day
  assert.equal(notifyAfter(new Date('2026-11-10T01:00:00Z')), '2026-11-10T03:00:00.000Z'); // 05:00 → 07:00
  assert.equal(notifyAfter(NOW), NOW.toISOString());
});

test('AI failure or bad output: nothing is kept, the template stays', () => {
  assert.equal(readAdvice(null, ['a']).size, 0);
  assert.equal(readAdvice([{ type: 'text', text: 'hi' }], ['a']).size, 0);
  const got = readAdvice([{ type: 'tool_use', input: { items: [{ id: 'a', advice: '  ابدأ   بها الآن ' }, { id: 'zzz', advice: 'invented task' }, { id: 'b', advice: 3 }] } }], ['a', 'b']);
  assert.equal(got.size, 1);
  assert.equal(got.get('a'), 'ابدأ بها الآن');
});
