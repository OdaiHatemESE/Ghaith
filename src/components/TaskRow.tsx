import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { CATS, clock, dayDiff, dayLabel, isLate, KINDS, Task } from '../lib/tasks';
import { C, TS } from '../theme';
import { Check, Icon, T } from '../ui';
import { D, tx } from '../lib/i18n';

/** When, short, for the end of a row: "10:30 ص" today, otherwise the day over the time */
function whenShort(iso: string, now: Date): { top: string; bottom?: string } {
  const d = new Date(iso);
  return dayDiff(d, now) === 0 ? { top: clock(d) } : { top: dayLabel(d, now).split(' ').slice(0, 2).join(' '), bottom: clock(d) };
}

/**
 * One task as a row inside a grouped card (the قديش list layout): the check on the right, the title, one quiet
 * line of kind · category · person, and the time on the left.
 */
export function TaskRow({ task, onToggle, onOpen, last, now = new Date(), note }: { task: Task; onToggle: () => void; onOpen: () => void; last?: boolean; now?: Date; note?: string }) {
  const done = task.status === 'done';
  const late = isLate(task, now);
  const when = task.due_at ?? task.remind_at;
  const w = when && !done ? whenShort(when, now) : null;

  const toggle = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle();
  };

  const sub = note ? [task.person, note].filter(Boolean).join(' · ') : [task.kind !== 'todo' ? KINDS[task.kind].label : null, CATS[task.category].label, task.person].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onOpen}
      accessibilityLabel={task.title}
      style={({ pressed }) => ({ flexDirection: D.row, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: pressed ? C.bg : 'transparent' })}
    >
      <Check on={done} onPress={toggle} size={24} label={done ? tx('إعادة فتحها', 'Reopen') : tx('أُنجزت', 'Done')} />
      <View style={{ flex: 1, [D.rtl ? 'marginRight' : 'marginLeft']: 12, [D.rtl ? 'marginLeft' : 'marginRight']: 8 }}>
        <View style={{ flexDirection: D.row, alignItems: 'center', gap: 6 }}>
          <T w="medium" numberOfLines={1} color={done ? C.faint : C.text} style={[{ flexShrink: 1 }, done ? { textDecorationLine: 'line-through' } : null]}>
            {task.title}
          </T>
          {!done && task.priority === 'high' && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.late }} />}
          {!done && !!task.repeat && <Icon name="repeat" size={14} color={C.faint} />}
        </View>
        {!done && <T size={TS.small} color={C.sub} numberOfLines={1}>{sub}</T>}
      </View>
      {w && (
        <View style={{ alignItems: D.rtl ? 'flex-start' : 'flex-end' }}>
          <T w="medium" size={TS.small} color={late ? C.late : C.text} align="end">{w.top}</T>
          {!!w.bottom && <T size={TS.tiny} color={late ? C.late : C.sub} align="end">{w.bottom}</T>}
        </View>
      )}
      {!last && <View style={{ position: 'absolute', bottom: 0, [D.end]: 16, [D.start]: 52, height: 1, backgroundColor: C.line }} />}
    </Pressable>
  );
}
