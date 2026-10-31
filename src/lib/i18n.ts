// Language and direction. Arabic (formal, right-to-left) is the default; English flips the layout to left-to-right.
// The layout is mirrored by hand (I18nManager stays LTR), so screens read their direction from `D` while rendering;
// switching language remounts the whole app so everything picks up the new values.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type Lang = 'ar' | 'en';
const KEY = 'ghaith.lang';

let lang: Lang = 'ar';
const listeners = new Set<() => void>();

type Dir = {
  rtl: boolean;
  /** flexDirection for a reading-order row */
  row: 'row' | 'row-reverse';
  /** text alignment at the start / end of the reading direction */
  align: 'right' | 'left';
  alignEnd: 'right' | 'left';
  writing: 'rtl' | 'ltr';
  /** the physical side where reading starts / ends (for absolute positions and margins) */
  start: 'right' | 'left';
  end: 'right' | 'left';
  /** chevron that points forward / back */
  fwd: 'chevron-left' | 'chevron-right';
  back: 'arrow-right' | 'arrow-left';
};

export const D: Dir = {} as Dir;

function apply(l: Lang) {
  lang = l;
  const rtl = l === 'ar';
  Object.assign(D, {
    rtl,
    row: rtl ? 'row-reverse' : 'row',
    align: rtl ? 'right' : 'left',
    alignEnd: rtl ? 'left' : 'right',
    writing: rtl ? 'rtl' : 'ltr',
    start: rtl ? 'right' : 'left',
    end: rtl ? 'left' : 'right',
    fwd: rtl ? 'chevron-left' : 'chevron-right',
    back: rtl ? 'arrow-right' : 'arrow-left',
  } satisfies Dir);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    // Only the language: the page itself stays left-to-right because the layout is mirrored by hand
    document.documentElement.lang = l;
  }
}
apply('ar');

export const getLang = () => lang;

/** The Arabic or English text, by the current language */
export const tx = (ar: string, en: string) => (lang === 'en' ? en : ar);

/** Reads the saved language before the first screen renders */
export async function loadLang(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'ar' || v === 'en') apply(v);
  } catch {
    // keep Arabic
  }
}

export function setLang(l: Lang) {
  if (l === lang) return;
  apply(l);
  AsyncStorage.setItem(KEY, l).catch(() => {});
  listeners.forEach((f) => f());
}

/** The current language; the component re-renders when it changes */
export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => lang,
    () => lang,
  );
}
