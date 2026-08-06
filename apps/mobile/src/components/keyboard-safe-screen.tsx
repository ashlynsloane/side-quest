import { forwardRef, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/state/theme-context';

interface KeyboardSafeScreenProps extends Omit<ScrollViewProps, 'contentContainerStyle'> {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}

export const KeyboardSafeScreen = forwardRef<ScrollView, KeyboardSafeScreenProps>(function KeyboardSafeScreen(
  { children, contentContainerStyle, footer, ...scrollProps },
  ref,
) {
  const { tokens } = useTheme();
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: tokens.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
    >
      <ScrollView
        ref={ref}
        style={[styles.flex, { backgroundColor: tokens.canvas }]}
        contentContainerStyle={[styles.content, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        {...scrollProps}
      >
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 120 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12 },
});
