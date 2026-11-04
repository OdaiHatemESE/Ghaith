import { useWindowDimensions } from 'react-native';

/** Screens this wide get the web (desktop) layout: a sidebar and multi-column pages */
export const WIDE = 960;

export function useWide(): boolean {
  return useWindowDimensions().width >= WIDE;
}
