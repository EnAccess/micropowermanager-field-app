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
): Promise<DrainResult> {
  if (drainPromise) return drainPromise;
  isDraining = true;
  setStatus('draining');

  drainPromise = (async () => {
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let pendingRemaining = 0;

    const entries = await listOutbox();
    // Drain sequentially: avoid duplicate-phone races on parallel inserts and
    // exit early on the first network error so we don't flood a flaky
    // connection.
    for (const entry of entries) {
      if (entry.status !== 'pending') continue;
      attempted += 1;
      try {
        await syncEntry(api, entry);
        await removeOutboxEntry(entry.local_id);
        succeeded += 1;
      } catch (err) {
        if (isNetworkError(err)) {
          await bumpOutboxAttempt(entry.local_id);
          pendingRemaining += entries.filter(
            (e) => e.status === 'pending',
          ).length;
          break;
        }
        await markOutboxFailed(entry.local_id, extractError(err));
        failed += 1;
      }
    }

    if (succeeded > 0) {
      await queryClient.invalidateQueries({ queryKey: ['agent-customers'] });
      await queryClient.invalidateQueries({ queryKey: ['customer-search'] });
    }

    void markSyncedNow();

    return {
      attempted,
      succeeded,
      failed,
      remainingPending: pendingRemaining,
    };
  })().finally(() => {
    isDraining = false;
    drainPromise = null;
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
 * Mount at the app shell exactly once. Drains the outbox whenever:
 *   - the device transitions to online
 *   - the app transitions to foreground
 *   - any of the entries change (a new offline registration was just enqueued)
 * Drains are guarded by the in-module isDraining flag so concurrent triggers
 * coalesce to a single run.
 */
export function useOutboxDrainerHost(
  api: AxiosInstance | null,
  queryClient: QueryClient,
): void {
  useEffect(() => {
    if (!api) return;
    let cancelled = false;

    const tryDrain = async () => {
      if (cancelled) return;
      const entries = await listOutbox();
      const hasPending = entries.some((e) => e.status === 'pending');
      if (!hasPending) return;
      const net = await NetInfo.fetch();
      if (net.isConnected === false) return;
      if (net.isInternetReachable === false) return;
      void drainOutbox(api, queryClient);
    };

    // Drain on mount in case there are leftover entries from a previous session.
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

    const outboxUnsub = subscribeOutbox((entries) => {
      if (entries.some((e) => e.status === 'pending')) void tryDrain();
    });

    return () => {
      cancelled = true;
      netUnsub();
      appStateSub.remove();
      outboxUnsub();
    };
  }, [api, queryClient]);
}

/**
 * Read-only view of the drainer for any screen that needs the status pill or a
 * "Sync now" button. Does not register system listeners — those live in the
 * app-shell `useOutboxDrainerHost`.
 */
export function useDrainerStatus(
  api: AxiosInstance | null,
  queryClient: QueryClient,
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
      if (!api) return;
      void (async () => {
        const net = await NetInfo.fetch();
        if (net.isConnected === false || net.isInternetReachable === false) {
          flashOfflineStatus();
          return;
        }
        void drainOutbox(api, queryClient);
      })();
    },
  };
}
