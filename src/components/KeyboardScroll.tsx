import React, { useCallback, useEffect, useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, ScrollViewProps, TextInput } from 'react-native';

type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;

/**
 * Keeps the field being typed in visible above the keyboard. Android draws edge to edge, so the keyboard no longer
 * resizes the window and a ScrollView does not scroll to the focused input by itself; this does both platforms.
 * Spread the returned props onto the ScrollView that holds the inputs.
 */
export function useKeyboardReveal(active = true, outerRef?: React.RefObject<ScrollView | null>) {
  const ownRef = useRef<ScrollView>(null);
  const ref = outerRef ?? ownRef;
  const offset = useRef(0);
  const keyboardUp = useRef(false);

  const reveal = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput() as unknown as Measurable;
    const list = ref.current as unknown as Measurable;
    if (!input?.measureInWindow || !list?.measureInWindow) return;
    list.measureInWindow((_lx, top, _lw, height) => {
      input.measureInWindow!((_x, y, _w, h) => {
        const bottom = top + height;
        if (y + h > bottom - 12) ref.current?.scrollTo({ y: offset.current + (y + h - bottom) + 24, animated: true });
        else if (y < top + 8) ref.current?.scrollTo({ y: Math.max(0, offset.current - (top - y) - 24), animated: true });
      });
    });
  }, [ref]);

  useEffect(() => {
    if (!active) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      keyboardUp.current = true;
      // After the screen has made room for the keyboard
      setTimeout(reveal, Platform.OS === 'ios' ? 320 : 160);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardUp.current = false;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [active, reveal]);

  return {
    ref,
    scrollEventThrottle: 32,
    keyboardShouldPersistTaps: 'handled' as const,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.y;
    },
    // Tapping another field while the keyboard is already open
    onTouchEnd: () => {
      if (keyboardUp.current) setTimeout(reveal, 160);
    },
  };
}

/** A screen's ScrollView with inputs: makes room for the keyboard and keeps the focused field in view */
export function KeyboardScroll({ scrollRef, ...props }: ScrollViewProps & { scrollRef?: React.RefObject<ScrollView | null> }) {
  const reveal = useKeyboardReveal(true, scrollRef);
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView {...props} {...reveal} />
    </KeyboardAvoidingView>
  );
}
