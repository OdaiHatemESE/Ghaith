import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { CATS, isLate, KINDS, REPEATS, Task, whenLabel } from '../lib/tasks';
import { C, TS } from '../theme';
import { Icon, T } from '../ui';

/** One task: a round check on the right, title, then kind · category · when · person */
export function TaskRow({ task, onToggle, onOpen, last }: { task: Task; onToggle: () => void; onOpen: () => void; last?: boolean }) {
  const done = task.status === 'done';
  const late = isLate(task);
  const kind = KINDS[task.kind];
  const cat = CATS[task.category];
  const when = task.due_at ?? task.remind_at;

  const toggle = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle();
  };

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => ({ flexDirection: 'row-reverse', alignItems: 'flex-start', paddingVertical: 13, paddingHorizontal: 14, backgroundColor: pressed ? C.paper : 'transparent' })}
      accessibilityLabel={task.title}
    >
      <Pressable
        onPress={toggle}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? 'رجّعها مفتوحة' : 'خلصت'}
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: 2,
          borderColor: done ? C.ok : task.priority === 'high' ? C.late : kind.color,
          backgroundColor: done ? C.ok : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {done && <Icon name="check" size={16} color="#fff" />}
      </Pressable>

      <View style={{ flex: 1, marginRight: 12 }}>
        <T w="medium" color={done ? C.faint : C.text} style={done ? { textDecorationLine: 'line-through' } : undefined} numberOfLines={2}>
          {task.title}
        </T>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {task.kind !== 'todo' && (
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3, backgroundColor: kind.color + '18', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Icon name={kind.icon} size={12} color={kind.color} />
              <T size={TS.tiny} w="semibold" color={kind.color}>{kind.label}</T>
            </View>
          )}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3 }}>
            <Icon name={cat.icon} size={13} color={cat.color} />
            <T size={TS.tiny} color={C.sub}>{cat.label}</T>
          </View>
          {!!when && !done && (
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3 }}>
              <Icon name={task.due_at ? 'calendar-clock' : 'bell-outline'} size={13} color={late ? C.late : C.faint} />
              <T size={TS.tiny} w={late ? 'semibold' : 'regular'} color={late ? C.late : C.sub}>{whenLabel(when)}</T>
            </View>
          )}
          {!!task.person && (
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3 }}>
              <Icon name="account-outline" size={13} color={C.faint} />
              <T size={TS.tiny} color={C.sub} numberOfLines={1}>{task.person}</T>
            </View>
          )}
          {!!task.repeat && (
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 3 }}>
              <Icon name="repeat" size={13} color={C.faint} />
              <T size={TS.tiny} color={C.sub}>{REPEATS[task.repeat]}</T>
            </View>
          )}
        </View>
      </View>
      {!last && <View style={{ position: 'absolute', bottom: 0, left: 14, right: 52, height: 1, backgroundColor: C.line }} />}
    </Pressable>
  );
}
