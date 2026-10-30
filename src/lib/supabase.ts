import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    // Its own key, so signing in or out of غيث never touches a قديش session on the same browser
    storageKey: 'ghaith.auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the session only while the app is in the foreground
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Turns a Supabase / network error into a sentence the user can act on */
export function friendlyError(err: unknown): string {
  const e = err as { message?: string } | null;
  const m = e?.message ?? '';
  if (m === 'Invalid login credentials') return 'اسم المستخدم أو كلمة المرور غير صحيحة';
  if (m === 'User is banned') return 'هذا الحساب موقوف';
  if (m.includes('Failed to fetch') || m.includes('Network')) return 'ما في اتصال بالإنترنت، تأكد من الشبكة وجرّب مرة ثانية';
  return 'صار خطأ، جرّب مرة ثانية';
}
