import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { D, getLang, tx } from '../lib/i18n';
import { anchor, catOf, clock, dayDiff, dayLabel, isLate, KINDS, Task } from '../lib/tasks';
import { C, TS } from '../theme';
import { Check, Icon, IconName, T } from '../ui';

type When = { text: string; tone: 'late' | 'missed' | 'soon' | 'normal'; icon: IconName };

/**
 * The time of a task, said the way you'd say it:
 * past → "قبل يومين" / "أمس 9:00 ص" / "9:00 ص" (red when the deadline passed, amber when only the reminder did),
 * future → "9:00 ص" today, "غداً 9:00 ص", "الثلاثاء 9:00 ص", "الخميس 31 ديسمبر 5:00 م".
 */
function whenOf(t: Task, now: Date): When | null {
  const a = anchor(t);
  if (!a) return null;
  const d = new Date(a);
  const diff = dayDiff(d, now);
  if (d < now) {
    const tone = isLate(t, now) ? 'late' : 'missed';
    const icon: IconName = tone === 'late' ? 'alert-circle-outline' : 'bell-alert-outline';
    if (diff === 0) return { text: clock(d), tone, icon };
    if (diff === -1) return { text: `${tx('أمس', 'Yesterday')} ${clock(d)}`, tone, icon };
    const n = -diff;
    const ago = getLang() === 'en' ? `${n} days ago` : n === 2 ? 'قبل يومين' : n <= 10 ? `قبل ${n} أيام` : `قبل ${n} يوماً`;
    return { text: ago, tone, icon };
  }
  const soon = d.getTime() - now.getTime() < 2 * 3600000;
  return { text: diff === 0 ? clock(d) : `${dayLabel(d, now)} ${clock(d)}`, tone: soon ? 'soon' : 'normal', icon: t.due_at ? 'calendar-blank-outline' : 'bell-outline' };
}

const TONE = { late: C.late, missed: C.amberText, soon: C.glow, normal: C.sub };

/**
 * One task as a row inside a grouped card: the check, the title (up to two lines), then one quiet line that starts
 * with when it is, followed by kind · category · person.
 */
export function TaskRow({ task, onToggle, onOpen, last, now = new Date(), note }: { task: Task; onToggle: () => void; onOpen: () => void; last?: boolean; now?: Date; note?: string }) {
  const done = task.status === 'done';
  const w = done ? null : whenOf(task, now);

  const toggle = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle();
  };

  const rest = (note ? [task.person, note] : [task.kind !== 'todo' ? KINDS[task.kind].label : null, catOf(task.category).label, task.person]).filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onOpen}
      accessibilityLabel={task.title}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: D.row,
        alignItems: 'flex-start',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: pressed || hovered ? C.bg : 'transparent',
      })}
    >
      <View style={{ paddingTop: 1 }}>
        <Check on={done} onPress={toggle} size={22} label={done ? tx('إعادة فتحها', 'Reopen') : tx('أُنجزت', 'Done')} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <T w="medium" size={14.5} numberOfLines={2} color={done ? C.faint : C.text} style={[{ lineHeight: 22 }, done ? { textDecorationLine: 'line-through' } : null]}>
          {task.title}
        </T>
        {!done && (
          <View style={{ flexDirection: D.row, alignItems: 'center', gap: 6 }}>
            {w && (
              <View style={{ flexDirection: D.row, alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <Icon name={w.icon} size={13} color={TONE[w.tone]} />
                <T size={TS.small} w={w.tone === 'normal' ? 'regular' : 'medium'} color={TONE[w.tone]} numberOfLines={1}>{w.text}</T>
              </View>
            )}
            {w && !!rest && <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: C.faint }} />}
            {!!rest && <T size={TS.small} color={C.sub} numberOfLines={1} style={{ flexShrink: 1 }}>{rest}</T>}
            {!!task.repeat && <Icon name="repeat" size={13} color={C.faint} />}
          </View>
        )}
      </View>
      {!done && task.priority === 'high' && (
        <View style={{ paddingTop: 3 }} accessibilityLabel={tx('عاجلة', 'Urgent')}>
          <Icon name="flag" size={15} color={C.late} />
        </View>
      )}
      {!last && <View style={{ position: 'absolute', bottom: 0, [D.end]: 16, [D.start]: 50, height: 1, backgroundColor: C.line }} />}
    </Pressable>
  );
}
