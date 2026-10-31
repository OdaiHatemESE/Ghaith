import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/** The calm sunrise behind the "today" card: a glowing sun on the horizon, layered hills and a tower */
export function Sunrise() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%" viewBox="0 0 350 168" preserveAspectRatio="xMidYMax slice">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#272C8A" />
            <Stop offset="0.55" stopColor="#1B1F6B" />
            <Stop offset="1" stopColor="#3A2A9E" />
          </LinearGradient>
          <RadialGradient id="sun" cx="22%" cy="78%" r="60%">
            <Stop offset="0" stopColor="#8FEBF2" stopOpacity="0.95" />
            <Stop offset="0.25" stopColor="#14C7C9" stopOpacity="0.45" />
            <Stop offset="0.6" stopColor="#7C5CFF" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#1B1F6B" stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="m1" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#5B4BD6" />
            <Stop offset="1" stopColor="#2A2C8F" />
          </LinearGradient>
          <LinearGradient id="m2" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3A35A8" />
            <Stop offset="1" stopColor="#1B1F6B" />
          </LinearGradient>
        </Defs>
        <Rect width="350" height="168" fill="url(#sky)" />
        <Rect width="350" height="168" fill="url(#sun)" />
        <Circle cx="78" cy="128" r="30" fill="#8FEBF2" opacity={0.25} />
        <Circle cx="78" cy="128" r="20" fill="#E8FDFF" opacity={0.95} />
        <Path d="M0 132 L40 112 L70 122 L110 96 L150 120 L190 104 L230 126 L350 112 V168 H0Z" fill="url(#m1)" opacity={0.85} />
        <Path d="M0 150 L50 130 L95 142 L140 124 L178 140 L225 128 L270 146 L350 134 V168 H0Z" fill="url(#m2)" />
        <G fill="#1B1F6B">
          <Rect x="108" y="74" width="4" height="26" />
          <Path d="M106 76 L110 58 L114 76Z" />
          <Rect x="104" y="96" width="12" height="6" />
        </G>
        <G fill="#FFFFFF">
          <Circle cx="210" cy="24" r="1" />
          <Circle cx="250" cy="44" r="1.2" />
          <Circle cx="300" cy="20" r="1" />
          <Circle cx="170" cy="50" r="0.8" />
          <Circle cx="320" cy="64" r="0.9" />
        </G>
      </Svg>
    </View>
  );
}
