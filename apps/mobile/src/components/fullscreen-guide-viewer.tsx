import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function FullscreenGuideViewer({
  visible,
  title,
  source,
  onClose,
}: {
  visible: boolean;
  title: string;
  source: number;
  onClose: () => void;
}) {
  const [sessionKey, setSessionKey] = useState(0);
  const closingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      setSessionKey((value) => value + 1);
    }
  }, [visible]);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={close}
      onDismiss={() => {
        closingRef.current = false;
        setSessionKey((value) => value + 1);
      }}
    >
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text numberOfLines={2} style={styles.title}>{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close illustrated guide"
            hitSlop={12}
            onPress={close}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView
          key={sessionKey}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          minimumZoomScale={1}
          maximumZoomScale={4}
          bouncesZoom
          centerContent
          alwaysBounceHorizontal={false}
          alwaysBounceVertical={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
        >
          <View style={styles.imageFrame}>
            <Image source={source} style={styles.image} contentFit="contain" transition={0} />
          </View>
        </ScrollView>

        <Text style={styles.hint}>Pinch to zoom · drag to inspect</Text>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D120F' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.16)',
  },
  title: { flex: 1, color: '#FFFFFF', fontSize: 18, lineHeight: 23, fontWeight: '900' },
  closeButton: { backgroundColor: '#DDE9E1', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  closeText: { color: '#173A2B', fontWeight: '900' },
  pressed: { opacity: 0.72 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 14 },
  imageFrame: { width: '100%', aspectRatio: 3 / 2, backgroundColor: '#FFFFFF', borderRadius: 10, overflow: 'hidden' },
  image: { width: '100%', height: '100%', backgroundColor: '#FFFFFF' },
  hint: { color: 'rgba(255,255,255,0.72)', textAlign: 'center', fontSize: 12, fontWeight: '700', paddingVertical: 10 },
});
