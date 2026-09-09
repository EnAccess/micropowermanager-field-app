import AsyncStorage from '@react-native-async-storage/async-storage';

import { scopedKey } from '@/auth/sessionScope';

type Bucket = {
  cached: number | null | undefined;
  listeners: Set<(ts: number | null) => void>;
};

const buckets = new Map<string, Bucket>();

export function lastSyncBucket(scopeId: string): Bucket {
  let bucket = buckets.get(scopeId);
  if (!bucket) {
    bucket = { cached: undefined, listeners: new Set() };
    buckets.set(scopeId, bucket);
  }
  return bucket;
}

function storageKey(scopeId: string): string {
  return scopedKey(scopeId, 'last_synced_at');
}

export async function readLastSyncedAt(
  scopeId: string,
): Promise<number | null> {
  const bucket = lastSyncBucket(scopeId);
  if (bucket.cached !== undefined) return bucket.cached;
  try {
    const raw = await AsyncStorage.getItem(storageKey(scopeId));
    bucket.cached = raw ? Number(raw) || null : null;
  } catch {
    bucket.cached = null;
  }
  return bucket.cached;
}

export async function markSyncedNow(scopeId: string): Promise<void> {
  const ts = Date.now();
  try {
    await AsyncStorage.setItem(storageKey(scopeId), String(ts));
  } catch {
    // best effort
  }
  const bucket = lastSyncBucket(scopeId);
  bucket.cached = ts;
  for (const listener of bucket.listeners) listener(ts);
}

export function evictLastSyncedScope(scopeId: string): void {
  const bucket = buckets.get(scopeId);
  if (!bucket) return;
  bucket.cached = null;
  for (const listener of bucket.listeners) listener(null);
  buckets.delete(scopeId);
}
