// Email to Ghaith: what arrived from the person's linked addresses, with what Ghaith proposes from each email.
// Review opens the same review as a capture in the app; nothing is applied until the person approves.
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReviewView } from '../components/Capture';
import { InboxEmail } from '../components/Inbox';
import { ScreenHeader } from '../components/ScreenHeader';
import { D, tx } from '../lib/i18n';
import { copy, decide, InboxItem, loadInbox, saidOf, useInbox } from '../lib/inbox';
import { Proposal, useStore } from '../lib/store';
import { useWide } from '../lib/useWide';
import { C, R, TS } from '../theme';
import { Card, ErrorText, Gradient, Icon, T } from '../ui';

export default function Inbox() {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { apply, capture } = useStore();
  const { items, senders, address, loaded } = useInbox();
  const [review, setReview] = useState<{ item: InboxItem; proposals: Proposal[] } | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const linked = senders.filter((s) => s.verified_at);

  /** Reads the email again in the app (from the excerpt kept on the server) when it failed on arrival */
  const retry = async (item: InboxItem) => {
    setRetrying(item.id);
    setErr('');
    try {
      const proposals = await capture(`From: ${item.sender_name || item.sender}\nSubject: ${item.subject ?? ''}\n\n${item.excerpt ?? ''}`, 'email');
      setReview({ item, proposals });
    } catch (e) {
      setErr((e as Error).message);
    }
    setRetrying(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={tx('بريد غيث', 'Email to Ghaith')} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40, width: '100%', maxWidth: wide ? 880 : undefined, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await loadInbox(), setRefreshing(false))} tintColor={C.glow} />}
      >
        {/* How it works, and where to send */}
        <View style={{ borderRadius: R.big, overflow: 'hidden' }}>
          <Gradient colors={[C.indigo, C.indigoHi]} angle="diagonal" />
          <View style={{ padding: 18, gap: 12 }}>
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="email-fast-outline" size={26} color={C.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <T w="bold" size={TS.h2} color="#fff">{tx('حوّل البريد إلى غيث', 'Forward email to Ghaith')}</T>
                <T size={TS.small} color="rgba(255,255,255,0.75)">
                  {tx('أرسل أو حوّل أي بريد من Outlook، وغيث يقترح منه المهام والمتابعات. اكتب فوقه ما تريد إن شئت، مثل «ذكّرني الأحد».', 'Send or forward any email from Outlook, and Ghaith proposes tasks and follow-ups from it. Add a note on top if you like, such as “remind me Sunday”.')}
                </T>
              </View>
            </View>
            {address ? (
              <Pressable
                onPress={async () => (await copy(address)) && (setCopied(true), setTimeout(() => setCopied(false), 1800))}
                style={{ flexDirection: D.row, alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}
              >
                <T selectable size={TS.small} w="bold" color="#fff" style={[{ flex: 1, minWidth: 0, writingDirection: 'ltr', textAlign: D.rtl ? 'right' : 'left' }, Platform.OS === 'web' ? ({ wordBreak: 'break-all' } as object) : null]}>{address}</T>
                <Icon name={copied ? 'check' : 'content-copy'} size={17} color={C.teal} />
              </Pressable>
            ) : (
              <T size={TS.small} color={C.teal}>{tx('عنوان غيث لم يُفعَّل بعد.', 'Ghaith’s address is not switched on yet.')}</T>
            )}
            <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityRole="link">
              <T size={TS.tiny} w="bold" color={C.teal}>
                {linked.length
                  ? tx(`يقبل غيث البريد من ${linked.length === 1 ? 'عنوانك المرتبط' : `${linked.length} عناوين مرتبطة`} فقط · إدارة العناوين`, `Ghaith accepts email only from your ${linked.length} linked address${linked.length === 1 ? '' : 'es'} · Manage`)
                  : tx('اربط بريدك أولاً من الإعدادات ←', 'Link your address first in Settings →')}
              </T>
            </Pressable>
          </View>
        </View>

        <ErrorText text={err} />

        {loaded && !items.length && (
          <Card style={{ padding: 28, alignItems: 'center', marginTop: 20, gap: 6 }}>
            <Icon name="email-check-outline" size={34} color={C.teal} />
            <T w="bold" align="center">{tx('لا بريد بانتظارك', 'Nothing waiting')}</T>
            <T size={TS.small} color={C.sub} align="center">{tx('ما ترسله إلى غيث يظهر هنا خلال دقيقة، مع ما يقترحه منه.', 'What you send to Ghaith shows up here within a minute, with what it proposes.')}</T>
          </Card>
        )}

        <View style={{ marginTop: 20, gap: 14 }}>
          {items.map((item) => (
            <InboxEmail
              key={item.id}
              item={item}
              onReview={() => setReview({ item, proposals: item.proposals })}
              onDismiss={() => decide(item.id, 'dismissed')}
              onRetry={() => retry(item)}
              retrying={retrying === item.id}
            />
          ))}
        </View>

        <T size={TS.tiny} color={C.faint} align="center" style={{ marginTop: 24 }}>
          {tx('غيث لا يضيف ولا يغيّر ولا يردّ على أي بريد بنفسه: أنت من يعتمد.', 'Ghaith never adds, changes or replies to anything by itself: you approve.')}
        </T>
      </ScrollView>

      {review && (
        <ReviewView
          said={saidOf(review.item)}
          source="email"
          proposals={review.proposals}
          onSave={async (list) => {
            const e = await apply(list, 'email', review.item.subject || review.item.sender);
            if (!e) {
              await decide(review.item.id, 'done');
              setReview(null);
            }
            return e;
          }}
          onClose={() => setReview(null)}
          onRetry={() => (setReview(null), retry(review.item))}
        />
      )}
    </View>
  );
}
