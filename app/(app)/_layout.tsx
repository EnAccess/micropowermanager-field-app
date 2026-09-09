import { useQueryClient } from '@tanstack/react-query';
import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/auth/SessionContext';
import { useOutboxDrainerHost } from '@/storage/outboxDrainer';
import { usePrefetchCities } from '@/storage/usePrefetchCities';

/**
 * Background work that must only ever run inside an authenticated session.
 * Rendered below the auth guard so a signed-out device never drains an outbox
 * or fetches reference data.
 */
function SessionServices() {
  const { api, scopeId } = useSession();
  const queryClient = useQueryClient();
  useOutboxDrainerHost(api, queryClient, scopeId);
  usePrefetchCities();
  return null;
}

export default function AppLayout() {
  const { status, environment } = useSession();

  if (status !== 'authenticated') {
    return (
      <Redirect href={environment ? '/(auth)/login' : '/(auth)/environment'} />
    );
  }

  return (
    <>
      <SessionServices />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="customers/[id]/onboarding"
          options={{ gestureEnabled: false }}
        />
      </Stack>
    </>
  );
}
