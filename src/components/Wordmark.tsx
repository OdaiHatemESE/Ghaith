import React from 'react';
import { Text, View } from 'react-native';
import { C, F } from '../theme';

/** The غيث wordmark: the name set in Reem Kufi */
export function Wordmark({ size = 28, color = C.text }: { size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start' }} accessibilityLabel="غيث" accessibilityRole="header">
      <Text style={{ fontFamily: F.brand, fontSize: size, color, lineHeight: size * 1.45, includeFontPadding: false }}>غيث</Text>
    </View>
  );
}
