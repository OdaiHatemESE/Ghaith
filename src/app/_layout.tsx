import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, I18nManager, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AutoUpdate } from '../components/AutoUpdate';
import { Mark } from '../components/Logo';
import { clearReminders, notificationPermission, onReminderTap, ReminderTap, syncReminders } from '../lib/reminders';
import { StoreProvider, useStore } from '../lib/store';
import { D, loadLang, useLang } from '../lib/i18n';
import { addDays, atTime, startOfDay } from '../lib/tasks';
import { C } from '../theme';

// Layout direction is handled by hand (see lib/i18n.ts); stop the OS from flipping it again.
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

// The page around the app on wide screens
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.body.style.backgroundColor = C.bg;
}

/** Keeps the phone's scheduled reminders in step with the task list, and handles taps on them */
function Reminders() {
  const { status, tasks, settings, loaded, complete, save } = useStore();

  useEffect(() => {
    if (status === 'out') {
      clearReminders();
      return;
    }
    if (status !== 'in' || !loaded) return;
    const t = setTimeout(() => syncReminders(tasks, settings), 600);
    return () => clearTimeout(t);
  }, [status, tasks, settings, loaded]);

  useEffect(() => {
    if (status === 'in') notificationPermission(true);
  }, [status]);

  // A tap can arrive before the tasks have loaded (it opened the app): keep it until they have
  const pending = useRef<ReminderTap | null>(null);
  const latest = useRef({ tasks, complete, save });
  function run({ taskId, action }: ReminderTap) {
    const { tasks: list, complete: done, save: put } = latest.current;
    const t = list.find((x) => x.id === taskId);
    if (!t) return;
    if (action === 'done') return void done(t.id);
    if (action === 'hour' || action === 'tomorrow') {
      const at = action === 'hour' ? new Date(new Date().getTime() + 3600000) : atTime(addDays(startOfDay(new Date()), 1), 9);
      return void put(t.id, { remind_at: at.toISOString(), due_at: t.due_at && new Date(t.due_at) < at ? at.toISOString() : t.due_at });
    }
    router.push({ pathname: '/tasks', params: { open: t.id } });
  }

  useEffect(() => {
    latest.current = { tasks, complete, save };
    const p = pending.current;
    if (p && tasks.some((t) => t.id === p.taskId)) {
      pending.current = null;
      run(p);
    }
  });
  useEffect(() => onReminderTap((tap) => (latest.current.tasks.some((t) => t.id === tap.taskId) ? run(tap) : (pending.current = tap))), []);

  return null;
}

function Gate() {
  const { status } = useStore();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Mark size={96} />
        <ActivityIndicator color={C.glow} />
      </View>
    );
  }
  const signedIn = status === 'in';
  return (
    <>
      {signedIn && <Reminders />}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: D.rtl ? 'slide_from_left' : 'slide_from_right' }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" />
          <Stack.Screen name="tasks" />
          <Stack.Screen name="settings" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Plex400: IBMPlexSansArabic_400Regular,
    Plex500: IBMPlexSansArabic_500Medium,
    Plex600: IBMPlexSansArabic_600SemiBold,
    Plex700: IBMPlexSansArabic_700Bold,
    ...MaterialCommunityIcons.font,
  });
  const [langReady, setLangReady] = useState(false);
  useEffect(() => {
    loadLang().then(() => setLangReady(true));
  }, []);
  // A new language remounts the screens so every layout and label picks it up
  const lang = useLang();
  if (!fontsLoaded || !langReady) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: C.bg } : { flex: 1, backgroundColor: C.bg }}>
          <React.Fragment key={lang}>
            <Gate />
            <AutoUpdate />
          </React.Fragment>
        </View>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
