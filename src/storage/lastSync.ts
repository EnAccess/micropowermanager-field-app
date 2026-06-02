import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mpm.last_synced_at';
const listeners = new Set<(ts: number | null) => void>();
let cached: number | null | undefined;

function notify(ts: number | null) {
  cached = ts;
  for (const l of listeners) l(ts);
}

export async function readLastSyncedAt(): Promise<number | null> {
  if (cached !== undefined) return cached;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cached = raw ? Number(raw) || null : null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function markSyncedNow(): Promise<void> {
  const ts = Date.now();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    // best effort
  }
  notify(ts);
}

export function useLastSyncedAt(): number | null {
  const [ts, setTs] = useState<number | null>(cached ?? null);
  useEffect(() => {
    let mounted = true;
    if (cached === undefined) {
      void readLastSyncedAt().then((v) => {
        if (mounted) setTs(v);
      });
    }
    listeners.add(setTs);
    return () => {
      mounted = false;
      listeners.delete(setTs);
    };
  }, []);
  return ts;
}
