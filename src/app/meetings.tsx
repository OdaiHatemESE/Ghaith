// Meetings and the learning notebook: every meeting or course the person wrote notes for, newest first, with where
// each stands (notes only, organised, actions added and how many are done). A switch at the top moves between the
// two (`?kind=learning` opens the notebook); "New" opens an empty one of that kind.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhaithBot } from '../components/GhaithBot';
import { ScreenHeader } from '../components/ScreenHeader';
import { D, tx } from '../lib/i18n';
import { deleteMeeting, Kind, learningOf, loadMeetings, Meeting, meetingWhen, useMeetings } from '../lib/meetings';
import { useStore } from '../lib/store';
import { useWide } from '../lib/useWide';
import { C, lift, R, tint, TS } from '../theme';
import { Icon, IconName, PrimaryButton, T } from '../ui';

export default function Meetings() {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<Kind>(params.kind === 'learning' ? 'learning' : 'meeting');
  const learning = kind === 'learning';
  const L = (meetingAr: string, meetingEn: string, learnAr: string, learnEn: string) => (learning ? tx(learnAr, learnEn) : tx(meetingAr, meetingEn));
  const { list: all, loaded } = useMeetings();
  const list = all.filter((m) => (m.kind ?? 'meeting') === kind);
  const { tasks } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadMeetings();
  }, []);

  const open = () => router.push(learning ? { pathname: '/meeting', params: { kind: 'learning' } } : '/meeting');
  const status = (m: Meeting): { label: string; color: string; icon: IconName } => {
    if (m.kind === 'learning') {
      const n = learningOf(m);
      if (!n) return { label: tx('ملاحظات فقط، لم تُرتّب', 'Notes only, not organised'), color: C.sub, icon: 'pencil-outline' };
      const parts = [n.takeaways.length && tx(`${n.takeaways.length} أفكار`, `${n.takeaways.length} takeaways`), n.read_more.length && tx(`${n.read_more.length} للقراءة`, `${n.read_more.length} to read`)].filter(Boolean);
      return { label: parts.join(' · ') || tx('مرتّبة', 'Organised'), color: '#0B6E70', icon: 'school-outline' };
    }
    if (m.actions_added_at) {
      const linked = tasks.filter((t) => t.meeting_id === m.id);
      const done = linked.filter((t) => t.status === 'done').length;
      return linked.length
        ? { label: tx(`أُنجز ${done} من ${linked.length}`, `${done} of ${linked.length} done`), color: done === linked.length ? C.tealText : C.indigoHi, icon: done === linked.length ? 'check-all' : 'progress-check' }
        : { label: tx('أُضيفت المهام', 'Actions added'), color: C.tealText, icon: 'check-all' };
    }
    if (m.minutes) return { label: m.minutes.actions.length ? tx(`محضر جاهز · ${m.minutes.actions.length} إجراءات`, `Minutes ready · ${m.minutes.actions.length} actions`) : tx('محضر جاهز', 'Minutes ready'), color: C.glowText, icon: 'file-document-check-outline' };
    return { label: tx('نقاط فقط، لم يُرتّب', 'Points only, not organised'), color: C.sub, icon: 'pencil-outline' };
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: wide ? 36 : 0 }}>
        <ScreenHeader
          title={wide ? tx('الاجتماعات والتعلّم', 'Meetings & learning') : tx('ملاحظاتي', 'My notes')}
          right={
            !!list.length && (
              <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: D.row, alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: pressed ? C.indigoHi : C.indigo })}>
                <Icon name="plus" size={18} color="#fff" />
                <T w="bold" size={13} color="#fff">{L('اجتماع جديد', 'New meeting', 'دورة جديدة', 'New course')}</T>
              </Pressable>
            )
          }
        />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: wide ? 36 : 16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => (setRefreshing(true), await loadMeetings(), setRefreshing(false))} tintColor={C.glow} />}
      >
        <View style={{ width: '100%', maxWidth: wide ? 880 : undefined, alignSelf: 'center', gap: 10 }}>
          {/* Meetings, or the learning notebook */}
          <View style={{ flexDirection: D.row, backgroundColor: C.surfaceAlt, borderRadius: R.pill, padding: 4, marginBottom: 4 }}>
            {(
              [
                ['meeting', 'account-group-outline', tx('الاجتماعات', 'Meetings')],
                ['learning', 'school-outline', tx('دفتر التعلّم', 'Learning notebook')],
              ] as [Kind, IconName, string][]
            ).map(([k, icon, label]) => {
              const on = kind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => (setKind(k), setConfirm(null), router.setParams({ kind: k }))}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={{ flex: 1, flexDirection: D.row, alignItems: 'center', justifyContent: 'center', gap: 7, height: 42, borderRadius: R.pill, backgroundColor: on ? C.surface : 'transparent', ...(on ? lift : null) }}
                >
                  <Icon name={icon} size={18} color={on ? C.indigo : C.sub} />
                  <T w="bold" size={14} color={on ? C.indigo : C.sub}>{label}</T>
                </Pressable>
              );
            })}
          </View>
          {loaded && !list.length && learning && (
            <View style={{ backgroundColor: C.surface, borderRadius: R.big, padding: 22, alignItems: 'center', gap: 10, marginTop: 8, ...lift }}>
              <GhaithBot state="idle" size={120} />
              <T w="bold" size={TS.h2} align="center">{tx('ما تتعلّمه، محفوظ ومرتّب', 'What you learn, kept and organised')}</T>
              <T size={TS.small} color={C.sub} align="center" style={{ lineHeight: 21, maxWidth: 480 }}>
                {tx('في دورة أو تدريب أو محاضرة، اكتب أو قل كل فكرة كما تسمعها، وميّز المهم وما تريد القراءة عنه. بعدها أرتّبها لك: الخلاصة، أهم الأفكار، المصطلحات، وما يستحق القراءة. وتقدر تسألني عنها لاحقاً في المحادثة.', 'In a course, training or talk, type or say each idea as you hear it, and mark what matters and what to read about. Then I organise it: the gist, key ideas, terms and what is worth reading. Ask me about it later in the chat.')}
              </T>
              <PrimaryButton icon="plus" label={tx('ابدأ دورة', 'Start a course')} onPress={open} style={{ alignSelf: 'stretch', marginTop: 6 }} />
            </View>
          )}
          {loaded && !list.length && !learning && (
            <View style={{ backgroundColor: C.surface, borderRadius: R.big, padding: 22, alignItems: 'center', gap: 10, marginTop: 8, ...lift }}>
              <GhaithBot state="idle" size={120} />
              <T w="bold" size={TS.h2} align="center">{tx('اكتب نقاط اجتماعك، وأنا أكتب المحضر', 'Write your meeting’s points, I write the minutes')}</T>
              <T size={TS.small} color={C.sub} align="center" style={{ lineHeight: 21, maxWidth: 460 }}>
                {tx('أثناء الاجتماع اكتب أو قل كل نقطة كما تأتي. بعدها أرتّبها محضراً رسمياً: ملخص، قرارات، نقاط مفتوحة، وإجراءات أضيفها إلى مهامك بموافقتك، مع متابعة ما على غيرك.', 'During the meeting, type or say each point as it comes. Then I organise it into proper minutes: a summary, decisions, open questions, and actions I add to your tasks when you approve, with follow-ups for what others owe.')}
              </T>
              <PrimaryButton icon="plus" label={tx('ابدأ اجتماعاً', 'Start a meeting')} onPress={open} style={{ alignSelf: 'stretch', marginTop: 6 }} />
            </View>
          )}

          {list.map((m) => {
            const s = status(m);
            const asking = confirm === m.id;
            return (
              <View key={m.id} style={{ backgroundColor: C.surface, borderRadius: R.card, overflow: 'hidden', ...lift }}>
                <Pressable
                  onPress={() => router.push({ pathname: '/meeting', params: { id: m.id } })}
                  style={({ pressed }) => ({ backgroundColor: pressed ? C.surfaceAlt : C.surface, padding: 14, flexDirection: D.row, alignItems: 'center', gap: 12 })}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: tint(s.color, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={s.icon} size={22} color={s.color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <T w="bold" size={15} numberOfLines={1}>{m.title || L('اجتماع بدون عنوان', 'Untitled meeting', 'دورة بدون عنوان', 'Untitled course')}</T>
                    <T size={12} color={C.sub} numberOfLines={1}>{meetingWhen(m.held_at)} · {L(`${m.points.length} نقاط`, `${m.points.length} points`, `${m.points.length} ملاحظات`, `${m.points.length} notes`)}</T>
                    <T size={12} w="bold" color={s.color} numberOfLines={1}>{s.label}</T>
                  </View>
                  <Pressable
                    onPress={() => setConfirm(asking ? null : m.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={L('حذف الاجتماع', 'Delete the meeting', 'حذف الدورة', 'Delete the course')}
                    style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: asking ? tint(C.late, 0.12) : pressed || hovered ? C.surfaceAlt : 'transparent' })}
                  >
                    <Icon name="trash-can-outline" size={20} color={asking ? C.lateText : C.faint} />
                  </Pressable>
                </Pressable>
                {asking && (
                  <View style={{ flexDirection: D.row, alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: tint(C.late, 0.07), borderTopWidth: 1, borderTopColor: tint(C.late, 0.15) }}>
                    <T size={TS.small} color={C.lateText} style={{ flex: 1 }}>{L('حذف الاجتماع ومحضره؟ المهام التي أضفتها منه تبقى.', 'Delete this meeting and its minutes? Tasks you added from it stay.', 'حذف الدورة وملاحظاتها؟', 'Delete this course and its notes?')}</T>
                    <Pressable onPress={() => (setConfirm(null), deleteMeeting(m.id))} accessibilityRole="button" style={{ height: 34, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.lateText, justifyContent: 'center' }}>
                      <T size={13} w="bold" color="#fff">{tx('احذف', 'Delete')}</T>
                    </Pressable>
                    <Pressable onPress={() => setConfirm(null)} hitSlop={8}>
                      <T size={13} w="bold" color={C.sub}>{tx('إلغاء', 'Cancel')}</T>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
