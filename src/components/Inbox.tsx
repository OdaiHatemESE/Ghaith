// Email to Ghaith: keeping it fresh (InboxSync), the home card (InboxSummary) and one email with what Ghaith proposes
// from it (InboxEmail). Nothing from an email changes a task until the person approves it.
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { AppState, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { D, getLang, tx } from '../lib/i18n';
import { clearInbox, InboxItem, loadInbox, useInbox } from '../lib/inbox';
import { Proposal, useStore } from '../lib/store';
import { useNow } from '../lib/useNow';
import { C, tint, TS } from '../theme';
import { Card, GhostButton, Icon, IconName, PrimaryButton, T } from '../ui';
import { agoLabel } from './Radar';

/** Loads the inbox when signed in, when the app comes back, and every few minutes while open */
export function InboxSync() {
  const { status } = useStore();
  useEffect(() => {
    if (status === 'out') clearInbox();
    if (status !== 'in') return;
    loadInbox();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && loadInbox());
    const timer = setInterval(loadInbox, 3 * 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [status]);
  return null;
}

/** "بريد واحد"، "بريدان"، "3 رسائل" / "1 email", "3 emails" */
export function countEmails(n: number): string {
  if (getLang() === 'en') return `${n} ${n === 1 ? 'email' : 'emails'}`;
  if (n === 1) return 'بريد واحد';
  if (n === 2) return 'رسالتان';
  if (n <= 10) return `${n} رسائل`;
  return `${n} رسالة`;
}

/** Emails waiting for a decision */
export function useInboxCount(): number {
  return useInbox().items.length;
}

/** Home: a one-line card when emails are waiting; nothing otherwise */
export function InboxSummary({ style }: { style?: StyleProp<ViewStyle> }) {
  const { items } = useInbox();
  if (!items.length) return null;
  const first = items[0];
  return (
    <Pressable onPress={() => router.push('/inbox')} accessibilityRole="link" style={style}>
      <Card style={{ padding: 14, flexDirection: D.row, alignItems: 'center', gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: tint(C.tealDeep, 0.12), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="email-fast-outline" size={22} color={C.tealDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <T w="bold">{tx(`وصل غيث ${countEmails(items.length)} للمراجعة`, `${countEmails(items.length)} to review`)}</T>
          <T size={TS.small} color={C.sub} numberOfLines={1}>
            {first.sender_name || first.sender}
            {first.subject ? ` · ${first.subject}` : ''}
          </T>
        </View>
        <Icon name={D.rtl ? 'chevron-left' : 'chevron-right'} size={22} color={C.faint} />
      </Card>
    </Pressable>
  );
}

const OP: Record<Proposal['op'], { icon: IconName; color: string; label: () => string }> = {
  add: { icon: 'plus-circle-outline', color: C.glow, label: () => tx('مهمة جديدة', 'New task') },
  update: { icon: 'pencil-outline', color: C.amberText, label: () => tx('تعديل', 'Change') },
  complete: { icon: 'check-circle-outline', color: C.tealDeep, label: () => tx('إنجاز', 'Done') },
  delete: { icon: 'trash-can-outline', color: C.late, label: () => tx('حذف', 'Delete') },
};
const titleOf = (p: Proposal) => (p.op === 'add' ? p.task.title : p.current.title);

/** One email: who sent it, its subject and start, what Ghaith proposes, and the two decisions */
export function InboxEmail({ item, onReview, onDismiss, onRetry, retrying }: { item: InboxItem; onReview: () => void; onDismiss: () => void; onRetry: () => void; retrying: boolean }) {
  const now = useNow();
  const failed = item.status === 'failed';
  const n = item.proposals.length;
  return (
    <Card style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: tint(C.indigo, 0.08), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="email-outline" size={19} color={C.indigo} />
        </View>
        <View style={{ flex: 1 }}>
          <T w="semibold" numberOfLines={1}>{item.sender_name || item.sender}</T>
          <T size={TS.tiny} color={C.faint} numberOfLines={1}>
            {item.sender_name ? `${item.sender} · ` : ''}
            {agoLabel(item.received_at, now.getTime())}
          </T>
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <T w="bold" numberOfLines={2}>{item.subject || tx('(بلا عنوان)', '(no subject)')}</T>
        {!!item.excerpt && <T size={TS.small} color={C.sub} numberOfLines={2}>{item.excerpt}</T>}
      </View>

      {failed ? (
        <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, backgroundColor: tint(C.amber, 0.1), borderRadius: 12, padding: 10 }}>
          <Icon name="alert-outline" size={18} color={C.amberText} />
          <T size={TS.small} color={C.amberText} style={{ flex: 1 }}>{tx('تعذّر على غيث قراءة هذا البريد عند وصوله.', 'Ghaith could not read this email when it arrived.')}</T>
        </View>
      ) : n ? (
        <View style={{ borderRadius: 14, backgroundColor: C.bg, paddingVertical: 4 }}>
          {item.proposals.slice(0, 3).map((p, i) => (
            <View key={i} style={{ flexDirection: D.row, alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Icon name={OP[p.op].icon} size={18} color={OP[p.op].color} />
              <T size={TS.small} w="medium" color={OP[p.op].color}>{OP[p.op].label()}</T>
              <T size={TS.small} style={{ flex: 1 }} numberOfLines={1}>{titleOf(p)}</T>
            </View>
          ))}
          {n > 3 && <T size={TS.tiny} color={C.sub} style={{ paddingHorizontal: 12, paddingBottom: 6 }}>{tx(`و${n - 3} غيرها`, `and ${n - 3} more`)}</T>}
        </View>
      ) : (
        <T size={TS.small} color={C.sub}>{tx('لم يجد غيث في هذا البريد مهمة أو متابعة.', 'Ghaith found no task or follow-up in this email.')}</T>
      )}

      <View style={{ flexDirection: D.row, gap: 10, flexWrap: 'wrap' }}>
        {failed ? (
          <PrimaryButton label={tx('حلّل مرة أخرى', 'Read it again')} icon="refresh" onPress={onRetry} busy={retrying} style={{ flex: 1, minWidth: 160 }} />
        ) : n ? (
          <PrimaryButton label={tx('مراجعة واعتماد', 'Review & apply')} icon="check" onPress={onReview} style={{ flex: 1, minWidth: 160 }} />
        ) : (
          <GhostButton label={tx('أضف مهمة منه', 'Add a task from it')} icon="plus" onPress={onReview} style={{ flex: 1, minWidth: 160 }} />
        )}
        <GhostButton label={tx('تجاهل', 'Dismiss')} icon="close" color={C.sub} onPress={onDismiss} />
      </View>
    </Card>
  );
}
