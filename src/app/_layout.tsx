import { Cairo_400Regular, Cairo_500Medium, Cairo_600SemiBold, Cairo_700Bold, Cairo_800ExtraBold } from '@expo-google-fonts/cairo';
import { Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, I18nManager, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AutoUpdate } from '../components/AutoUpdate';
import { Mark } from '../components/Logo';
import { clearReminders, notificationPermission, onReminderTap, ReminderTap, syncReminders } from '../lib/reminders';
import { StoreProvider, useStore } from '../lib/store';
import { addDays, atTime, startOfDay } from '../lib/tasks';
import { C } from '../theme';

// Layout is mirrored by hand (row-reverse + right alignment); stop the OS from flipping it again.
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

// The page around the app on wide screens
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.body.style.backgroundColor = C.bg;
  document.documentElement.lang = 'ar';
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_left' }}>
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
    Cairo400: Cairo_400Regular,
    Cairo500: Cairo_500Medium,
    Cairo600: Cairo_600SemiBold,
    Cairo700: Cairo_700Bold,
    Cairo800: Cairo_800ExtraBold,
    Manrope700: Manrope_700Bold,
    Manrope800: Manrope_800ExtraBold,
    ...MaterialCommunityIcons.font,
  });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: C.bg } : { flex: 1, backgroundColor: C.bg }}>
          <Gate />
          <AutoUpdate />
        </View>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
