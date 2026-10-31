import React, { useEffect, useId, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

const native = Platform.OS !== 'web';

/** A soft coloured glow: a circle whose radial gradient fades to nothing at the edge */
function Glow({ size, color, opacity = 0.9, cx = 50, cy = 50, r = 50 }: { size: number; color: string; opacity?: number; cx?: number; cy?: number; r?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`g${id}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r} fill={`url(#g${id})`} />
    </Svg>
  );
}

function Core({ size }: { size: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`c${id}`} cx="38%" cy="32%" r="75%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.2" stopColor="#FFD9CC" />
          <Stop offset="0.55" stopColor="#C4A8FF" />
          <Stop offset="0.82" stopColor="#7A6CFF" />
          <Stop offset="1" stopColor="#5646E0" />
        </RadialGradient>
        <RadialGradient id={`s${id}`} cx="70%" cy="78%" r="45%">
          <Stop offset="0" stopColor="#8FD6FF" stopOpacity={0.7} />
          <Stop offset="1" stopColor="#8FD6FF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={50} fill={`url(#c${id})`} />
      <Circle cx={50} cy={50} r={50} fill={`url(#s${id})`} />
    </Svg>
  );
}

/** A thin bright arc that sweeps round the orb while غيث is thinking or listening */
function Ring({ size }: { size: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const r = 47;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF9F8A" stopOpacity={1} />
          <Stop offset="0.5" stopColor="#8B7BFF" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#6C5CE7" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={r} stroke={`url(#r${id})`} strokeWidth={1.6} strokeLinecap="round" fill="none" strokeDasharray={`${c * 0.32} ${c}`} />
    </Svg>
  );
}

function useLoop(duration: number, run = true) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!run) return;
    v.setValue(0);
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: native }));
    a.start();
    return () => a.stop();
  }, [v, duration, run]);
  return v;
}

/**
 * غيث's presence: a living orb. It breathes when idle, swells with your voice while listening, swirls while
 * thinking and pulses while it speaks. `level` is 0..1 (microphone or speech loudness).
 */
export function Orb({ state, level, size = 230 }: { state: OrbState; level: number; size?: number }) {
  const speed = state === 'thinking' ? 0.35 : state === 'listening' || state === 'speaking' ? 0.6 : 1;
  const spinA = useLoop(9000 * speed);
  const spinB = useLoop(13000 * speed);
  const spinC = useLoop(7000 * speed);
  const breathe = useLoop(state === 'thinking' ? 1100 : 4200);
  const [amp] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(amp, { toValue: level, speed: 40, bounciness: 2, useNativeDriver: native }).start();
  }, [level, amp]);

  const rot = (v: Animated.Value, dir = 1) => v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 * dir}deg`] });
  const wave = breathe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
  const pulse = state === 'thinking' ? 0.07 : state === 'idle' ? 0.035 : 0.02;
  const coreScale = Animated.add(Animated.add(0.94, Animated.multiply(wave, pulse)), Animated.multiply(amp, 0.16));
  const blobScale = Animated.add(Animated.add(1, Animated.multiply(wave, pulse * 1.6)), Animated.multiply(amp, 0.42));
  const haloOpacity = Animated.add(state === 'idle' ? 0.55 : 0.8, Animated.multiply(amp, 0.2));

  const core = size * 0.52;
  const blob = size * 0.82;
  const off = size * 0.1;
  const ringSpin = useLoop(state === 'thinking' ? 900 : 2600, state === 'thinking' || state === 'listening');
  const ripple = useLoop(1600, state === 'listening');
  const rippleScale = ripple.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1.05] });
  const rippleOpacity = ripple.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.55, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', opacity: haloOpacity, transform: [{ scale: blobScale }] }}>
        <Glow size={size} color="#A996FF" opacity={0.5} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', transform: [{ rotate: rot(spinA) }, { translateX: off }, { scale: blobScale }] }}>
        <Glow size={blob} color="#8B7BFF" opacity={0.7} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', transform: [{ rotate: rot(spinB, -1) }, { translateY: off }, { scale: blobScale }] }}>
        <Glow size={blob * 0.92} color="#FFB8A8" opacity={0.75} />
      </Animated.View>
      <Animated.View style={{ position: 'absolute', transform: [{ rotate: rot(spinC) }, { translateX: -off * 0.8 }, { translateY: -off * 0.5 }, { scale: blobScale }] }}>
        <Glow size={blob * 0.75} color="#9ED8FF" opacity={0.65} />
      </Animated.View>
      {state === 'listening' && (
        <Animated.View style={{ position: 'absolute', width: size * 0.9, height: size * 0.9, borderRadius: size, borderWidth: 1.5, borderColor: '#8B7BFF', opacity: rippleOpacity, transform: [{ scale: rippleScale }] }} />
      )}
      <Animated.View style={{ position: 'absolute', transform: [{ scale: coreScale }, { rotate: rot(spinB) }] }}>
        <Core size={core} />
      </Animated.View>
      {(state === 'thinking' || state === 'listening') && (
        <Animated.View style={{ position: 'absolute', opacity: state === 'thinking' ? 1 : 0.7, transform: [{ rotate: rot(ringSpin) }] }}>
          <Ring size={core * 1.28} />
        </Animated.View>
      )}
    </View>
  );
}
