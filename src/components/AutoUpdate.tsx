import * as Updates from 'expo-updates';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, lift, TS } from '../theme';
import { Icon, T } from '../ui';

/**
 * Over-the-air updates: every time the app opens or comes back to the front it checks for a newer version of the
 * screens (published from GitHub on each change), downloads it, and restarts into it by itself after a short notice.
 * No new APK is needed unless native code changes.
 */
export function AutoUpdate() {
  const insets = useSafeAreaInsets();
  const { isUpdatePending } = Updates.useUpdates();
  const [count, setCount] = useState(3);
  const checking = useRef(false);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    const check = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline or the update server is busy: try again next time
      }
      checking.current = false;
    };
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, []);

  // A new version is ready: count down, then restart into it
  useEffect(() => {
    if (!isUpdatePending) return;
    const i = setInterval(() => setCount((c) => c - 1), 1000);
    return () => clearInterval(i);
  }, [isUpdatePending]);
  useEffect(() => {
    if (isUpdatePending && count <= 0) Updates.reloadAsync().catch(() => {});
  }, [isUpdatePending, count]);

  if (!Updates.isEnabled || !isUpdatePending) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, alignItems: 'center' }}>
      <Pressable
        onPress={() => Updates.reloadAsync().catch(() => {})}
        style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: C.surfaceHi, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: C.line, ...lift }}
      >
        <Icon name="auto-fix" size={18} color={C.accent} />
        <T size={TS.small} w="medium">في نسخة جديدة من غيث، بتتحدّث خلال {Math.max(count, 0)}…</T>
      </Pressable>
    </View>
  );
}

/** "Version 1.0.0 · updated 31/10 05:58" for the settings screen */
export function versionLabel(appVersion: string): string {
  if (!Updates.isEnabled) return `النسخة ${appVersion}`;
  const d = Updates.createdAt;
  if (Updates.isEmbeddedLaunch || !d) return `النسخة ${appVersion} · الأصلية`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `النسخة ${appVersion} · تحديث ${d.getDate()}/${d.getMonth() + 1} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
