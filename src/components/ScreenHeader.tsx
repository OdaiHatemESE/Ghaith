import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TS } from '../theme';
import { IconButton, T } from '../ui';
import { D, tx } from '../lib/i18n';
import { useWide } from '../lib/useWide';

/** Back arrow at the reading start, a title, and an optional action at the end */
export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  return (
    <View style={{ paddingTop: wide ? 32 : insets.top + 10, paddingBottom: 12, paddingHorizontal: wide ? 0 : 16, flexDirection: D.row, alignItems: 'center', gap: 12, width: '100%', maxWidth: wide ? 880 : undefined, alignSelf: 'center' }}>
      {!wide && <IconButton icon={D.back} label={tx('رجوع', 'Back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}
      <T w="bold" size={wide ? TS.display : TS.h1} style={{ flex: 1, lineHeight: wide ? 42 : 36 }}>{title}</T>
      {right}
    </View>
  );
}
