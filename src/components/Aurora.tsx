import React, { useEffect, useId, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { C } from '../theme';

function Blob({ color, size, opacity }: { color: string; size: number; opacity: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`a${id}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.6" stopColor={color} stopOpacity={opacity * 0.4} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill={`url(#a${id})`} />
    </Svg>
  );
}

/** The calm, slowly drifting glow behind every screen */
export function Aurora() {
  const { width, height } = useWindowDimensions();
  const [drift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 14000, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(drift, { toValue: 0, duration: 14000, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [drift]);
  const w = Math.min(width, 520);
  const move = (x: number, y: number) => [
    { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
    { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, y] }) },
  ];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, overflow: 'hidden' }]}>
      <Animated.View style={{ position: 'absolute', top: -w * 0.35, left: -w * 0.45, transform: move(30, 20) }}>
        <Blob color={C.peach} size={w * 1.1} opacity={0.75} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', top: height * 0.12, right: -w * 0.5, transform: move(-25, 30) }}>
        <Blob color={C.violet} size={w * 1.05} opacity={0.5} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', top: height * 0.5, left: -w * 0.35, transform: move(20, -25) }}>
        <Blob color={C.sky} size={w * 0.95} opacity={0.55} />
      </Animated.View>
    </View>
  );
}
