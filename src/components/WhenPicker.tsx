import React from 'react';
import { Pressable, View } from 'react-native';
import { D, tx } from '../lib/i18n';
import { addDays, atTime, clock, dayLabel, nextMonday, startOfDay } from '../lib/tasks';
import { C, TS } from '../theme';
import { Chip, HScroll, Icon, IconName, T } from '../ui';

const HOURS = [9, 11, 13, 15, 17, 20];

function Step({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={label} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 10, backgroundColor: pressed ? C.lineHi : C.surfaceAlt, alignItems: 'center', justifyContent: 'center' })}>
      <Icon name={icon} size={20} color={C.indigo} />
    </Pressable>
  );
}

/** A day and a time: quick picks, then fine steps (a day, half an hour); `null` means "no date" */
export function WhenPicker({ value, onChange, noneLabel }: { value: Date | null; onChange: (d: Date | null) => void; noneLabel?: string }) {
  const now = new Date();
  const today = startOfDay(now);
  const base = value ?? atTime(addDays(today, 1), 9);
  const sameDay = (d: Date) => !!value && startOfDay(value).getTime() === startOfDay(d).getTime();
  const days: [string, Date][] = [];
  for (const [l, d] of [
    [tx('اليوم', 'Today'), today],
    [tx('غداً', 'Tomorrow'), addDays(today, 1)],
    [tx('بعد غد', 'In 2 days'), addDays(today, 2)],
    [tx('الاثنين القادم', 'Next Monday'), nextMonday(now)],
  ] as [string, Date][]) {
    if (!days.some(([, e]) => e.getTime() === d.getTime())) days.push([l, d]);
  }
  const setDay = (d: Date) => onChange(atTime(d, base.getHours(), base.getMinutes()));
  const setTime = (h: number) => onChange(atTime(value ?? today, h, 0));
  const shiftMin = (n: number) => onChange(new Date(base.getTime() + n * 60000));

  return (
    <View>
      <HScroll>
        <Chip label={noneLabel ?? tx('دون موعد', 'None')} on={!value} onPress={() => onChange(null)} />
        {days.map(([l, d]) => (
          <Chip key={l} label={l} on={sameDay(d)} onPress={() => setDay(d)} />
        ))}
      </HScroll>
      {value && (
        <>
          <View style={{ flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.bg, borderRadius: 14, padding: 8, marginTop: 10 }}>
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 6 }}>
              <Step icon={D.rtl ? 'chevron-right' : 'chevron-left'} label={tx('اليوم السابق', 'Previous day')} onPress={() => onChange(addDays(value, -1))} />
              <T w="medium" size={TS.small} style={{ minWidth: 88 }} align="center">{dayLabel(value)}</T>
              <Step icon={D.fwd} label={tx('اليوم التالي', 'Next day')} onPress={() => onChange(addDays(value, 1))} />
            </View>
            <View style={{ flexDirection: D.row, alignItems: 'center', gap: 6 }}>
              <Step icon="minus" label={tx('قبل نصف ساعة', '30 minutes earlier')} onPress={() => shiftMin(-30)} />
              <T w="medium" size={TS.small} style={{ minWidth: 70 }} align="center">{clock(value)}</T>
              <Step icon="plus" label={tx('بعد نصف ساعة', '30 minutes later')} onPress={() => shiftMin(30)} />
            </View>
          </View>
          <View style={{ marginTop: 8 }}>
            <HScroll>
              {HOURS.map((h) => (
                <Chip key={h} label={clock(atTime(today, h))} on={value.getHours() === h && value.getMinutes() === 0} onPress={() => setTime(h)} />
              ))}
            </HScroll>
          </View>
        </>
      )}
    </View>
  );
}
