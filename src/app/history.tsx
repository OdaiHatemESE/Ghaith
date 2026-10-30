import React, { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { Action, useStore } from '../lib/store';
import { dayLabel, timeLabel } from '../lib/tasks';
import { C, TS } from '../theme';
import { Icon, IconName, T } from '../ui';

const ACTION_ICON: Record<Action['type'], [IconName, string, string]> = {
  added: ['plus', C.accent, 'أضفت'],
  updated: ['pencil-outline', C.amber, 'عدّلت'],
  done: ['check', C.ok, 'خلّصت'],
  reopened: ['restore', C.amber, 'رجّعت'],
  deleted: ['close', C.late, 'حذفت'],
};

/** Everything said to غيث and what it did, newest at the bottom */
export default function History() {
  const insets = useSafeAreaInsets();
  const { messages } = useStore();
  const scroll = useRef<ScrollView>(null);
  const rows = messages.map((m, i) => {
    const day = dayLabel(new Date(m.created_at));
    return { m, header: i === 0 || dayLabel(new Date(messages[i - 1].created_at)) !== day ? day : '' };
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="المحادثات" />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {!messages.length && <T color={C.sub} align="center" style={{ marginTop: 48 }}>لسا ما حكينا.</T>}
        {rows.map(({ m, header }) => {
          const mine = m.role === 'user';
          return (
            <View key={m.id}>
              {!!header && <T size={TS.tiny} color={C.faint} align="center" style={{ marginVertical: 8 }}>{header}</T>}
              <View
                style={{
                  alignSelf: mine ? 'flex-start' : 'flex-end',
                  maxWidth: '86%',
                  backgroundColor: mine ? C.accent : C.surface,
                  borderWidth: mine ? 0 : 1,
                  borderColor: C.line,
                  borderRadius: 20,
                  borderTopLeftRadius: mine ? 6 : 20,
                  borderTopRightRadius: mine ? 20 : 6,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <T color="#fff">{m.content}</T>
                {m.actions?.length > 0 && (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    {m.actions.map((a, i) => {
                      const [icon, color, word] = ACTION_ICON[a.type] ?? ACTION_ICON.updated;
                      return (
                        <View key={i} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                          <Icon name={icon} size={14} color={color} />
                          <T size={TS.tiny} color={C.sub} style={{ flex: 1 }} numberOfLines={1}>{word}: {a.title}</T>
                        </View>
                      );
                    })}
                  </View>
                )}
                <T size={10} color={mine ? '#DDE4FF' : C.faint} align="left" style={{ marginTop: 2 }}>{timeLabel(new Date(m.created_at))}</T>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
