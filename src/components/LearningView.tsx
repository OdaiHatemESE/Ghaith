// A learning note organised by Ghaith: what the course was about, the ideas worth keeping, what to read more about
// (with a web search, and an opt-in "read it later" task), the terms, how to apply it, questions with answers and
// quotes. Nothing here is a task unless the person asks for one.
import React, { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { D, getLang, tx } from '../lib/i18n';
import { LearningNote, Meeting, meetingWhen } from '../lib/meetings';
import { Task } from '../lib/tasks';
import { useWide } from '../lib/useWide';
import { C, lift, R, tint, TS } from '../theme';
import { ErrorText, Gradient, Icon, IconName, T } from '../ui';
import { GhaithBot } from './GhaithBot';

export const TAG_INFO: Record<string, { icon: IconName; color: string; label: () => string }> = {
  key: { icon: 'star', color: '#D98E04', label: () => tx('مهم', 'Key') },
  read: { icon: 'book-open-page-variant-outline', color: '#0B6E70', label: () => tx('أقرأ عنها', 'Read more') },
  question: { icon: 'help-circle-outline', color: '#5B3FE0', label: () => tx('سؤال', 'Question') },
  quote: { icon: 'format-quote-open', color: '#2F35A8', label: () => tx('اقتباس', 'Quote') },
};

function Block({ icon, color, title, children }: { icon: IconName; color: string; title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: R.card, padding: 16, marginTop: 14, ...lift }}>
      <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: tint(color, 0.12), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={17} color={color} />
        </View>
        <T w="bold" size={16} style={{ flex: 1 }}>{title}</T>
      </View>
      {children}
    </View>
  );
}

function Line({ text, color = C.indigoHi }: { text: string; color?: string }) {
  return (
    <View style={{ flexDirection: D.row, alignItems: 'flex-start', gap: 10, paddingVertical: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginTop: 10 }} />
      <T style={{ flex: 1, lineHeight: 24 }}>{text}</T>
    </View>
  );
}

function Small({ icon, label, onPress, done }: { icon: IconName; label: string; onPress?: () => void; done?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: D.row, alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: R.pill, borderWidth: 1.5, borderColor: done ? tint(C.teal, 0.4) : C.lineHi, backgroundColor: done ? tint(C.teal, 0.08) : pressed ? C.surfaceAlt : C.surface })}
    >
      <Icon name={icon} size={15} color={done ? C.tealText : C.indigo} />
      <T size={12.5} w="bold" color={done ? C.tealText : C.indigo}>{label}</T>
    </Pressable>
  );
}

export function LearningView(p: {
  meeting: Meeting;
  note: LearningNote;
  linked: Task[];
  column: object;
  onReadLater: (topic: { topic: string; why: string; search: string }) => void;
  onEdit: () => void;
  onShare: () => void;
  onMail: () => void;
  onReorganise: () => void;
  err: string;
}) {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const [showNotes, setShowNotes] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { meeting: m, note: n } = p;
  const search = (q: string) => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(q)}`).catch(() => {});
  const saved = (topic: string) => p.linked.find((t) => t.title.includes(topic));
  const stat = (v: number, ar: string, en: string) => (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: R.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
      <T size={12} w="bold" color="#fff">{getLang() === 'en' ? `${v} ${en}` : `${v} ${ar}`}</T>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: wide ? 36 : 16, paddingBottom: insets.bottom + 32 }}>
      <View style={p.column}>
        {/* What it was, who gave it, and its shape */}
        <View style={{ borderRadius: R.big, overflow: 'hidden' }}>
          <Gradient colors={['#0B6E70', C.indigo]} angle="diagonal" />
          <View style={{ padding: 18, gap: 8 }}>
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: D.row, alignItems: 'center', gap: 6 }}>
                  <Icon name="school-outline" size={16} color={C.teal} />
                  <T size={12.5} w="bold" color={C.teal}>{tx('دفتر التعلّم', 'Learning notebook')}</T>
                </View>
                <T w="bold" size={21} color="#fff" style={{ lineHeight: 30 }}>{m.title || tx('دورة بدون عنوان', 'Untitled session')}</T>
                <T size={TS.small} color="rgba(255,255,255,0.78)">{meetingWhen(m.held_at)}{m.attendees ? ` · ${m.attendees}` : ''}</T>
              </View>
              <GhaithBot state="happy" size={70} />
            </View>
            <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {stat(m.points.length, 'ملاحظات', 'notes')}
              {!!n.takeaways.length && stat(n.takeaways.length, 'أفكار', 'takeaways')}
              {!!n.read_more.length && stat(n.read_more.length, 'للقراءة', 'to read')}
            </View>
          </View>
        </View>

        {!!n.summary && (
          <Block icon="text-box-outline" color={C.indigoHi} title={tx('الخلاصة', 'In short')}>
            <T style={{ lineHeight: 25 }}>{n.summary}</T>
          </Block>
        )}

        {/* The ideas worth keeping */}
        {!!n.takeaways.length && (
          <Block icon="lightbulb-on-outline" color="#D98E04" title={tx('أهم ما تعلّمته', 'Key takeaways')}>
            <View style={{ gap: 10 }}>
              {n.takeaways.map((t, i) => (
                <View key={i} style={{ flexDirection: D.row, alignItems: 'flex-start', gap: 12, backgroundColor: i === 0 ? tint('#D98E04', 0.07) : C.surfaceAlt, borderRadius: 16, padding: 12 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: i === 0 ? '#D98E04' : C.indigo, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <T size={13} w="bold" color="#fff">{i + 1}</T>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <T w="bold" size={15} style={{ lineHeight: 23 }}>{t.title}</T>
                    {!!t.detail && <T size={TS.small} color={C.sub} style={{ lineHeight: 22 }}>{t.detail}</T>}
                  </View>
                </View>
              ))}
            </View>
          </Block>
        )}

        {/* To read more about: search now, or keep it as a reading task */}
        {!!n.read_more.length && (
          <Block icon="book-open-page-variant-outline" color="#0B6E70" title={tx('أقرأ عنه أكثر', 'Read more about')}>
            {n.read_more.map((r, i) => {
              const done = saved(r.topic);
              return (
                <View key={i} style={{ paddingVertical: 10, gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                  <T w="bold" size={15}>{r.topic}</T>
                  {!!r.why && <T size={TS.small} color={C.sub} style={{ lineHeight: 21 }}>{r.why}</T>}
                  <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                    <Small icon="magnify" label={tx('ابحث عنه', 'Search')} onPress={() => search(r.search || r.topic)} />
                    <Small icon={done ? 'check' : 'bookmark-plus-outline'} label={done ? tx('في مهامك', 'In your tasks') : tx('ذكّرني أقرأه', 'Remind me to read it')} onPress={done ? undefined : () => p.onReadLater(r)} done={!!done} />
                  </View>
                </View>
              );
            })}
          </Block>
        )}

        {!!n.apply.length && (
          <Block icon="rocket-launch-outline" color={C.indigoHi} title={tx('كيف أطبّقها في عملي', 'How to apply it at work')}>
            {n.apply.map((a, i) => (
              <Line key={i} text={a} />
            ))}
          </Block>
        )}

        {!!n.questions.length && (
          <Block icon="help-circle-outline" color="#5B3FE0" title={tx('أسئلتي', 'My questions')}>
            {n.questions.map((q, i) => (
              <View key={i} style={{ paddingVertical: 8, gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <T w="bold" style={{ lineHeight: 24 }}>{q.q}</T>
                {q.answer ? (
                  <View style={{ flexDirection: D.row, gap: 8, backgroundColor: tint('#5B3FE0', 0.06), borderRadius: 12, padding: 10 }}>
                    <View style={{ marginTop: 3 }}>
                      <Icon name="creation" size={16} color="#5B3FE0" />
                    </View>
                    <T size={TS.small} style={{ flex: 1, lineHeight: 22 }}>{q.answer}</T>
                  </View>
                ) : (
                  <T size={TS.small} color={C.sub}>{tx('بلا إجابة بعد: اسأل المدرّب أو ابحث عنه', 'No answer yet: ask the trainer or search it')}</T>
                )}
              </View>
            ))}
          </Block>
        )}

        {!!n.terms.length && (
          <Block icon="alphabetical-variant" color={C.indigoHi} title={tx('مصطلحات', 'Terms')}>
            {n.terms.map((t, i) => (
              <View key={i} style={{ paddingVertical: 8, gap: 2, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                <T w="bold" color={C.indigo}>{t.term}</T>
                <T size={TS.small} color={C.sub} style={{ lineHeight: 21 }}>{t.meaning}</T>
              </View>
            ))}
          </Block>
        )}

        {!!n.quotes.length && (
          <View style={{ marginTop: 14, gap: 10 }}>
            {n.quotes.map((q, i) => (
              <View key={i} style={{ flexDirection: D.row, gap: 10, backgroundColor: tint(C.indigoHi, 0.07), borderRadius: 18, padding: 16 }}>
                <Icon name="format-quote-open" size={26} color={C.indigoHi} />
                <T w="bold" size={16} color={C.indigo} style={{ flex: 1, lineHeight: 27 }}>{q}</T>
              </View>
            ))}
          </View>
        )}

        {/* All the notes, by topic, then as written */}
        {!!n.sections.length && (
          <Pressable onPress={() => setShowAll((v) => !v)} style={{ marginTop: 16, flexDirection: D.row, alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={18} color={C.sub} />
            <T size={TS.small} w="bold" color={C.sub}>{tx('كل الملاحظات مرتّبة حسب الموضوع', 'All notes, by topic')}</T>
          </Pressable>
        )}
        {showAll &&
          n.sections.map((s, i) => (
            <View key={i} style={{ backgroundColor: C.surfaceAlt, borderRadius: 16, padding: 14, marginBottom: 8 }}>
              <T w="bold" color={C.indigo} style={{ marginBottom: 4 }}>{s.heading}</T>
              {s.points.map((pt, j) => (
                <Line key={j} text={pt} color={C.sub} />
              ))}
            </View>
          ))}
        <Pressable onPress={() => setShowNotes((v) => !v)} style={{ flexDirection: D.row, alignItems: 'center', gap: 8, paddingVertical: 8 }}>
          <Icon name={showNotes ? 'chevron-up' : 'chevron-down'} size={18} color={C.sub} />
          <T size={TS.small} w="bold" color={C.sub}>{tx(`ملاحظاتي كما كتبتها (${m.points.length})`, `My notes as written (${m.points.length})`)}</T>
        </Pressable>
        {showNotes && (
          <View style={{ backgroundColor: C.surfaceAlt, borderRadius: 16, padding: 14 }}>
            {m.points.map((pt) => {
              const tag = pt.tag ? TAG_INFO[pt.tag] : null;
              return (
                <View key={pt.id} style={{ flexDirection: D.row, alignItems: 'flex-start', gap: 8, paddingVertical: 5 }}>
                  <View style={{ marginTop: 4 }}>
                    <Icon name={tag ? tag.icon : 'circle-small'} size={tag ? 16 : 18} color={tag ? tag.color : C.sub} />
                  </View>
                  <T style={{ flex: 1, lineHeight: 24 }}>{pt.text}</T>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <Small icon="pencil-outline" label={tx('أضف أو عدّل ملاحظات', 'Add or edit notes')} onPress={p.onEdit} />
          <Small icon="email-outline" label={tx('أرسلها بالبريد', 'Email it')} onPress={p.onMail} />
          <Small icon="share-variant-outline" label={Platform.OS === 'web' ? tx('انسخها', 'Copy') : tx('شاركها', 'Share')} onPress={p.onShare} />
          <Small icon="refresh" label={tx('أعد الترتيب', 'Organise again')} onPress={p.onReorganise} />
        </View>
        <ErrorText text={p.err} />
      </View>
    </ScrollView>
  );
}
