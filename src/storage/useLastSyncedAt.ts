import { useEffect, useState } from 'react';

import { useSession } from '@/auth/SessionContext';

import { lastSyncBucket, readLastSyncedAt } from './lastSync';

export function useLastSyncedAt(): number | null {
  const { scopeId } = useSession();
  const [ts, setTs] = useState<number | null>(null);

  useEffect(() => {
    if (!scopeId) {
      setTs(null);
      return;
    }
    let mounted = true;
    const bucket = lastSyncBucket(scopeId);
    setTs(bucket.cached ?? null);
    if (bucket.cached === undefined) {
      void readLastSyncedAt(scopeId).then((value) => {
        if (mounted) setTs(value);
      });
    }
    bucket.listeners.add(setTs);
    return () => {
      mounted = false;
      bucket.listeners.delete(setTs);
    };
  }, [scopeId]);

  return ts;
}
