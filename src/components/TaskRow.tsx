import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { CATS, clock, dayLabel, isLate, KINDS, Task } from '../lib/tasks';
import { C, TS } from '../theme';
import { Check, Icon, T } from '../ui';

/** When, short, for the left edge of a row: "10:30 ص" today, "بكرة" / "الخميس" otherwise */
function whenShort(iso: string, now: Date): { top: string; bottom?: string } {
  const d = new Date(iso);
  const day = dayLabel(d, now);
  return day === 'اليوم' ? { top: clock(d) } : { top: day.split(' ').slice(0, 2).join(' '), bottom: clock(d) };
}

/**
 * One task as a row inside a grouped card (the قديش list layout): the check on the right, the title, one quiet
 * line of kind · category · person, and the time on the left.
 */
export function TaskRow({ task, onToggle, onOpen, last, now = new Date() }: { task: Task; onToggle: () => void; onOpen: () => void; last?: boolean; now?: Date }) {
  const done = task.status === 'done';
  const late = isLate(task, now);
  const when = task.due_at ?? task.remind_at;
  const w = when && !done ? whenShort(when, now) : null;

  const toggle = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle();
  };

  const sub = [task.kind !== 'todo' ? KINDS[task.kind].label : null, CATS[task.category].label, task.person].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onOpen}
      accessibilityLabel={task.title}
      style={({ pressed }) => ({ flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: pressed ? C.bg : 'transparent' })}
    >
      <Check on={done} onPress={toggle} size={24} label={done ? 'رجّعها مفتوحة' : 'خلصت'} />
      <View style={{ flex: 1, marginRight: 12, marginLeft: 8 }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
          <T w="medium" numberOfLines={1} color={done ? C.faint : C.text} style={[{ flexShrink: 1 }, done ? { textDecorationLine: 'line-through' } : null]}>
            {task.title}
          </T>
          {!done && task.priority === 'high' && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.late }} />}
          {!done && !!task.repeat && <Icon name="repeat" size={14} color={C.faint} />}
        </View>
        {!done && <T size={TS.small} color={C.sub} numberOfLines={1}>{sub}</T>}
      </View>
      {w && (
        <View style={{ alignItems: 'flex-start' }}>
          <T w="medium" size={TS.small} color={late ? C.late : C.text} align="left">{w.top}</T>
          {!!w.bottom && <T size={TS.tiny} color={late ? C.late : C.sub} align="left">{w.bottom}</T>}
        </View>
      )}
      {!last && <View style={{ position: 'absolute', bottom: 0, left: 16, right: 52, height: 1, backgroundColor: C.line }} />}
    </Pressable>
  );
}
