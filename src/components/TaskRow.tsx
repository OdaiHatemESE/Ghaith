import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { CATS, isLate, KINDS, Task, whenLabel } from '../lib/tasks';
import { C, TS } from '../theme';
import { Icon, T } from '../ui';

/** One task: a round check on the right, the title, and one quiet line of when · who · kind */
export function TaskRow({ task, onToggle, onOpen, last, compact }: { task: Task; onToggle: () => void; onOpen: () => void; last?: boolean; compact?: boolean }) {
  const done = task.status === 'done';
  const late = isLate(task);
  const kind = KINDS[task.kind];
  const cat = CATS[task.category];
  const when = task.due_at ?? task.remind_at;
  const ring = done ? C.ok : late ? C.late : task.priority === 'high' ? C.amber : C.lineHi;

  const toggle = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle();
  };

  const meta: string[] = [];
  if (when && !done) meta.push(whenLabel(when));
  if (task.person) meta.push(task.person);
  if (!compact) meta.push(cat.label);

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => ({ flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: compact ? 10 : 13, paddingHorizontal: 18, backgroundColor: pressed ? C.surfaceHi : 'transparent' })}
      accessibilityLabel={task.title}
    >
      <Pressable
        onPress={toggle}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? 'رجّعها مفتوحة' : 'خلصت'}
        style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: ring, backgroundColor: done ? C.ok : 'transparent', alignItems: 'center', justifyContent: 'center' }}
      >
        {done && <Icon name="check" size={15} color="#fff" />}
      </Pressable>

      <View style={{ flex: 1, marginRight: 14 }}>
        <T w="medium" size={compact ? TS.small : TS.body} color={done ? C.faint : C.text} style={done ? { textDecorationLine: 'line-through' } : undefined} numberOfLines={2}>
          {task.title}
        </T>
        {!!meta.length && (
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {task.kind !== 'todo' && (
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3 }}>
                <Icon name={kind.icon} size={12} color={kind.color} />
                <T size={TS.tiny} w="medium" color={kind.color}>{kind.label}</T>
                <T size={TS.tiny} color={C.faint}>·</T>
              </View>
            )}
            <T size={TS.tiny} color={late ? C.late : C.faint} numberOfLines={1} style={{ flexShrink: 1 }}>{meta.join(' · ')}</T>
            {!!task.repeat && <Icon name="repeat" size={12} color={C.faint} />}
          </View>
        )}
      </View>
      {!last && <View style={{ position: 'absolute', bottom: 0, left: 18, right: 56, height: 1, backgroundColor: C.line }} />}
    </Pressable>
  );
}
