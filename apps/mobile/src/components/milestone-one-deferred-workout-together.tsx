import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * This route is intentionally passive. Old invitations / deep links must
 * never hydrate or mutate a remote room in the Milestone #1 build.
 */
export function DeferredWorkoutTogetherScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SIDE QUEST · LATER MILESTONE</Text>
        <Text style={styles.title}>Workout Together is coming later</Text>
        <Text style={styles.body}>
          Milestone 1 focuses on your individual workouts, adaptive training,
          safety holds, and reliable recovery of your progress.
          Shared sessions are postponed until their own recovery and
          device-safety requirements are verified.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to solo training"
          onPress={() => router.replace('/(tabs)/train' as Href)}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Return to solo training</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9F8F5' },
  content: { flex: 1, justifyContent: 'center', padding: 28, gap: 18 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: '#515A69', letterSpacing: 1 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '800', color: '#15233B' },
  body: { fontSize: 16, lineHeight: 24, color: '#354054' },
  button: { minHeight: 50, borderRadius: 14, backgroundColor: '#15233B',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
