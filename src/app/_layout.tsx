import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, I18nManager, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Logo } from '../components/Logo';
import { clearReminders, notificationPermission, syncReminders } from '../lib/reminders';
import { StoreProvider, useStore } from '../lib/store';
import { C } from '../theme';
import { T } from '../ui';

// Layout is mirrored by hand (row-reverse + right alignment); stop the OS from flipping it again.
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);

/** Keeps the phone's scheduled reminders in step with the task list and settings */
function ReminderSync() {
  const { status, tasks, settings, loaded } = useStore();
  useEffect(() => {
    if (status === 'out') {
      clearReminders();
      return;
    }
    if (status !== 'in' || !loaded) return;
    const t = setTimeout(() => syncReminders(tasks, settings), 600);
    return () => clearTimeout(t);
  }, [status, tasks, settings, loaded]);
  // Ask for permission once, after signing in
  useEffect(() => {
    if (status === 'in') notificationPermission(true);
  }, [status]);
  return null;
}

function Gate() {
  const { status } = useStore();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: C.night, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Logo size={92} />
        <T w="bold" size={32} color="#fff" align="center">غيث</T>
        <ActivityIndicator color={C.rainLight} />
      </View>
    );
  }
  const signedIn = status === 'in';
  return (
    <>
      <ReminderSync />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper }, animation: 'slide_from_left' }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
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
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: C.night }} />;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="light" />
        <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' } : { flex: 1 }}>
          <Gate />
        </View>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
