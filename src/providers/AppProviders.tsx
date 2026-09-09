import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useMemo, useRef } from 'react';

import { SessionProvider, useSession } from '@/auth/SessionContext';
import { ToastProvider } from '@/components';
import { I18nProvider } from '@/i18n/I18nProvider';

/**
 * One QueryClient per session scope. Most query keys carry no agent identity,
 * so a fresh client is what keeps the previous agent's cached lists from ever
 * reaching the next one; the outgoing client is cleared as it is replaced.
 */
function SessionQueryClientProvider({ children }: { children: ReactNode }) {
  const { scopeId } = useSession();

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scope change must mint a new cache
    [scopeId],
  );

  const previousRef = useRef<QueryClient | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    if (previous && previous !== queryClient) {
      previous.clear();
    }
    previousRef.current = queryClient;
  }, [queryClient]);

  useEffect(
    () => () => {
      previousRef.current?.clear();
    },
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionQueryClientProvider>
        <I18nProvider>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </SessionQueryClientProvider>
    </SessionProvider>
  );
}
