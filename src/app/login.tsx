import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Orb } from '../components/Orb';
import { Wordmark } from '../components/Wordmark';
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
          <Orb state="idle" level={0} size={170} />
          <Wordmark size={44} />
          <T size={TS.body} color={C.sub} align="center" style={{ marginTop: 6 }}>
            احكيله اللي عليك، وهو بيرتّب وبيذكّرك وبيتابع معك.
          </T>
        </View>

        <View style={{ marginTop: 36 }}>
          <T size={TS.small} color={C.faint}>ادخل بنفس حساب قديش</T>
          <Field label="اسم المستخدم" value={username} onChangeText={setUsername} ltr autoComplete="username" returnKeyType="next" />
          <Field label="كلمة المرور" value={password} onChangeText={setPassword} secure ltr autoComplete="password" onSubmitEditing={submit} returnKeyType="go" />
          <ErrorText text={err} />
          <View style={{ marginTop: 22 }}>
            <PrimaryButton label="دخول" onPress={submit} busy={busy} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
