import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/src/auth/AuthProvider';

export default function AuthLayout() {
  const { user } = useAuth();
  if (user) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
