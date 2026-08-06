import type { GeneratedWorkout } from '@circuit/domain';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  deleteFavoriteWorkout,
  listFavoriteWorkouts,
  type FavoriteWorkoutRecord,
} from '@/services/database';
import { useWorkoutContext } from '@/state/workout-context';

export default function FavoritesScreen() {
  const router = useRouter();
  const { setPreviewWorkout, beginWorkout } = useWorkoutContext();
  const [favorites, setFavorites] = useState<FavoriteWorkoutRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    setFavorites(await listFavoriteWorkouts());
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void loadFavorites();
  }, [loadFavorites]));

  function loadWorkout(workout: GeneratedWorkout) {
    setPreviewWorkout({ ...workout, source: 'favorite_exact' });
    router.push('/workout-preview' as Href);
  }

  function startWorkout(workout: GeneratedWorkout) {
    beginWorkout({ ...workout, source: 'favorite_exact' });
    router.push('/active-workout' as Href);
  }

  async function removeFavorite(id: string) {
    await deleteFavoriteWorkout(id);
    await loadFavorites();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Favorite workouts</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.helper}>Loading favorites…</Text> : null}
        {!loading && favorites.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No favorites yet</Text>
            <Text style={styles.helper}>
              Save an auto-generated workout and it will appear here for exact repeats.
            </Text>
          </View>
        ) : null}

        {favorites.map((favorite) => (
          <View key={favorite.id} style={styles.card}>
            <Text style={styles.cardTitle}>{favorite.name}</Text>
            <Text style={styles.helper}>
              {favorite.workout.stations.length} stations · {favorite.workout.totalWorkSeconds / 60} min work · {favorite.workout.requiredEquipment.length || 'No'} equipment types
            </Text>
            <View style={styles.buttonRow}>
              <Pressable accessibilityRole="button" onPress={() => loadWorkout(favorite.workout)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Load</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => startWorkout(favorite.workout)} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Start</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void removeFavorite(favorite.id)} style={styles.deleteButton}>
                <Text style={styles.deleteButtonText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const colors = {
  background: '#E4EBE3',
  card: '#FFFDF8',
  ink: '#01234D',
  muted: '#6B7770',
  border: '#164C73',
  accent: '#153E2F',
  danger: '#9B2C2C',
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  backButton: { paddingVertical: 6, paddingRight: 4 },
  backText: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 23, fontWeight: '700' },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  helper: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 20,
    gap: 7,
  },
  emptyTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    gap: 9,
  },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  secondaryButton: { borderWidth: 1, borderColor: colors.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryButtonText: { color: colors.accent, fontWeight: '700' },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  deleteButton: { paddingHorizontal: 12, paddingVertical: 10 },
  deleteButtonText: { color: colors.danger, fontWeight: '700' },
});
