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
import { authRedirectFor } from '@/services/auth-navigation';


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
          <ScopedOnboardingProvider>
            <AuthGate />
          </ScopedOnboardingProvider>
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

function ScopedOnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Changing athletes discards previous first-run UI state and any pending
  // asynchronous evaluation before the new athlete's context mounts.
  return <OnboardingProvider key={user?.id ?? 'signed-out'}>{children}</OnboardingProvider>;
}

function AuthGate() {
  const { user, loading, cloudEnabled } = useAuth();
  const { palette } = useTheme();
  const { loading: onboardingLoading, needsOnboarding } = useOnboarding();
  const router = useRouter();
  const segments = useSegments() as string[];
  useEffect(() => {
    const redirect = authRedirectFor({
      authenticated: Boolean(user),
      authLoading: loading,
      onboardingLoading,
      needsOnboarding,
      route: segments[0],
    });
    if (redirect) router.replace(redirect as Href);
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
