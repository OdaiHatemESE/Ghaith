// Ghaith, the character: a hovering cloud drone (white shell, a dark screen with LED eyes, a ring of light, glowing
// thrusters) that is never quite still. It hovers, blinks at random, glances around when idle, and reacts:
//   idle    hovering, blinking, the odd glance
//   listen  eyes wide and bright, rings that grow with the voice, the mouth bars follow the microphone level
//   think   eyes look up (violet), a scanning ring turns, loading dots
//   talk    the mouth bars move as it speaks
//   happy   happy eyes, a hop and sparks (a task done, something saved)
//   alert   amber eyes and a pulsing badge (the Radar found something urgent)
//   sleep   dim eyes and slow hovering in quiet hours
// Tapping it pokes it: a wiggle and a happy look, then onPress.
// Everything is drawn with react-native-svg and moved with Animated, so it ships as an over-the-air update.
import React, { useEffect, useId, useMemo, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

export type BotState = 'idle' | 'listen' | 'think' | 'talk' | 'happy' | 'alert' | 'sleep';

const native = Platform.OS !== 'web';
const LED = '#5CF6FF';
const LED_HI = '#A6FBFF';
const VIOLET = '#B9A6FF';
const AMBER = '#FFB020';
const BODY = 'M48 152 C28 152 14 138 14 120 C14 102 28 90 46 90 C50 66 70 48 96 48 C116 48 132 59 140 75 C144 74 148 73 152 73 C172 73 188 89 188 110 L188 118 C188 137 174 152 156 152 Z';
const STAR = (x: number, y: number, r: number) => {
  const k = r * 0.27;
  return `M${x} ${y - r} C${x + k * 0.7} ${y - k} ${x + k} ${y - k * 0.7} ${x + r} ${y} C${x + k} ${y + k * 0.7} ${x + k * 0.7} ${y + k} ${x} ${y + r} C${x - k * 0.7} ${y + k} ${x - k} ${y + k * 0.7} ${x - r} ${y} C${x - k} ${y - k * 0.7} ${x - k * 0.7} ${y - k} ${x} ${y - r} Z`;
};

/** A value that loops 0 → 1 → 0 forever */
function useLoop(ms: number, on = true, ease = Easing.inOut(Easing.sin)) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!on) return v.setValue(0);
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: ms / 2, easing: ease, useNativeDriver: native }),
        Animated.timing(v, { toValue: 0, duration: ms / 2, easing: ease, useNativeDriver: native }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [ms, on, v, ease]);
  return v;
}

/** A value that runs 0 → 1 and restarts, after `delay` */
function useCycle(ms: number, on: boolean, delay = 0) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!on) return v.setValue(0);
    const a = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: native }), Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: native })]));
    a.start();
    return () => a.stop();
  }, [ms, on, delay, v]);
  return v;
}

export function GhaithBot({ state = 'idle', size = 120, level = 0, onPress, label }: { state?: BotState; size?: number; level?: number; onPress?: () => void; label?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const k = size / 200;
  const [poked, setPoked] = useState(false);
  const shown: BotState = poked ? 'happy' : state;

  // Hovering, and the shadow that breathes with it
  const hover = useLoop(shown === 'sleep' ? 6000 : shown === 'happy' ? 700 : 2800);
  const y = hover.interpolate({ inputRange: [0, 1], outputRange: [0, (shown === 'happy' ? -12 : -6) * k] });
  const shadow = hover.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] });
  const thrust = useLoop(900);
  const thrustOpacity = thrust.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const star = useLoop(2600);
  const starScale = star.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.12] });

  // Blinks at random moments (sometimes twice), and glances around when idle
  const blink = useState(() => new Animated.Value(1))[0];
  const look = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (shown === 'sleep' || shown === 'happy') return;
    let t: ReturnType<typeof setTimeout>;
    const once = () => Animated.sequence([Animated.timing(blink, { toValue: 0.1, duration: 70, useNativeDriver: native }), Animated.timing(blink, { toValue: 1, duration: 110, useNativeDriver: native })]);
    const next = () => {
      t = setTimeout(() => {
        (Math.random() < 0.18 ? Animated.sequence([once(), once()]) : once()).start(next);
      }, 2200 + Math.random() * 4200);
    };
    next();
    return () => clearTimeout(t);
  }, [shown, blink]);
  useEffect(() => {
    if (shown !== 'idle') {
      Animated.timing(look, { toValue: 0, duration: 200, useNativeDriver: native }).start();
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        const to = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3);
        Animated.sequence([
          Animated.timing(look, { toValue: to, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.delay(700 + Math.random() * 900),
          Animated.timing(look, { toValue: 0, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        ]).start(next);
      }, 3500 + Math.random() * 5000);
    };
    next();
    return () => clearTimeout(t);
  }, [shown, look]);

  // Listening: rings; thinking: a turning scan ring; done: sparks; alert: a pulse
  const r1 = useCycle(2100, shown === 'listen', 0);
  const r2 = useCycle(2100, shown === 'listen', 700);
  const r3 = useCycle(2100, shown === 'listen', 1400);
  const spin = useCycle(3200, shown === 'think');
  const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pulse = useLoop(1100, shown === 'alert');
  const sp1 = useCycle(1300, shown === 'happy', 0);
  const sp2 = useCycle(1300, shown === 'happy', 420);
  const sp3 = useCycle(1300, shown === 'happy', 840);
  const z = useCycle(2800, shown === 'sleep');

  // The mouth: five bars. Listening follows the microphone; talking moves on its own.
  const [bars] = useState(() => [0, 1, 2, 3, 4].map(() => new Animated.Value(0.25)));
  useEffect(() => {
    if (shown !== 'talk') return;
    let alive = true;
    const step = (i: number) => {
      if (!alive) return;
      Animated.timing(bars[i], { toValue: 0.25 + Math.random() * 0.75, duration: 110 + Math.random() * 150, useNativeDriver: native }).start(() => step(i));
    };
    bars.forEach((_, i) => step(i));
    return () => {
      alive = false;
    };
  }, [shown, bars]);
  useEffect(() => {
    if (shown !== 'listen') return;
    const shape = [0.55, 0.85, 1, 0.8, 0.6];
    bars.forEach((b, i) => Animated.timing(b, { toValue: Math.min(1, 0.2 + level * 1.4 * shape[i]), duration: 90, useNativeDriver: native }).start());
  }, [shown, level, bars]);
  const dots = useCycle(1100, shown === 'think');

  const poke = () => {
    if (!poked) {
      setPoked(true);
      setTimeout(() => setPoked(false), 1300);
    }
    onPress?.();
  };

  // ---------- layout (all in the drawing's 200 × 200 units, times k) ----------
  const eyeY = 104;
  const eyes = [85, 119];
  const ringScale = 1 + Math.min(1, level) * 0.18;
  const eyeColor = shown === 'alert' ? AMBER : shown === 'think' ? VIOLET : shown === 'listen' ? LED_HI : LED;
  const eyeW = (shown === 'listen' ? 15 : 13) * k;
  const eyeH = (shown === 'listen' ? 22 : 18) * k;
  const abs = (x: number, yy: number, w: number, h: number) => ({ position: 'absolute' as const, left: (x - w / 2) * k, top: (yy - h / 2) * k, width: w * k, height: h * k });

  const sparks = useMemo(
    () => [
      { v: sp1, x: 30, y: 46, s: 13, c: '#14C7C9' },
      { v: sp2, x: 174, y: 52, s: 10, c: '#7C5CFF' },
      { v: sp3, x: 178, y: 158, s: 10, c: LED },
    ],
    [sp1, sp2, sp3],
  );

  const drawing = (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {/* rings while listening */}
      {shown === 'listen' &&
        [r1, r2, r3].map((r, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: 10 * k,
              top: 14 * k,
              width: 180 * k,
              height: 180 * k,
              borderRadius: 90 * k,
              borderWidth: Math.max(1.5, 2.5 * k),
              borderColor: '#14C7C9',
              opacity: r.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.78 * ringScale, 1.22 * ringScale] }) }],
            }}
          />
        ))}
      {/* scan ring while thinking */}
      {shown === 'think' && (
        <Animated.View style={{ position: 'absolute', left: 4 * k, top: 8 * k, width: 192 * k, height: 192 * k, transform: [{ rotate: rot }] }}>
          <Svg width={192 * k} height={192 * k} viewBox="0 0 192 192">
            <Circle cx={96} cy={96} r={92} fill="none" stroke="#7C5CFF" strokeWidth={3} strokeLinecap="round" strokeDasharray="46 26" opacity={0.7} />
          </Svg>
        </Animated.View>
      )}
      {/* the shadow on the ground */}
      <Animated.View style={{ position: 'absolute', left: 58 * k, top: 184 * k, width: 84 * k, height: 12 * k, transform: [{ scaleX: shadow }], opacity: shadow.interpolate({ inputRange: [0.8, 1], outputRange: [0.1, 0.2] }) }}>
        <Svg width={84 * k} height={12 * k} viewBox="0 0 84 12">
          <Ellipse cx={42} cy={6} rx={42} ry={6} fill="#1B1F6B" />
        </Svg>
      </Animated.View>

      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, transform: [{ translateY: y }] }}>
        {/* body */}
        <Svg width={size} height={size} viewBox="0 0 200 200" style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id={`sh${id}`} x1="0.2" y1="0" x2="0.8" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.6" stopColor="#E3E7F3" />
              <Stop offset="1" stopColor="#B9C0D9" />
            </LinearGradient>
            <LinearGradient id={`vi${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#070A24" />
              <Stop offset="1" stopColor="#151A55" />
            </LinearGradient>
          </Defs>
          <Path d="M4 128 A96 20 0 0 1 196 128" fill="none" stroke="#14C7C9" strokeWidth={3} opacity={0.45} />
          <Path d={BODY} fill={`url(#sh${id})`} stroke="#C3CAE0" strokeWidth={1.5} />
          <Path d="M46 90 C53 100 55 112 53 124" fill="none" stroke="#AEB6D3" strokeWidth={1.6} opacity={0.8} />
          <Path d="M140 75 C135 87 135 100 140 112" fill="none" stroke="#AEB6D3" strokeWidth={1.6} opacity={0.8} />
          <Path d="M18 136 C60 143 142 143 186 136" fill="none" stroke="#AEB6D3" strokeWidth={1.6} opacity={0.8} />
          <Ellipse cx={82} cy={62} rx={22} ry={8} fill="#FFFFFF" opacity={0.9} transform="rotate(-18 82 62)" />
          <Ellipse cx={160} cy={84} rx={9} ry={4} fill="#FFFFFF" opacity={0.8} transform="rotate(25 160 84)" />
          <Rect x={54} y={84} width={96} height={50} rx={25} fill={`url(#vi${id})`} stroke="#14C7C9" strokeOpacity={0.4} strokeWidth={1.5} />
        </Svg>

        {/* thrusters */}
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, opacity: thrustOpacity }}>
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <Ellipse cx={70} cy={156} rx={15} ry={5} fill={LED} opacity={0.35} />
            <Ellipse cx={134} cy={156} rx={15} ry={5} fill={LED} opacity={0.35} />
            <Ellipse cx={70} cy={156} rx={10} ry={2.6} fill={LED_HI} />
            <Ellipse cx={134} cy={156} rx={10} ry={2.6} fill={LED_HI} />
          </Svg>
        </Animated.View>

        {/* the logo's star, a sensor on top */}
        <Animated.View style={{ ...abs(96, 38, 22, 22), transform: [{ scale: starScale }], opacity: star.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }}>
          <Svg width={22 * k} height={22 * k} viewBox="0 0 22 22">
            <Circle cx={11} cy={11} r={10} fill="#14C7C9" opacity={0.18} />
            <Path d={STAR(11, 11, 7)} fill="#14C7C9" />
          </Svg>
        </Animated.View>

        {/* eyes */}
        <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, transform: [{ translateX: Animated.multiply(look, k) }] }}>
          {eyes.map((ex, i) => {
            const dx = shown === 'think' ? 3 : 0;
            const dy = shown === 'think' ? -4 : 0;
            if (shown === 'happy')
              return (
                <View key={i} style={abs(ex, eyeY, 20, 16)}>
                  <Svg width={20 * k} height={16 * k} viewBox="0 0 20 16">
                    <Path d="M3 12 Q10 0 17 12" fill="none" stroke={LED} strokeWidth={5} strokeLinecap="round" opacity={0.35} />
                    <Path d="M3 12 Q10 0 17 12" fill="none" stroke={LED_HI} strokeWidth={3.2} strokeLinecap="round" />
                  </Svg>
                </View>
              );
            if (shown === 'sleep') return <View key={i} style={{ ...abs(ex, eyeY + 2, 16, 3.5), borderRadius: 2 * k, backgroundColor: LED, opacity: 0.4 }} />;
            if (shown === 'alert')
              return (
                <View key={i} style={abs(ex, eyeY, 18, 22)}>
                  <Svg width={18 * k} height={22 * k} viewBox="0 0 18 22">
                    <Path d={i === 0 ? 'M1 7 L17 1 L17 19 Q17 21 15 21 L3 21 Q1 21 1 19 Z' : 'M17 7 L1 1 L1 19 Q1 21 3 21 L15 21 Q17 21 17 19 Z'} fill={AMBER} />
                  </Svg>
                </View>
              );
            const w = shown === 'think' ? 12 * k : eyeW;
            const h = shown === 'think' ? 12 * k : eyeH;
            return (
              <Animated.View key={i} style={{ position: 'absolute', left: (ex + dx) * k - w / 2, top: (eyeY + dy) * k - h / 2, width: w, height: h, transform: [{ scaleY: blink }] }}>
                <View style={{ position: 'absolute', left: -3 * k, top: -3 * k, right: -3 * k, bottom: -3 * k, borderRadius: 10 * k, backgroundColor: eyeColor, opacity: 0.22 }} />
                <View style={{ flex: 1, borderRadius: 8 * k, backgroundColor: eyeColor }} />
              </Animated.View>
            );
          })}

          {/* mouth */}
          {(shown === 'talk' || shown === 'listen') &&
            bars.map((b, i) => (
              <Animated.View key={i} style={{ position: 'absolute', left: (88 + i * 6.5) * k, top: 116 * k, width: 3.6 * k, height: 12 * k, borderRadius: 2 * k, backgroundColor: LED, transform: [{ scaleY: b }] }} />
            ))}
          {shown === 'think' &&
            [0, 1, 2].map((i) => (
              <Animated.View
                key={i}
                style={{
                  ...abs(92 + i * 10, 122, 5, 5),
                  borderRadius: 3 * k,
                  backgroundColor: VIOLET,
                  opacity: dots.interpolate({ inputRange: [0, i * 0.25, i * 0.25 + 0.25, 1], outputRange: [0.25, 0.25, 1, 0.25], extrapolate: 'clamp' }),
                }}
              />
            ))}
          {shown === 'idle' && <View style={{ ...abs(102, 123, 18, 3), borderRadius: 2 * k, backgroundColor: LED, opacity: 0.45 }} />}
          {shown === 'alert' && <View style={{ ...abs(102, 123, 18, 3), borderRadius: 2 * k, backgroundColor: AMBER }} />}
          {shown === 'happy' && (
            <View style={abs(102, 122, 24, 10)}>
              <Svg width={24 * k} height={10 * k} viewBox="0 0 24 10">
                <Path d="M2 2 Q12 12 22 2" fill="none" stroke={LED_HI} strokeWidth={3} strokeLinecap="round" />
              </Svg>
            </View>
          )}
        </Animated.View>

        {/* the ring of light in front */}
        <Svg width={size} height={size} viewBox="0 0 200 200" style={{ position: 'absolute' }}>
          <Path d="M4 128 A96 20 0 0 0 196 128" fill="none" stroke="#14C7C9" strokeWidth={6} opacity={0.18} />
          <Path d="M4 128 A96 20 0 0 0 196 128" fill="none" stroke="#3FF3FF" strokeWidth={2.6} />
        </Svg>
      </Animated.View>

      {/* sparks when something is done */}
      {shown === 'happy' &&
        sparks.map((s, i) => (
          <Animated.View
            key={i}
            style={{
              ...abs(s.x, s.y, s.s * 2, s.s * 2),
              opacity: s.v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0] }),
              transform: [{ scale: s.v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.2] }) }],
            }}
          >
            <Svg width={s.s * 2 * k} height={s.s * 2 * k} viewBox="0 0 20 20">
              <Path d={STAR(10, 10, 9)} fill={s.c} />
            </Svg>
          </Animated.View>
        ))}
      {/* the badge when something needs attention */}
      {shown === 'alert' && (
        <Animated.View style={{ ...abs(170, 40, 32, 32), borderRadius: 16 * k, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] }) }] }}>
          <View style={{ width: 5 * k, height: 13 * k, borderRadius: 3 * k, backgroundColor: '#fff' }} />
          <View style={{ width: 5 * k, height: 5 * k, borderRadius: 3 * k, backgroundColor: '#fff', marginTop: 2.5 * k }} />
        </Animated.View>
      )}
      {/* resting */}
      {shown === 'sleep' &&
        [0, 1].map((i) => (
          <Animated.Text
            key={i}
            style={{
              position: 'absolute',
              left: (158 + i * 14) * k,
              top: (36 - i * 16) * k,
              fontSize: (20 - i * 5) * k,
              fontWeight: '800',
              color: '#7C5CFF',
              opacity: z.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.8, 0] }),
              transform: [{ translateX: z.interpolate({ inputRange: [0, 1], outputRange: [0, 8 * k] }) }, { translateY: z.interpolate({ inputRange: [0, 1], outputRange: [0, -16 * k] }) }],
            }}
          >
            z
          </Animated.Text>
        ))}
    </View>
  );

  return onPress ? (
    <Pressable onPress={poke} accessibilityRole="button" accessibilityLabel={label ?? 'غيث'} hitSlop={6}>
      {drawing}
    </Pressable>
  ) : (
    <View accessibilityLabel={label} accessible={!!label}>
      {drawing}
    </View>
  );
}
