import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/auth/SessionContext';

export default function AuthLayout() {
  const { status } = useSession();

  if (status === 'authenticated') {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
