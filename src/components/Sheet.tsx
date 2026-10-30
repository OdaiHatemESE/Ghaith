import React from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, TS } from '../theme';
import { Icon, Row, T } from '../ui';
import { useKeyboardReveal } from './KeyboardScroll';

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* Android draws edge to edge, so the keyboard no longer resizes the window: make room on both platforms */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(20,33,61,0.45)' }} />
        <View
          style={{
            backgroundColor: C.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '94%',
            paddingBottom: insets.bottom + 12,
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 10 }} />
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 }}>
            <T w="bold" size={TS.h2}>{title}</T>
            <Pressable onPress={onClose} hitSlop={12} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={18} color={C.sub} />
            </Pressable>
          </Row>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }} {...reveal}>
            {children}
          </ScrollView>
          {footer && <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
