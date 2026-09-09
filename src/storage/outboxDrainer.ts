import NetInfo from '@react-native-community/netinfo';
import { QueryClient } from '@tanstack/react-query';
import { AxiosInstance } from 'axios';
import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { registerCustomer } from '@/api/customer';

import { markSyncedNow } from './lastSync';
import {
  bumpOutboxAttempt,
  listOutbox,
  markOutboxFailed,
  OutboxEntry,
  OutboxError,
  removeOutboxEntry,
  subscribeOutbox,
} from './outbox';

type DrainStatus = 'idle' | 'draining' | 'offline';

let isDraining = false;
let drainPromise: Promise<DrainResult> | null = null;
let drainingScope: string | null = null;
let cancelRequested = false;
const statusListeners = new Set<(status: DrainStatus) => void>();

function setStatus(status: DrainStatus) {
  for (const listener of statusListeners) listener(status);
}

function flashOfflineStatus(): void {
  setStatus('offline');
  setTimeout(() => {
    if (!isDraining) setStatus('idle');
  }, 2500);
}

export type DrainResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  remainingPending: number;
};

/**
 * Asks an in-flight drain to stop after the current entry. Sign-out awaits
 * `drainSettled()` so a request started under the outgoing token can never
 * land after the session is gone.
 */
export function cancelDrain(): void {
  if (drainPromise) cancelRequested = true;
}

export async function drainSettled(): Promise<void> {
  while (drainPromise) {
    try {
      await drainPromise;
    } catch {
      // a rejected drain is still a settled drain
    }
  }
}

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { response?: unknown; code?: string };
  if ('response' in e && e.response !== undefined) return false;
  if (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') return true;
  return true;
}

function extractError(error: unknown): OutboxError {
  const e = error as {
    response?: {
      status?: number;
      data?: { message?: string; errors?: Record<string, string[]> };
    };
    message?: string;
  };
  const status = e.response?.status;
  const fieldError = e.response?.data?.errors
    ? Object.values(e.response.data.errors).flat()[0]
    : undefined;
  const message =
    fieldError ?? e.response?.data?.message ?? e.message ?? 'Sync failed.';
  return { code: status, message };
}

export async function drainOutbox(
  api: AxiosInstance,
  queryClient: QueryClient,
  scopeId: string,
): Promise<DrainResult> {
  // Only coalesce with a run for the same scope; a different scope's entries
  // must never be reported as this one's.
  if (drainPromise && drainingScope === scopeId) return drainPromise;
  if (drainPromise) {
    return { attempted: 0, succeeded: 0, failed: 0, remainingPending: 0 };
  }
  isDraining = true;
  drainingScope = scopeId;
  cancelRequested = false;
  setStatus('draining');

  drainPromise = (async () => {
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let remainingPending = 0;

    const entries = await listOutbox(scopeId);
    const pending = entries.filter((e) => e.status === 'pending');
    // Drain sequentially: avoid duplicate-phone races on parallel inserts and
    // exit early on the first network error so we don't flood a flaky
    // connection.
    for (let i = 0; i < pending.length; i++) {
      if (cancelRequested) {
        remainingPending = pending.length - i;
        break;
      }
      const entry = pending[i];
      attempted += 1;
      try {
        await syncEntry(api, entry);
        await removeOutboxEntry(scopeId, entry.local_id);
        succeeded += 1;
      } catch (err) {
        if (isNetworkError(err)) {
          await bumpOutboxAttempt(scopeId, entry.local_id);
          remainingPending = pending.length - i;
          break;
        }
        await markOutboxFailed(scopeId, entry.local_id, extractError(err));
        failed += 1;
      }
    }

    if (succeeded > 0) {
      await queryClient.invalidateQueries({ queryKey: ['agent-customers'] });
      await queryClient.invalidateQueries({ queryKey: ['customer-search'] });
      void markSyncedNow(scopeId);
    }

    return {
      attempted,
      succeeded,
      failed,
      remainingPending,
    };
  })().finally(() => {
    isDraining = false;
    drainPromise = null;
    drainingScope = null;
    cancelRequested = false;
    setStatus('idle');
  });

  return drainPromise;
}

async function syncEntry(
  api: AxiosInstance,
  entry: OutboxEntry,
): Promise<void> {
  switch (entry.kind) {
    case 'register_customer':
      await registerCustomer(api, entry.payload, { timeoutMs: 5000 });
      return;
  }
}

/**
 * Mount inside the authenticated shell exactly once. Drains the outbox of the
 * current session scope whenever:
 *   - the device transitions to online
 *   - the app transitions to foreground
 *   - any of the entries change (a new offline registration was just enqueued)
 * Drains are guarded by the in-module isDraining flag so concurrent triggers
 * coalesce to a single run.
 */
export function useOutboxDrainerHost(
  api: AxiosInstance | null,
  queryClient: QueryClient,
  scopeId: string | null,
): void {
  useEffect(() => {
    if (!api || !scopeId) return;
    let cancelled = false;

    const tryDrain = async () => {
      if (cancelled) return;
      const entries = await listOutbox(scopeId);
      const hasPending = entries.some((e) => e.status === 'pending');
      if (!hasPending) return;
      const net = await NetInfo.fetch();
      if (net.isConnected === false) return;
      if (net.isInternetReachable === false) return;
      if (cancelled) return;
      void drainOutbox(api, queryClient, scopeId);
    };

    // Drain on mount in case there are leftover entries from a previous run.
    void tryDrain();

    const netUnsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void tryDrain();
      }
    });

    const appStateSub = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        if (next === 'active') void tryDrain();
      },
    );

    const outboxUnsub = subscribeOutbox(scopeId, (entries) => {
      if (entries.some((e) => e.status === 'pending')) void tryDrain();
    });

    return () => {
      cancelled = true;
      netUnsub();
      appStateSub.remove();
      outboxUnsub();
    };
  }, [api, queryClient, scopeId]);
}

/**
 * Read-only view of the drainer for any screen that needs the status pill or a
 * "Sync now" button. Does not register system listeners — those live in the
 * app-shell `useOutboxDrainerHost`.
 */
export function useDrainerStatus(
  api: AxiosInstance | null,
  queryClient: QueryClient,
  scopeId: string | null,
): { status: DrainStatus; drainNow: () => void } {
  const [status, setLocalStatus] = useState<DrainStatus>(
    isDraining ? 'draining' : 'idle',
  );

  useEffect(() => {
    statusListeners.add(setLocalStatus);
    return () => {
      statusListeners.delete(setLocalStatus);
    };
  }, []);

  return {
    status,
    drainNow: () => {
      if (!api || !scopeId) return;
      void (async () => {
        const net = await NetInfo.fetch();
        if (net.isConnected === false || net.isInternetReachable === false) {
          flashOfflineStatus();
          return;
        }
        void drainOutbox(api, queryClient, scopeId);
      })();
    },
  };
}
