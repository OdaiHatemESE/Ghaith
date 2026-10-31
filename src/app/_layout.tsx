import { ReadexPro_400Regular, ReadexPro_500Medium, ReadexPro_600SemiBold, ReadexPro_700Bold } from '@expo-google-fonts/readex-pro';
import { ReemKufi_700Bold } from '@expo-google-fonts/reem-kufi';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, I18nManager, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Aurora } from '../components/Aurora';
import { AutoUpdate } from '../components/AutoUpdate';
import { Wordmark } from '../components/Wordmark';
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
        <Aurora />
        <Wordmark size={48} />
        <ActivityIndicator color={C.accent} />
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
          <Stack.Screen name="history" />
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
    Readex400: ReadexPro_400Regular,
    Readex500: ReadexPro_500Medium,
    Readex600: ReadexPro_600SemiBold,
    Readex700: ReadexPro_700Bold,
    ReemKufi700: ReemKufi_700Bold,
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
