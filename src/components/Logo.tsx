import React from 'react';
import { Image, View } from 'react-native';
import { C, F } from '../theme';
import { T } from '../ui';

const MARK = require('../../assets/brand/logo.png');

/** The cloud-G-spark mark */
export function Mark({ size = 34 }: { size?: number }) {
  return <Image source={MARK} style={{ width: size, height: size * 0.915 }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/** Mark + «غيث», for headers */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }} accessibilityLabel="غيث">
      <Mark size={size} />
      <T style={{ fontFamily: F.heavy, fontSize: size * 0.62, lineHeight: size * 0.95, color: C.indigo }}>غيث</T>
    </View>
  );
}
