import React from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, TS } from '../theme';
import { Icon, T } from '../ui';
import { useKeyboardReveal } from './KeyboardScroll';
import { D } from '../lib/i18n';
import { useWide } from '../lib/useWide';

export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reveal = useKeyboardReveal(visible);
  const wide = useWide();

  // On a desktop screen the sheet is a panel on the reading-end side, full height
  if (wide) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(27,31,107,0.22)' }} />
        <View style={{ position: 'absolute', top: 0, bottom: 0, [D.end]: 0, width: 480, backgroundColor: C.bg, shadowColor: C.indigo, shadowOpacity: 0.18, shadowRadius: 40, shadowOffset: { width: 0, height: 0 } }}>
          <View style={{ flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 10 }}>
            <T w="bold" size={TS.h1}>{title}</T>
            <Pressable onPress={onClose} hitSlop={12} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={18} color={C.sub} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 12 }}>
            {children}
          </ScrollView>
          {footer && <View style={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: 24 }}>{footer}</View>}
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* Android draws edge to edge, so the keyboard no longer resizes the window: make room on both platforms */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(27,31,107,0.28)' }} />
        <View
          style={{
            backgroundColor: C.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '94%',
            paddingBottom: insets.bottom + 12,
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.lineHi, marginTop: 10 }} />
          <View style={{ flexDirection: D.row, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 }}>
            <T w="bold" size={TS.h2}>{title}</T>
            <Pressable onPress={onClose} hitSlop={12} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={18} color={C.sub} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }} {...reveal}>
            {children}
          </ScrollView>
          {footer && <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
