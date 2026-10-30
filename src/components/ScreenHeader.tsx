import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, TS } from '../theme';
import { IconButton, T } from '../ui';

/** Back arrow (on the right, RTL), a title, and an optional action on the left */
export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 10, paddingBottom: 12, paddingHorizontal: 16, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: C.bg }}>
      <IconButton icon="arrow-right" label="رجوع" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <T w="semibold" size={TS.h1} style={{ flex: 1 }}>{title}</T>
      {right}
    </View>
  );
}
