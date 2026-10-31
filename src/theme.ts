// غيث brand identity: Deep Indigo, Electric Teal and a violet glow on a cool off-white canvas.
// Clean white cards with soft indigo shadows, 16px radius, pill buttons with an indigo→violet gradient.
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
  amber: '#F59E0B',
  amberText: '#B76E00',
  ok: '#14C7C9',
  // aliases used across the app
  accent: '#7C5CFF',
  shadow: '#1B1F6B',
};

/** Soft tint of a colour for chips and icon tiles */
export const tint = (hex: string, a = 0.12) => hex + Math.round(a * 255).toString(16).padStart(2, '0');

export const F = {
  regular: 'Cairo400',
  medium: 'Cairo500',
  semibold: 'Cairo600',
  bold: 'Cairo700',
  heavy: 'Cairo800',
  num: 'Manrope800',
  numBold: 'Manrope700',
};

export const TS = {
  display: 26,
  h1: 22,
  h2: 17,
  body: 15,
  small: 13,
  tiny: 11.5,
};

export const R = { card: 16, big: 24, pill: 999 };

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
