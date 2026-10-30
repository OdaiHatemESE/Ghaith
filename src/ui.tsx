import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleProp, Text, TextInput, TextInputProps, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import { C, F, TS } from './theme';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

/** Arabic text: Readex Pro, right aligned, RTL bidi */
export function T({
  w = 'regular',
  size = TS.body,
  color = C.text,
  align = 'right',
  style,
  ...rest
}: TextProps & { w?: Weight; size?: number; color?: string; align?: 'right' | 'left' | 'center'; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      {...rest}
      style={[{ fontFamily: F[w], fontSize: size, color, textAlign: align, writingDirection: 'rtl', lineHeight: Math.round(size * 1.6) }, style]}
    />
  );
}

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color = C.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

/** Round icon button for headers */
export function IconButton({ icon, onPress, label, size = 42 }: { icon: IconName; onPress: () => void; label: string; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: pressed ? C.surfaceHi : C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' })}
    >
      <Icon name={icon} size={size * 0.48} color={C.sub} />
    </Pressable>
  );
}

/** Horizontal scroller that starts from the right edge (RTL) */
export function HScroll({ children, gap = 8, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  const ref = React.useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={[{ flexDirection: 'row-reverse', gap }, style]}
    >
      {children}
    </ScrollView>
  );
}

export function Chip({ label, on, onPress, icon, color = C.accent }: { label: string; on: boolean; onPress: () => void; icon?: IconName; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: on ? color + '2A' : C.surface,
        borderWidth: 1,
        borderColor: on ? color : C.line,
      }}
    >
      {icon && <Icon name={icon} size={15} color={on ? color : C.sub} />}
      <T size={TS.small} w={on ? 'semibold' : 'regular'} color={on ? C.text : C.sub}>{label}</T>
    </Pressable>
  );
}

/** Two or three options in one rounded track */
export function Segmented<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  return (
    <View style={{ flexDirection: 'row-reverse', backgroundColor: C.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: C.line }}>
      {options.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: on ? C.surfaceHi : 'transparent', alignItems: 'center' }}
          >
            <T size={TS.small} w={on ? 'semibold' : 'regular'} color={on ? C.text : C.sub} align="center">{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryButton({ label, onPress, busy = false, disabled = false, icon, tone = 'accent' }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; icon?: IconName; tone?: 'accent' | 'late' }) {
  return (
    <Pressable
      onPress={busy || disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      style={({ pressed }) => ({
        backgroundColor: tone === 'late' ? C.late : C.accent,
        borderRadius: 16,
        paddingVertical: 15,
        flexDirection: 'row-reverse',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        opacity: disabled ? 0.4 : pressed || busy ? 0.85 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          {icon && <Icon name={icon} size={20} color="#fff" />}
          <T w="semibold" size={16} color="#fff" align="center">{label}</T>
        </>
      )}
    </Pressable>
  );
}

export function GhostButton({ label, onPress, icon, color = C.text }: { label: string; onPress: () => void; icon?: IconName; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        borderRadius: 14,
        paddingVertical: 12,
        backgroundColor: pressed ? C.surfaceHi : C.surface,
        borderWidth: 1,
        borderColor: C.line,
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      })}
    >
      {icon && <Icon name={icon} size={18} color={color} />}
      <T w="medium" size={TS.small} color={color}>{label}</T>
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
}) {
  const [hidden, setHidden] = React.useState(true);
  return (
    <View style={{ marginTop: label ? 14 : 0 }}>
      {!!label && <T w="medium" size={TS.small} color={C.sub} style={{ marginBottom: 6 }}>{label}</T>}
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.line }}>
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
            textAlign: 'right',
            writingDirection: ltr ? 'ltr' : 'rtl',
            paddingHorizontal: 14,
            paddingVertical: 13,
            minHeight: multiline ? 76 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
        {secure && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} style={{ paddingHorizontal: 12 }} accessibilityLabel={hidden ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور'}>
            <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.faint} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }, style]}>{children}</View>;
}

export function ErrorText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: C.lateSoft, borderRadius: 12, padding: 10, marginTop: 14 }}>
      <Icon name="alert-circle-outline" size={18} color={C.late} />
      <T size={TS.small} color={C.late} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return <T w="medium" size={TS.small} color={C.sub} style={{ marginTop: 18, marginBottom: 8 }}>{children}</T>;
}

/** Settings-style row: icon, title, optional detail, and something on the left */
export function ListRow({ icon, title, detail, onPress, last, danger, right }: { icon?: IconName; title: string; detail?: string; onPress?: () => void; last?: boolean; danger?: boolean; right?: React.ReactNode }) {
  const tint = danger ? C.late : C.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: pressed ? C.surfaceHi : 'transparent' })}
    >
      {icon && (
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={19} color={tint} />
        </View>
      )}
      <View style={{ flex: 1, marginRight: icon ? 12 : 0 }}>
        <T w="medium" color={danger ? C.late : C.text}>{title}</T>
        {!!detail && <T size={TS.small} color={C.sub}>{detail}</T>}
      </View>
      {right}
      {!last && <View style={{ position: 'absolute', bottom: 0, left: 16, right: icon ? 64 : 16, height: 1, backgroundColor: C.line }} />}
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
      style={{ width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? C.accent : C.lineHi, flexDirection: 'row', justifyContent: value ? 'flex-start' : 'flex-end' }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
    </Pressable>
  );
}
