import { Redirect, type Href } from 'expo-router';
import { useAuth } from '@/state/auth-context';

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Redirect href={(user ? '/(tabs)' : '/sign-in') as Href} />;
}
