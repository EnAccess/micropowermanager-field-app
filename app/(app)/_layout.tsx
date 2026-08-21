import { useQueryClient } from '@tanstack/react-query';
import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/auth/SessionContext';
import { useOutboxDrainerHost } from '@/storage/outboxDrainer';

export default function AppLayout() {
  const { status, api } = useSession();
  const queryClient = useQueryClient();
  useOutboxDrainerHost(api, queryClient);

  if (status !== 'authenticated') {
    return <Redirect href="/(auth)/environment" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="customers/[id]/onboarding"
        options={{ gestureEnabled: false }}
      />
    </Stack>
  );
}
