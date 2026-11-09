// The "History" part of a task: add a note or an update, and see everything that happened, newest first.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native';
import { addNote, describeChanges, eventTime, eventTitle, loadEvents, noteLabel, removeNote, TaskEvent } from '../lib/history';
import { D, tx } from '../lib/i18n';
import { C, F, R, tint, TS } from '../theme';
import { Icon, IconName, T } from '../ui';

const LOOK: Record<TaskEvent['kind'], { icon: IconName; color: string }> = {
  created: { icon: 'plus-circle-outline', color: C.indigo },
  updated: { icon: 'pencil-outline', color: C.glowText },
  done: { icon: 'check-circle-outline', color: C.tealDeep },
  reopened: { icon: 'restore', color: C.amberText },
  note: { icon: 'message-text-outline', color: C.indigoHi },
};

export function TaskHistory({ taskId }: { taskId: string }) {
  const [events, setEvents] = useState<TaskEvent[] | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    loadEvents(taskId).then((e) => live && setEvents(e));
    return () => {
      live = false;
    };
  }, [taskId]);

  const add = async () => {
    const note = text.trim();
    if (!note) return;
    setBusy(true);
    const e = await addNote(taskId, note);
    setBusy(false);
    if (e) {
      setText('');
      setEvents((l) => [e, ...(l ?? [])]);
    }
  };

  if (events === null) return null; // history not available

  return (
    <View>
      <T w="semibold" size={TS.small} color={C.sub} style={{ marginTop: 18, marginBottom: 8 }}>{tx('السجل والملاحظات', 'History & notes')}</T>
      <View style={{ backgroundColor: C.surface, borderRadius: R.card, padding: 12 }}>
        {/* New note */}
        <View style={{ flexDirection: D.row, alignItems: 'flex-end', gap: 8 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={tx('أضف تحديثاً: اتصلت بخالد وسيرد الأحد…', 'Add an update: called Khalid, he will reply on Sunday…')}
            placeholderTextColor={C.faint}
            multiline
            maxLength={2000}
            style={{ flex: 1, minHeight: 42, maxHeight: 140, fontFamily: F.regular, fontSize: TS.body, lineHeight: 22, color: C.text, textAlign: D.align, writingDirection: D.writing, backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) }}
          />
          <Pressable onPress={add} disabled={!text.trim() || busy} accessibilityLabel={tx('إضافة الملاحظة', 'Add note')} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: text.trim() ? C.glow : C.lineHi, alignItems: 'center', justifyContent: 'center' }}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="send" size={18} color="#fff" />}
          </Pressable>
        </View>

        {/* Timeline */}
        {events === undefined && <ActivityIndicator color={C.glow} style={{ marginTop: 16 }} />}
        {!!events?.length && (
          <View style={{ marginTop: 14 }}>
            {events.map((e, i) => {
              const look = LOOK[e.kind];
              const lines = describeChanges(e.changes);
              const last = i === events.length - 1;
              return (
                <View key={e.id} style={{ flexDirection: D.row, gap: 10 }}>
                  {/* rail */}
                  <View style={{ alignItems: 'center', width: 28 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tint(look.color, 0.12), alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={look.icon} size={15} color={look.color} />
                    </View>
                    {!last && <View style={{ flex: 1, width: 2, backgroundColor: C.line, marginVertical: 2 }} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
                    <View style={{ flexDirection: D.row, alignItems: 'center', gap: 8 }}>
                      <T w="medium" size={TS.small} style={{ flex: 1 }}>{eventTitle(e)}</T>
                      <T size={TS.tiny} color={C.faint}>{eventTime(e.created_at)}</T>
                      {e.kind === 'note' && (
                        <Pressable
                          hitSlop={8}
                          accessibilityLabel={tx('حذف الملاحظة', 'Delete note')}
                          onPress={async () => (await removeNote(e.id)) && setEvents((l) => (l ?? []).filter((x) => x.id !== e.id))}
                        >
                          <Icon name="close" size={14} color={C.faint} />
                        </Pressable>
                      )}
                    </View>
                    {!!e.note && (
                      <View style={{ marginTop: 4, backgroundColor: e.kind === 'note' ? C.bg : tint(look.color, 0.07), borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, [D.rtl ? 'borderRightWidth' : 'borderLeftWidth']: e.kind === 'note' ? 0 : 3, borderColor: look.color, gap: 2 }}>
                        {!!noteLabel(e) && <T size={TS.tiny} w="bold" color={look.color}>{noteLabel(e)}</T>}
                        <T size={TS.small}>{e.note}</T>
                      </View>
                    )}
                    {lines.map((l, j) => (
                      <T key={j} size={TS.small} color={C.sub}>{l}</T>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
