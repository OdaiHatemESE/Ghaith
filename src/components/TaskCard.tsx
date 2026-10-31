import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { CATS, isLate, KINDS, shortWhen, Task } from '../lib/tasks';
import { C, lift, R, tint } from '../theme';
import { Check, Icon, T, Tag } from '../ui';

/** One task as a white card: the check on the right, the title, then time · kind · category · person */
export function TaskCard({ task, onToggle, onOpen }: { task: Task; onToggle: () => void; onOpen: () => void }) {
  const done = task.status === 'done';
  const late = isLate(task);
  const when = task.due_at ?? task.remind_at;
  const kind = KINDS[task.kind];
  const cat = CATS[task.category];

  const toggle = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle();
  };

  return (
    <Pressable
      onPress={onOpen}
      accessibilityLabel={task.title}
      style={({ pressed }) => ({
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 12,
        backgroundColor: pressed ? '#FBFBFF' : C.surface,
        borderRadius: R.card,
        paddingVertical: 12,
        paddingRight: 12,
        paddingLeft: 10,
        marginBottom: 8,
        ...lift,
      })}
    >
      <Check on={done} onPress={toggle} label={done ? 'رجّعها مفتوحة' : 'خلصت'} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w="bold" size={14.5} color={done ? C.faint : C.text} numberOfLines={2} style={done ? { textDecorationLine: 'line-through' } : undefined}>
          {task.title}
        </T>
        {!done && (
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
            {!!when && (
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3 }}>
                <Icon name={late ? 'alert-circle-outline' : 'clock-outline'} size={13} color={late ? C.late : C.sub} />
                <T size={12} w="semibold" color={late ? C.late : C.sub}>{shortWhen(when)}</T>
              </View>
            )}
            {task.kind !== 'todo' && <Tag label={kind.label} color={kind.color} />}
            <Tag label={cat.label} color={cat.color} />
            {task.priority === 'high' && <Tag label="مهم" color={C.late} />}
            {!!task.person && <T size={12} w="semibold" color={C.sub} numberOfLines={1} style={{ flexShrink: 1 }}>{task.person}</T>}
            {!!task.repeat && <Icon name="repeat" size={13} color={C.faint} />}
          </View>
        )}
      </View>
      {!done && <Icon name="chevron-left" size={18} color={tint(C.indigo, 0.3)} />}
    </Pressable>
  );
}
