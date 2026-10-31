import React from 'react';
import { Pressable, View } from 'react-native';
import { addDays, atTime, dayLabel, nextMonday, startOfDay, timeLabel } from '../lib/tasks';
import { C, TS } from '../theme';
import { Chip, HScroll, Icon, IconName, T } from '../ui';

const TIMES: [number, number, string][] = [
  [9, 0, '9 الصبح'],
  [13, 0, '1 الظهر'],
  [17, 0, '5 العصر'],
  [20, 0, '8 المسا'],
];

function Step({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={label} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 10, backgroundColor: pressed ? C.lineHi : C.surfaceAlt, alignItems: 'center', justifyContent: 'center' })}>
      <Icon name={icon} size={20} color={C.sub} />
    </Pressable>
  );
}

/** A day and a time, with quick picks; `null` means "no date" */
export function WhenPicker({ value, onChange, noneLabel = 'بدون' }: { value: Date | null; onChange: (d: Date | null) => void; noneLabel?: string }) {
  const now = new Date();
  const today = startOfDay(now);
  const base = value ?? atTime(addDays(today, 1), 9);
  const sameDay = (d: Date) => value && startOfDay(value).getTime() === startOfDay(d).getTime();
  const days: [string, Date][] = [
    ['اليوم', today],
    ['بكرة', addDays(today, 1)],
    ['بعد بكرة', addDays(today, 2)],
    ['الاثنين الجاي', nextMonday(now)],
  ].filter(([, d], i, all) => all.findIndex(([, e]) => (e as Date).getTime() === (d as Date).getTime()) === i) as [string, Date][];
  const setDay = (d: Date) => onChange(atTime(d, base.getHours(), base.getMinutes()));
  const setTime = (h: number, m: number) => onChange(atTime(value ?? today, h, m));
  const shiftMin = (n: number) => onChange(new Date(base.getTime() + n * 60000));

  return (
    <View>
      <HScroll>
        <Chip label={noneLabel} on={!value} onPress={() => onChange(null)} />
        {days.map(([l, d]) => (
          <Chip key={l} label={l} on={!!sameDay(d)} onPress={() => setDay(d)} />
        ))}
      </HScroll>
      {value && (
        <>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line, borderRadius: 16, padding: 8, marginTop: 10 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
              <Step icon="chevron-right" label="يوم قبل" onPress={() => onChange(addDays(value, -1))} />
              <T w="semibold" size={TS.small} style={{ minWidth: 92 }} align="center">{dayLabel(value)}</T>
              <Step icon="chevron-left" label="يوم بعد" onPress={() => onChange(addDays(value, 1))} />
            </View>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
              <Step icon="minus" label="نص ساعة قبل" onPress={() => shiftMin(-30)} />
              <T w="semibold" size={TS.small} style={{ minWidth: 76 }} align="center">{timeLabel(value)}</T>
              <Step icon="plus" label="نص ساعة بعد" onPress={() => shiftMin(30)} />
            </View>
          </View>
          <View style={{ marginTop: 8 }}>
            <HScroll>
              {TIMES.map(([h, m, l]) => (
                <Chip key={l} label={l} on={value.getHours() === h && value.getMinutes() === m} onPress={() => setTime(h, m)} />
              ))}
            </HScroll>
          </View>
        </>
      )}
    </View>
  );
}
