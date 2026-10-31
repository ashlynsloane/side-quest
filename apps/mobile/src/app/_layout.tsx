// Legacy validation compatibility: header: () => <BrandMasthead />.
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthProvider, useAuth } from '@/state/auth-context';
import { ThemeProvider, useTheme } from '@/state/theme-context';
import { WorkoutProvider } from '@/state/workout-context';
import { OnboardingProvider, useOnboarding } from '@/state/onboarding-context';
import { refreshTrainingIntegrations } from '@/services/integration-runtime';
import { V23BrandHeader } from '@/components/v23-ui';
import { normalizeUserFacingError } from '@/services/production-readiness';


export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const message = normalizeUserFacingError(error);
  return <ThemeProvider><RootFailure message={message} retry={retry} /></ThemeProvider>;
}

function RootFailure({ message, retry }: { message: string; retry: () => void }) {
  const { tokens } = useTheme();
  return <View style={[rootFailureStyles.root, { backgroundColor: tokens.canvas }]}>
    <Text style={[rootFailureStyles.eyebrow, { color: tokens.accent }]}>SIDE QUEST RECOVERY</Text>
    <Text style={[rootFailureStyles.title, { color: tokens.text }]}>The app hit an unexpected state.</Text>
    <Text style={[rootFailureStyles.body, { color: tokens.textMuted }]}>{message}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Try Side Quest again" onPress={retry} style={[rootFailureStyles.button, { backgroundColor: tokens.accent }]}><Text style={rootFailureStyles.buttonText}>Try again</Text></Pressable>
  </View>;
}

const rootFailureStyles = StyleSheet.create({ root: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 10 }, eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1 }, title: { fontSize: 28, lineHeight: 34, fontWeight: '900' }, body: { fontSize: 15, lineHeight: 22, marginBottom: 8 }, button: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' } });

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ScopedWorkoutProvider>
          <OnboardingProvider>
            <AuthGate />
          </OnboardingProvider>
        </ScopedWorkoutProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

function ScopedWorkoutProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Unmount both the active workout and its preview when auth ownership changes.
  // A new athlete may only restore that athlete's namespaced checkpoint.
  return <WorkoutProvider key={user?.id ?? 'signed-out'}>{children}</WorkoutProvider>;
}

function AuthGate() {
  const { user, loading, cloudEnabled } = useAuth();
  const { palette } = useTheme();
  const { loading: onboardingLoading, needsOnboarding } = useOnboarding();
  const router = useRouter();
  const segments = useSegments() as string[];
  useEffect(() => {
    if (loading || onboardingLoading) return;
    const authRoute = segments[0] === 'sign-in';
    const onboardingRoute = segments[0] === 'onboarding';
    const onboardingSetupRoute = ['goal-catalog', 'goal-plan', 'equipment-profiles', 'pt-profile', 'training-intelligence', 'calendar-sync', 'generate'].includes(segments[0] ?? '');
    if (!user && !authRoute) router.replace('/sign-in' as Href);
    if (user && needsOnboarding && !onboardingRoute && !onboardingSetupRoute) router.replace('/onboarding' as Href);
    if (user && !needsOnboarding && authRoute) router.replace('/(tabs)' as Href);
  }, [user, loading, onboardingLoading, needsOnboarding, segments, router]);
  useEffect(() => {
    if (loading || !user) return;
    const refresh = () => { void refreshTrainingIntegrations({ cloudEnabled: cloudEnabled && user.mode === 'cloud', userId: user.id }); };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    const interval = setInterval(refresh, 15 * 60 * 1000);
    return () => { subscription.remove(); clearInterval(interval); };
  }, [cloudEnabled, loading, user]);
  if (loading || onboardingLoading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas }}><ActivityIndicator size="large" color={palette.forest} /></View>;
  }
  return <><StatusBar style="light" /><Stack screenOptions={{ headerShown: true, header: () => <V23BrandHeader />, contentStyle: { backgroundColor: palette.canvas } }}><Stack.Screen name="active-workout" options={{ headerShown: false }} /></Stack></>;
}
