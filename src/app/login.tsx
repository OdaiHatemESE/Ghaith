import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mark } from '../components/Logo';
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
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center' }}>
          <Mark size={96} />
          <T w="bold" size={34} color={C.indigo} align="center" style={{ marginTop: 8 }}>غيث</T>
          <T w="medium" size={10} color={C.sub} align="center" style={{ letterSpacing: 2.5 }}>AI TASK & REMINDER ASSISTANT</T>
          <T size={TS.body} color={C.sub} align="center" style={{ marginTop: 12 }}>
            احكيله اللي عليك مرة وحدة، وهو بيرتّبه وبيذكّرك فيه.
          </T>
        </View>

        <View style={{ marginTop: 32 }}>
          <T size={TS.small} color={C.faint}>ادخل بنفس حساب قديش</T>
          <Field label="اسم المستخدم" value={username} onChangeText={setUsername} ltr autoComplete="username" returnKeyType="next" />
          <Field label="كلمة المرور" value={password} onChangeText={setPassword} secure ltr autoComplete="password" onSubmitEditing={submit} returnKeyType="go" />
          <ErrorText text={err} />
          <View style={{ marginTop: 22 }}>
            <PrimaryButton label="دخول" icon="arrow-left" onPress={submit} busy={busy} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
