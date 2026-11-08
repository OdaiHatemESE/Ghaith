// غيث brand identity: Deep Indigo, Electric Teal and a violet glow on a cool off-white canvas.
// Layout and spacing follow قديش: grouped white cards (radius 20) with divided rows, 16px gutters.
export const C = {
  // brand
  indigo: '#1B1F6B',
  indigoHi: '#2F35A8',
  teal: '#14C7C9',
  tealDeep: '#0E8F91',
  glow: '#7C5CFF',
  sky: '#8FEBF2',
  // surfaces
  bg: '#F8FAFF',
  surface: '#FFFFFF',
  surfaceAlt: '#EBECF4',
  line: '#E6E8F2',
  lineHi: '#D4D7EA',
  // text
  text: '#23262F',
  sub: '#6B7280',
  faint: '#A3A8BC',
  // states
  late: '#F04461',
  lateText: '#C42B47', // the late colour as text and small marks on white (4.5:1)
  glowText: '#5B3FD9',
  tealText: '#0B6E70',
  amber: '#F59E0B',
  amberText: '#B76E00',
  ok: '#14C7C9',
  // aliases used across the app
  accent: '#7C5CFF',
  shadow: '#1B1F6B',
};

/** Soft tint of a colour for chips and icon tiles */
export const tint = (hex: string, a = 0.12) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

// Almarai (Arabic and Latin), ≈1.25 scale, 1.5 line height. Almarai comes in 300/400/700/800, so the
// in-between weights map to the nearest one.
export const F = {
  regular: 'Almarai400',
  medium: 'Almarai700',
  semibold: 'Almarai700',
  bold: 'Almarai800',
  num: 'Almarai700',
};

export const TS = {
  display: 28,
  h1: 24,
  h2: 18,
  body: 15,
  small: 13,
  tiny: 11,
};

export const R = { card: 20, big: 24, pill: 999 };

export const GRADIENT = ['#2F35A8', '#7C5CFF'] as const;

/** --shadow-sm */
export const lift = {
  shadowColor: C.shadow,
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
/** --shadow-md */
export const liftMd = {
  shadowColor: C.shadow,
  shadowOpacity: 0.12,
  shadowRadius: 32,
  shadowOffset: { width: 0, height: 12 },
  elevation: 6,
};
