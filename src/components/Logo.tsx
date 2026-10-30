import React, { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * The غيث mark: a raindrop (غيث is the rain that comes after hardship) with the dot of the letter غ above it,
 * on a night-blue tile. `bare` drops the tile, for use on dark backgrounds.
 */
export function Logo({ size = 64, bare = false }: { size?: number; bare?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="غيث">
      <Defs>
        <LinearGradient id={`tile${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1C3561" />
          <Stop offset="1" stopColor="#0A1424" />
        </LinearGradient>
        <LinearGradient id={`drop${id}`} x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#A9DBFF" />
          <Stop offset="1" stopColor="#3D8BFF" />
        </LinearGradient>
      </Defs>
      {!bare && <Rect x="0" y="0" width="100" height="100" rx="26" fill={`url(#tile${id})`} />}
      <Path d="M50 30 C50 30 72 54 72 67 C72 79.2 62.2 88 50 88 C37.8 88 28 79.2 28 67 C28 54 50 30 50 30 Z" fill={`url(#drop${id})`} />
      <Path d="M40 70 C40 76 44 80 49 81" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="4" strokeLinecap="round" fill="none" />
      <Circle cx="50" cy="15" r="6.5" fill="#A9DBFF" />
    </Svg>
  );
}
