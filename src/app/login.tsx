import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '../components/Logo';
import { useStore } from '../lib/store';
import { C, TS } from '../theme';
import { ErrorText, Field, PrimaryButton, T } from '../ui';

export default function Login() {
  const insets = useSafeAreaInsets();
  const { signIn } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!username.trim() || !password) return setErr('اكتب اسم المستخدم وكلمة المرور');
    setBusy(true);
    setErr('');
    const e = await signIn(username, password);
    setBusy(false);
    if (e) setErr(e);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.night }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', paddingTop: insets.top + 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', paddingHorizontal: 28 }}>
          <Logo size={96} />
          <T w="bold" size={40} color="#fff" align="center" style={{ marginTop: 14, lineHeight: 56 }}>غيث</T>
          <T size={TS.body} color={C.mist} align="center" style={{ marginTop: 4 }}>
            احكيله اللي عليك، وهو بيرتّب وبيذكّرك وبيتابع معك.
          </T>
        </View>

        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, paddingBottom: insets.bottom + 24, marginTop: 40 }}>
          <T w="bold" size={TS.h2}>تسجيل الدخول</T>
          <T size={TS.small} color={C.sub} style={{ marginTop: 2 }}>بنفس حساب قديش</T>
          <Field label="اسم المستخدم" value={username} onChangeText={setUsername} ltr autoComplete="username" returnKeyType="next" />
          <Field label="كلمة المرور" value={password} onChangeText={setPassword} secure ltr autoComplete="password" onSubmitEditing={submit} returnKeyType="go" />
          <ErrorText text={err} />
          <View style={{ marginTop: 20 }}>
            <PrimaryButton label="دخول" onPress={submit} busy={busy} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
