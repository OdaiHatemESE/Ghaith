import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useId } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleProp, Text, TextInput, TextInputProps, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { C, F, GRADIENT, lift, R, tint, TS } from './theme';
import { D, tx } from './lib/i18n';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

/** Text in Almarai, aligned to the reading direction */
export function T({
  w = 'regular',
  size = TS.body,
  color = C.text,
  align = 'start',
  style,
  ...rest
}: TextProps & { w?: Weight; size?: number; color?: string; align?: 'right' | 'left' | 'center' | 'start' | 'end'; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: F[w], fontSize: size, color, textAlign: align === 'start' ? D.align : align === 'end' ? D.alignEnd : align, writingDirection: D.writing, lineHeight: Math.round(size * 1.5) }, style]}
    />
  );
}

/** Numbers */
export function Num({ children, size = 24, color = C.indigo, style }: { children: React.ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: F.num, fontSize: size, color, lineHeight: Math.round(size * 1.25), letterSpacing: size > 30 ? -1 : 0 }, style]}>{children}</Text>;
}

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color = C.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

/** A gradient that fills its parent (drawn with SVG so it ships without a new native module) */
export function Gradient({ colors = GRADIENT, angle = 'horizontal', radius = 0, style }: { colors?: readonly string[]; angle?: 'horizontal' | 'diagonal' | 'vertical'; radius?: number; style?: StyleProp<ViewStyle> }) {
  const id = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [x2, y2] = angle === 'horizontal' ? ['1', '0'] : angle === 'vertical' ? ['0', '1'] : ['1', '1'];
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius, overflow: 'hidden' }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
            {colors.map((c, i) => (
              <Stop key={i} offset={String(i / (colors.length - 1))} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Rounded-square icon button (header actions) */
export function IconButton({ icon, onPress, label, size = 42, color = C.indigo }: { icon: IconName; onPress: () => void; label: string; size?: number; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: 14, backgroundColor: pressed ? C.surfaceAlt : C.surface, alignItems: 'center', justifyContent: 'center', ...lift })}
    >
      <Icon name={icon} size={size * 0.5} color={color} />
    </Pressable>
  );
}

/** Horizontal scroller that starts from the reading edge */
export function HScroll({ children, gap = 8, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  const ref = React.useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => D.rtl && ref.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={[{ flexDirection: D.row, gap, paddingVertical: 2 }, style]}
    >
      {children}
    </ScrollView>
  );
}

export function Chip({ label, on, onPress, icon, color = C.glow }: { label: string; on: boolean; onPress: () => void; icon?: IconName; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: D.row,
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: R.pill,
        backgroundColor: on ? tint(color, 0.12) : C.surface,
        borderWidth: 1.5,
        borderColor: on ? color : C.line,
      }}
    >
      {icon && <Icon name={icon} size={15} color={on ? color : C.sub} />}
      <T size={TS.small} w={on ? 'semibold' : 'regular'} color={on ? C.indigo : C.text}>{label}</T>
    </Pressable>
  );
}

/** Small read-only tag: kind, category, time */
export function Tag({ label, color = C.indigo, bg, icon }: { label: string; color?: string; bg?: string; icon?: IconName }) {
  return (
    <View style={{ flexDirection: D.row, alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 2, borderRadius: R.pill, backgroundColor: bg ?? tint(color, 0.1) }}>
      {icon && <Icon name={icon} size={12} color={color} />}
      <T size={TS.tiny} w="medium" color={color}>{label}</T>
    </View>
  );
}

/** Two or three options in one rounded track */
export function Segmented<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  return (
    <View style={{ flexDirection: D.row, backgroundColor: C.surfaceAlt, borderRadius: R.pill, padding: 4 }}>
      {options.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, paddingVertical: 8, borderRadius: R.pill, backgroundColor: on ? C.surface : 'transparent', alignItems: 'center', ...(on ? lift : {}) }}
          >
            <T size={TS.small} w={on ? 'semibold' : 'regular'} color={on ? C.indigo : C.sub} align="center">{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Gradient pill: the main action on a screen */
export function PrimaryButton({ label, onPress, busy = false, disabled = false, icon, tone = 'brand', style }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; icon?: IconName; tone?: 'brand' | 'late'; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={busy || disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      style={({ pressed }) => [
        {
          height: 54,
          borderRadius: R.pill,
          flexDirection: D.row,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          opacity: disabled ? 0.45 : pressed || busy ? 0.88 : 1,
          shadowColor: C.glow,
          shadowOpacity: disabled ? 0 : 0.35,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: disabled ? 0 : 5,
          backgroundColor: tone === 'late' ? C.late : C.indigoHi,
        },
        style,
      ]}
    >
      {tone === 'brand' && <Gradient radius={R.pill} />}
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <T w="bold" size={16} color="#fff" align="center">{label}</T>
          {icon && <Icon name={icon} size={20} color="#fff" />}
        </>
      )}
    </Pressable>
  );
}

/** Outline pill: the secondary action */
export function GhostButton({ label, onPress, icon, color = C.indigo, style }: { label: string; onPress: () => void; icon?: IconName; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flex: 1,
          height: 48,
          borderRadius: R.pill,
          backgroundColor: pressed ? C.surfaceAlt : C.surface,
          borderWidth: 1.5,
          borderColor: C.lineHi,
          flexDirection: D.row,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={18} color={color} />}
      <T w="semibold" size={TS.body} color={color}>{label}</T>
    </Pressable>
  );
}

/** Labelled text input. `ltr` for usernames and passwords. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  ltr,
  autoFocus,
  multiline,
  onSubmitEditing,
  returnKeyType,
  autoComplete,
  maxLength,
  minHeight,
}: {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  ltr?: boolean;
  autoFocus?: boolean;
  multiline?: boolean;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  autoComplete?: TextInputProps['autoComplete'];
  maxLength?: number;
  minHeight?: number;
}) {
  const [hidden, setHidden] = React.useState(true);
  return (
    <View style={{ marginTop: label ? 14 : 0 }}>
      {!!label && <T w="semibold" size={TS.small} color={C.sub} style={{ marginBottom: 6 }}>{label}</T>}
      <View style={{ flexDirection: D.row, alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.line }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.faint}
          secureTextEntry={secure && hidden}
          autoCapitalize={ltr ? 'none' : 'sentences'}
          autoCorrect={!ltr}
          autoFocus={autoFocus}
          multiline={multiline}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          autoComplete={autoComplete}
          maxLength={maxLength}
          accessibilityLabel={label ?? placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            width: '100%',
            fontFamily: F.regular,
            fontSize: TS.body,
            color: C.text,
            textAlign: ltr ? 'left' : D.align,
            writingDirection: ltr ? 'ltr' : D.writing,
            paddingHorizontal: 14,
            paddingVertical: 13,
            minHeight: multiline ? minHeight ?? 76 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
            ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
          }}
        />
        {secure && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} style={{ paddingHorizontal: 12 }} accessibilityLabel={hidden ? tx('إظهار كلمة المرور', 'Show password') : tx('إخفاء كلمة المرور', 'Hide password')}>
            <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.faint} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: C.surface, borderRadius: R.card, ...lift }, style]}>{children}</View>;
}

export function ErrorText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <View style={{ flexDirection: D.row, alignItems: 'center', gap: 6, backgroundColor: tint(C.late, 0.09), borderRadius: 12, padding: 10, marginTop: 14 }}>
      <Icon name="alert-circle-outline" size={18} color={C.late} />
      <T size={TS.small} color={C.late} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return <T w="semibold" size={TS.small} color={C.sub} style={{ marginTop: 18, marginBottom: 8 }}>{children}</T>;
}

/** Settings-style row: icon, title, optional detail, and something on the left */
export function ListRow({ icon, title, detail, onPress, last, danger, right }: { icon?: IconName; title: string; detail?: string; onPress?: () => void; last?: boolean; danger?: boolean; right?: React.ReactNode }) {
  const color = danger ? C.late : C.glow;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: D.row, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, backgroundColor: pressed ? C.bg : 'transparent' })}
    >
      {icon && (
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: tint(color, 0.12), alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={19} color={color} />
        </View>
      )}
      <View style={{ flex: 1, [D.rtl ? 'marginRight' : 'marginLeft']: icon ? 12 : 0 }}>
        <T w="medium" color={danger ? C.late : C.text}>{title}</T>
        {!!detail && <T size={TS.small} color={C.sub}>{detail}</T>}
      </View>
      {right}
      {!last && <View style={{ position: 'absolute', bottom: 0, [D.end]: 16, [D.start]: icon ? 64 : 16, height: 1, backgroundColor: C.line }} />}
    </Pressable>
  );
}

/** On/off switch drawn the same on every platform */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={8}
      style={{ width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? C.teal : C.lineHi, flexDirection: D.row, justifyContent: value ? 'flex-end' : 'flex-start' }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
    </Pressable>
  );
}

/** Round check used on task cards */
export function Check({ on, onPress, size = 26, label }: { on: boolean; onPress?: () => void; size?: number; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: on ? C.teal : C.lineHi,
        backgroundColor: on ? C.teal : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on && <Icon name="check-bold" size={size * 0.58} color="#fff" />}
    </Pressable>
  );
}

/** Section title with an optional link on the left (as in قديش) */
export function SectionHead({ title, action, onAction, color = C.text }: { title: string; action?: string; onAction?: () => void; color?: string }) {
  return (
    <View style={{ flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 }}>
      <T w="bold" size={TS.h2} color={color}>{title}</T>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={10}>
          <T w="medium" size={TS.small} color={C.glow}>{action}</T>
        </Pressable>
      )}
    </View>
  );
}
