// Chat with غيث: ask about your tasks or tell it what to do, in your own words. It answers and acts right away.
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mark } from '../components/Logo';
import { ScreenHeader } from '../components/ScreenHeader';
import { TaskSheet } from '../components/TaskSheet';
import { ChatAction, ChatMessage, chatSince, loadChat, newChat, sendChat } from '../lib/chat';
import { D, tx } from '../lib/i18n';
import { useStore } from '../lib/store';
import { clock } from '../lib/tasks';
import { useTick } from '../lib/useTick';
import { useDictation } from '../lib/voice';
import { useWide } from '../lib/useWide';
import { C, F, GRADIENT, lift, R, tint, TS } from '../theme';
import { Gradient, Icon, IconButton, IconName, T } from '../ui';

const ACTION: Record<ChatAction['type'], { icon: IconName; color: string; label: () => string }> = {
  added: { icon: 'plus-circle-outline', color: C.indigo, label: () => tx('أُضيفت', 'Added') },
  updated: { icon: 'pencil-outline', color: C.glow, label: () => tx('عُدّلت', 'Edited') },
  done: { icon: 'check-circle-outline', color: C.tealDeep, label: () => tx('أُنجزت', 'Done') },
  deleted: { icon: 'trash-can-outline', color: C.late, label: () => tx('حُذفت', 'Deleted') },
  reopened: { icon: 'restore', color: C.amberText, label: () => tx('أُعيد فتحها', 'Reopened') },
};

const SUGGESTIONS = () => [
  tx('ما مهامي اليوم؟', 'What’s on today?'),
  tx('ممن أنتظر رداً؟', 'Who am I waiting on?'),
  tx('ما المتأخر عندي؟', 'What is overdue?'),
  tx('ماذا أنجزت هذا الأسبوع؟', 'What did I finish this week?'),
];

function Typing() {
  const now = useTick(300);
  const step = Math.floor(now / 300) % 3;
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 6 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i === step ? C.glow : tint(C.glow, 0.3) }} />
      ))}
    </View>
  );
}

function Bubble({ m, onAction }: { m: ChatMessage; onAction: (a: ChatAction) => void }) {
  const mine = m.role === 'user';
  return (
    <View style={{ flexDirection: D.row, alignItems: 'flex-end', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
      {!mine && (
        <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: C.indigo, alignItems: 'center', justifyContent: 'center' }}>
          <Mark size={22} />
        </View>
      )}
      <View style={{ maxWidth: '82%', gap: 6, alignItems: mine ? (D.rtl ? 'flex-start' : 'flex-end') : D.rtl ? 'flex-end' : 'flex-start' }}>
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 18,
            [D.rtl ? (mine ? 'borderBottomLeftRadius' : 'borderBottomRightRadius') : mine ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 6,
            backgroundColor: mine ? C.indigo : C.surface,
            ...(mine ? null : lift),
          }}
        >
          {m.pending ? <Typing /> : <T color={mine ? '#fff' : C.text} style={{ lineHeight: 24 }} selectable>{m.content}</T>}
        </View>
        {!!m.actions.length && (
          <View style={{ flexDirection: D.row, flexWrap: 'wrap', gap: 6 }}>
            {m.actions.map((a) => {
              const look = ACTION[a.type];
              return (
                <Pressable
                  key={a.type + a.id}
                  onPress={() => onAction(a)}
                  disabled={a.type === 'deleted'}
                  style={{ flexDirection: D.row, alignItems: 'center', gap: 5, backgroundColor: tint(look.color, 0.1), borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 320 }}
                >
                  <Icon name={look.icon} size={14} color={look.color} />
                  <T size={TS.tiny} w="medium" color={look.color}>{look.label()}</T>
                  <T size={TS.tiny} color={C.text} numberOfLines={1} style={{ flexShrink: 1 }}>{a.title}</T>
                </Pressable>
              );
            })}
          </View>
        )}
        {!m.pending && <T size={TS.tiny} color={C.faint}>{clock(new Date(m.created_at))}</T>}
      </View>
    </View>
  );
}

export default function Chat() {
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const { tasks, refresh } = useStore();
  const dict = useDictation();
  const [since, setSince] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    let live = true;
    chatSince().then(async (s) => {
      const list = await loadChat(s);
      if (!live) return;
      setSince(s);
      setMessages(list);
    });
    return () => {
      live = false;
    };
  }, []);

  const send = async (raw: string, source: 'voice' | 'text' = 'text') => {
    const t = raw.trim();
    if (!t || busy || !since) return;
    setErr('');
    setText('');
    setBusy(true);
    const at = new Date().toISOString();
    setMessages((l) => [...l, { id: 'u' + at, role: 'user', content: t, actions: [], created_at: at }, { id: 'p', role: 'assistant', content: '', actions: [], created_at: at, pending: true }]);
    try {
      const r = await sendChat(t, source, since);
      setMessages((l) => l.map((m) => (m.id === 'p' ? { ...m, id: 'a' + at, content: r.reply, actions: r.actions, created_at: new Date().toISOString(), pending: false } : m)));
      if (r.actions.length) refresh();
    } catch (e) {
      setMessages((l) => l.filter((m) => m.id !== 'p'));
      setErr((e as Error).message);
      setText(t);
    }
    setBusy(false);
  };

  const mic = async () => {
    if (listening) {
      const said = await dict.finish();
      setListening(false);
      if (said) send(said, 'voice');
      return;
    }
    setListening(true);
    dict.start(); // must run inside the tap on web
  };

  const fresh = async () => {
    const s = await newChat();
    setSince(s);
    setMessages([]);
    setErr('');
  };

  const task = open ? tasks.find((t) => t.id === open) ?? null : null;
  const shown = listening ? dict.text : text;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={tx('محادثة غيث', 'Chat with Ghaith')} right={<IconButton icon="message-plus-outline" label={tx('محادثة جديدة', 'New chat')} onPress={fresh} />} />
      <ScrollView
        ref={scroll}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, width: '100%', maxWidth: wide ? 820 : undefined, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        {!messages.length && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32 }}>
            <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: C.indigo, alignItems: 'center', justifyContent: 'center', shadowColor: C.glow, shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
              <Mark size={56} />
            </View>
            <T w="bold" size={TS.h2} align="center" style={{ marginTop: 18 }}>{tx('اسأل غيث أو اطلب منه أي شيء', 'Ask Ghaith anything, or tell it what to do')}</T>
            <T size={TS.small} color={C.sub} align="center" style={{ marginTop: 4, maxWidth: 420 }}>
              {tx('يجيب عن مهامك، ويضيف ويعدّل وينجز ويحذف مباشرة. مثال: «أجّل تقرير الجودة إلى الخميس».', 'It answers about your tasks and adds, edits, completes or deletes them right away. e.g. “Move the quality report to Thursday”.')}
            </T>
            <View style={{ flexDirection: D.row, flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18, maxWidth: 520 }}>
              {SUGGESTIONS().map((s) => (
                <Pressable key={s} onPress={() => send(s)} style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, backgroundColor: pressed ? C.surfaceAlt : C.surface, borderWidth: 1, borderColor: C.line })}>
                  <T size={TS.small} color={C.indigo}>{s}</T>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} onAction={(a) => setOpen(a.id)} />
        ))}
        {!!err && (
          <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8, backgroundColor: tint(C.late, 0.08), borderRadius: 14, padding: 10 }}>
            <Icon name="alert-circle-outline" size={18} color={C.late} />
            <T size={TS.small} color={C.late} style={{ flex: 1 }}>{err}</T>
          </View>
        )}
        {!!dict.error && listening && <T size={TS.small} color={C.late}>{dict.error}</T>}
      </ScrollView>

      {/* Composer */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12, width: '100%', maxWidth: wide ? 820 : undefined, alignSelf: 'center' }}>
        <View style={{ flexDirection: D.row, alignItems: 'flex-end', gap: 8, backgroundColor: C.surface, borderRadius: 26, borderWidth: 1.5, borderColor: listening ? tint(C.glow, 0.6) : C.line, padding: 6, ...lift }}>
          <Pressable
            onPress={mic}
            disabled={dict.state === 'unsupported' || busy}
            accessibilityLabel={listening ? tx('إيقاف التسجيل', 'Stop recording') : tx('تحدّث', 'Speak')}
            style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? C.late : C.surfaceAlt, opacity: dict.state === 'unsupported' ? 0.4 : 1 }}
          >
            <Icon name={listening ? 'stop' : 'microphone-outline'} size={21} color={listening ? '#fff' : C.indigo} />
          </Pressable>
          <TextInput
            value={shown}
            onChangeText={setText}
            editable={!listening}
            multiline
            placeholder={listening ? tx('أستمع إليك…', 'Listening…') : tx('اكتب رسالتك لغيث…', 'Message Ghaith…')}
            placeholderTextColor={C.faint}
            onKeyPress={(e) => {
              const n = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (Platform.OS === 'web' && n.key === 'Enter' && !n.shiftKey) {
                (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                send(text);
              }
            }}
            accessibilityLabel={tx('رسالة لغيث', 'Message to Ghaith')}
            style={{ flex: 1, minHeight: 42, maxHeight: 160, fontFamily: F.regular, fontSize: TS.body, lineHeight: 22, color: C.text, textAlign: D.align, writingDirection: D.writing, paddingVertical: 10, paddingHorizontal: 6, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) }}
          />
          <Pressable onPress={() => send(text)} disabled={!text.trim() || busy || listening} accessibilityLabel={tx('إرسال', 'Send')} style={{ width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: C.lineHi, opacity: text.trim() && !busy && !listening ? 1 : 0.45 }}>
            <Gradient colors={GRADIENT} angle="diagonal" radius={21} />
            <Icon name="send" size={19} color="#fff" />
          </Pressable>
        </View>
        <T size={TS.tiny} color={C.faint} align="center" style={{ marginTop: 6 }}>
          {tx('غيث ينفّذ مباشرة في المحادثة. للمراجعة قبل الحفظ استخدم التسجيل أو الكتابة من الرئيسية.', 'In chat Ghaith acts right away. To review before saving, capture from the home page.')}
        </T>
      </View>

      {task && <TaskSheet task={task} onClose={() => setOpen(null)} />}
    </KeyboardAvoidingView>
  );
}
