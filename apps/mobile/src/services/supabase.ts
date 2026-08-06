import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
export const cloudAuthConfigured = Boolean(url && key);

type StorageLike = { getItem(key:string): string|null; setItem(key:string,value:string): void; removeItem(key:string): void };
const storage = (globalThis as typeof globalThis & { localStorage: StorageLike }).localStorage;
export const supabase: SupabaseClient | null = cloudAuthConfigured
  ? createClient(url!, key!, { auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
  : null;
