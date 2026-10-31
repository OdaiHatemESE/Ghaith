// The capture flow: talk (or type / paste an email) once -> غيث splits it into draft tasks -> review -> save.
import React, { useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Draft, Source } from '../lib/store';
import { CATS, KINDS, shortWhen } from '../lib/tasks';
import { useTick } from '../lib/useTick';
import { C, liftMd, R, tint, TS } from '../theme';
import { Card, Check, ErrorText, Field, GhostButton, Icon, IconButton, Num, PrimaryButton, T } from '../ui';
import { Mark } from './Logo';
import { Sheet } from './Sheet';
import { TaskSheet } from './TaskSheet';

/** "مهمة وحدة"، "مهمتين"، "4 مهام"، "12 مهمة" */
export function countTasks(n: number): string {
  if (n === 1) return 'مهمة وحدة';
  if (n === 2) return 'مهمتين';
  if (n <= 10) return `${n} مهام`;
  return `${n} مهمة`;
}

/** Soft violet and teal light behind the full-screen capture views */
function Glow() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="gv" cx="50%" cy="36%" r="55%">
            <Stop offset="0" stopColor="#E1DBFF" stopOpacity="1" />
            <Stop offset="1" stopColor="#E1DBFF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="gt" cx="15%" cy="62%" r="45%">
            <Stop offset="0" stopColor="#D2F7F8" stopOpacity="1" />
            <Stop offset="1" stopColor="#D2F7F8" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={C.bg} />
        <Rect width="100%" height="100%" fill="url(#gt)" />
        <Rect width="100%" height="100%" fill="url(#gv)" />
      </Svg>
    </View>
  );
}

function useBack(onBack: () => void) {
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (onBack(), true));
    return () => sub.remove();
  }, [onBack]);
}

// ---------------------------------------------------------------- recording
export function RecordView({ text, level, error, startedAt, onDone, onCancel }: { text: string; level: number; error: string; startedAt: number; onDone: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const now = useTick(110);
  useBack(onCancel);
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  const phase = now / 160;
  const bars = Array.from({ length: 24 }, (_, i) => {
    const shape = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + 0.6));
    const wobble = 0.55 + 0.45 * Math.sin(phase + i * 1.3);
    return 6 + 40 * shape * Math.max(0.12, level) * wobble;
  });
  const ring = 1 + level * 0.12;

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Glow />
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, flexDirection: 'row-reverse' }}>
          <IconButton icon="close" label="إلغاء" onPress={onCancel} />
        </View>
        <View style={{ alignItems: 'center', marginTop: 8, paddingHorizontal: 24 }}>
          <T w="bold" size={TS.h1} align="center" style={{ lineHeight: 36 }}>احكي، وأنا برتّب</T>
          <T size={TS.small} color={C.sub} align="center">قول كل المهام مرة وحدة، بأي ترتيب</T>
        </View>

        <View style={{ alignItems: 'center', justifyContent: 'center', height: 230, marginTop: 6 }}>
          {[230, 190, 156].map((s, i) => (
            <View
              key={s}
              style={{
                position: 'absolute',
                width: s,
                height: s,
                borderRadius: s / 2,
                borderWidth: 1.5,
                borderColor: i === 1 ? tint(C.teal, 0.35) : tint(C.glow, 0.25),
                transform: [{ scale: i === 0 ? ring : 1 + level * 0.06 * (2 - i) }],
              }}
            />
          ))}
          <View style={{ width: 124, height: 124, borderRadius: 38, backgroundColor: C.indigo, alignItems: 'center', justifyContent: 'center', shadowColor: C.teal, shadowOpacity: 0.45, shadowRadius: 40, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}>
            <Mark size={78} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, height: 50 }}>
          {bars.map((h, i) => (
            <View key={i} style={{ width: 5, height: h, borderRadius: 3, backgroundColor: i % 3 === 0 ? C.teal : i % 3 === 1 ? '#3FA3F0' : C.glow }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.late }} />
          <Num size={TS.body}>{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</Num>
        </View>

        <ScrollView style={{ flex: 1, marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 20, padding: 16, minHeight: 96 }}>
            <T w="medium" size={TS.tiny} color={C.glow}>{text ? 'عم بسمعك…' : 'جاهز، احكي…'}</T>
            <T size={TS.body} color={text ? C.text : C.faint}>
              {text || 'مثلاً: «بكرة الصبح لازم أرد على إيميل خالد، وذكّرني الخميس أجدد ملكية السيارة، وناطر رد سارة على عرض السعر»'}
            </T>
          </View>
          <ErrorText text={error} />
        </ScrollView>

        <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20, paddingTop: 10, gap: 10 }}>
          <PrimaryButton label="خلصت، رتّبهم" icon="stop-circle-outline" onPress={onDone} disabled={!text} />
          <View style={{ flexDirection: 'row' }}>
            <GhostButton label="إلغاء" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- typing / pasting
export function TypeSheet({ mode, onSubmit, onClose }: { mode: 'text' | 'email'; onSubmit: (t: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const email = mode === 'email';
  return (
    <Sheet
      visible
      title={email ? 'الصق الإيميل' : 'اكتب لغيث'}
      onClose={onClose}
      footer={<PrimaryButton label="رتّبها مهام" icon="creation" onPress={() => text.trim() && onSubmit(text.trim())} disabled={!text.trim()} />}
    >
      <T size={TS.small} color={C.sub} style={{ marginBottom: 10 }}>
        {email ? 'انسخ نص الإيميل (أو جزء منه) والصقه هون، وغيث بيطلّع منه شو المطلوب منك وشو ناطر.' : 'اكتب كل اللي ببالك مرة وحدة، وغيث بيقسّمه مهام.'}
      </T>
      <Field value={text} onChangeText={setText} placeholder={email ? 'الصق نص الإيميل هون…' : 'مثلاً: بكرة لازم أبعت التقرير للمدير، وناطر رد قسم IT على طلب الصلاحيات'} multiline autoFocus maxLength={6000} minHeight={email ? 200 : 130} />
      <View style={{ height: 8 }} />
    </Sheet>
  );
}

// ---------------------------------------------------------------- thinking
export function ThinkingView() {
  const insets = useSafeAreaInsets();
  const now = useTick(80);
  const s = 1 + 0.06 * Math.sin(now / 260);
  const dots = '.'.repeat(1 + (Math.floor(now / 400) % 3));
  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: insets.bottom }}>
        <Glow />
        <View style={{ transform: [{ scale: s }], width: 124, height: 124, borderRadius: 38, backgroundColor: C.indigo, alignItems: 'center', justifyContent: 'center', shadowColor: C.glow, shadowOpacity: 0.5, shadowRadius: 40, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}>
          <Mark size={78} />
        </View>
        <T w="bold" size={TS.h2} align="center" style={{ marginTop: 28 }}>غيث عم يرتّب{dots}</T>
        <T size={TS.small} color={C.sub} align="center">بقسّم كلامك مهام وبحط لكل وحدة وقتها</T>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------- review
type Item = { key: number; draft: Draft; keep: boolean };

function DraftRow({ item, last, onToggle, onRemove, onOpen }: { item: Item; last: boolean; onToggle: () => void; onRemove: () => void; onOpen: () => void }) {
  const d = item.draft;
  const remind = d.remind_at ?? d.due_at;
  const sub = [
    KINDS[d.kind].label,
    remind ? (d.kind === 'waiting' && !d.due_at ? 'بتابع ' : '') + shortWhen(remind) : null,
    CATS[d.category].label,
    d.person,
  ]
    .filter(Boolean)
    .join(' · ');
  const warn = d.similar_to ? `عندك مهمة مشابهة: ${d.similar_to}` : !remind ? 'بدون وقت، اضغط لتحدد متى أذكّرك' : '';
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => ({ flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: pressed ? C.bg : 'transparent', opacity: item.keep ? 1 : 0.5 })}
    >
      <Check on={item.keep} onPress={onToggle} size={24} label={item.keep ? 'لا تحفظها' : 'احفظها'} />
      <View style={{ flex: 1, marginRight: 12, marginLeft: 8 }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
          <T w="medium" numberOfLines={2} style={{ flexShrink: 1 }}>{d.title}</T>
          {d.priority === 'high' && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.late }} />}
          {!!d.repeat && <Icon name="repeat" size={14} color={C.faint} />}
        </View>
        <T size={TS.small} color={C.sub} numberOfLines={1}>{sub}</T>
        {!!warn && <T size={TS.tiny} color={C.amberText} numberOfLines={1}>{warn}</T>}
      </View>
      <Pressable onPress={onRemove} hitSlop={12} accessibilityLabel="شيلها">
        <Icon name="close" size={18} color={C.faint} />
      </Pressable>
      {!last && <View style={{ position: 'absolute', bottom: 0, left: 16, right: 52, height: 1, backgroundColor: C.line }} />}
    </Pressable>
  );
}

export function ReviewView({ said, source, drafts, onSave, onClose, onRetry }: { said: string; source: Source; drafts: Draft[]; onSave: (d: Draft[]) => Promise<string | null>; onClose: () => void; onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  // A draft that looks like an existing task starts unticked
  const [items, setItems] = useState<Item[]>(() => drafts.map((d, i) => ({ key: i, draft: d, keep: !d.similar_to })));
  const [edit, setEdit] = useState<{ key: number | null } | null>(null);
  const [showSaid, setShowSaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useBack(onClose);

  const kept = items.filter((i) => i.keep);
  const save = async () => {
    setBusy(true);
    const e = await onSave(kept.map((i) => i.draft));
    setBusy(false);
    if (e) setErr(e);
  };
  const editing = edit && edit.key !== null ? items.find((i) => i.key === edit.key)?.draft ?? null : null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 130 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: tint(C.glow, 0.1), paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.pill }}>
              <Icon name="creation" size={14} color={C.glow} />
              <T w="medium" size={TS.tiny} color={C.glow}>{items.length ? 'جاهزة للمراجعة' : 'ما لقيت مهام'}</T>
            </View>
            <IconButton icon="close" label="إغلاق" onPress={onClose} />
          </View>
          <T w="bold" size={TS.h1} style={{ marginTop: 10, lineHeight: 36 }}>
            {items.length ? `طلّعت ${countTasks(items.length)} من ${source === 'email' ? 'الإيميل' : 'كلامك'}` : 'ما لقيت شي أسجّله'}
          </T>
          <T size={TS.small} color={C.sub}>
            {items.length ? 'اضغط على أي مهمة لتعدّلها، أو شيلها من القائمة' : 'جرّب تحكيها بطريقة ثانية، أو أضف المهمة بإيدك.'}
          </T>

          <Pressable onPress={() => setShowSaid((v) => !v)} style={{ marginTop: 16, marginBottom: 16, borderRadius: 14, backgroundColor: C.surfaceAlt, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row-reverse', alignItems: showSaid ? 'flex-start' : 'center', gap: 8 }}>
            <Icon name={source === 'voice' ? 'microphone-outline' : source === 'email' ? 'email-outline' : 'text'} size={17} color={C.indigo} />
            <T size={TS.small} color={C.sub} style={{ flex: 1 }} numberOfLines={showSaid ? undefined : 1}>«{said}»</T>
            <T size={TS.small} w="medium" color={C.glow}>{showSaid ? 'إخفاء' : source === 'voice' ? 'اللي قلته' : 'النص'}</T>
          </Pressable>

          {!!items.length && (
            <Card>
              {items.map((it, i) => (
                <DraftRow
                  key={it.key}
                  item={it}
                  last={i === items.length - 1}
                  onToggle={() => setItems((l) => l.map((x) => (x.key === it.key ? { ...x, keep: !x.keep } : x)))}
                  onRemove={() => setItems((l) => l.filter((x) => x.key !== it.key))}
                  onOpen={() => setEdit({ key: it.key })}
                />
              ))}
            </Card>
          )}
          {!items.length && (
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <GhostButton label="جرّب كمان مرة" icon="microphone-outline" onPress={onRetry} />
            </View>
          )}
          <ErrorText text={err} />
        </ScrollView>

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 20, backgroundColor: 'rgba(248,250,255,0.96)', flexDirection: 'row-reverse', gap: 10 }}>
          <PrimaryButton style={{ flex: 1 }} label={kept.length ? `احفظ ${countTasks(kept.length)}` : 'اختار مهمة لتحفظها'} icon="check" onPress={save} busy={busy} disabled={!kept.length} />
          <Pressable onPress={() => setEdit({ key: null })} accessibilityLabel="أضف مهمة" style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center', ...liftMd, shadowOpacity: 0.06 }}>
            <Icon name="plus" size={24} color={C.indigo} />
          </Pressable>
        </View>

        {edit && (
          <TaskSheet
            task={null}
            draft={editing}
            onDraft={(d) =>
              setItems((l) => (edit.key === null ? [...l, { key: Date.now(), draft: d, keep: true }] : l.map((x) => (x.key === edit.key ? { ...x, draft: d, keep: true } : x))))
            }
            onClose={() => setEdit(null)}
          />
        )}
      </View>
    </Modal>
  );
}
