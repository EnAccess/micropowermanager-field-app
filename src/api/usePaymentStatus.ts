import { AxiosInstance } from 'axios';
import { useCallback, useEffect, useState } from 'react';

import { fetchPaymentStatus } from './transactions';

export type PaymentProgress =
  | 'idle'
  | 'processing'
  | 'processed'
  | 'failed'
  | 'unresolved';

const POLL_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 20;

export function usePaymentStatus(
  api: AxiosInstance | null,
  transactionId: number | null,
  enabled: boolean,
): { progress: PaymentProgress; check: () => void } {
  const [progress, setProgress] = useState<PaymentProgress>('idle');
  const [round, setRound] = useState(0);

  const check = useCallback(() => {
    setRound((previous) => previous + 1);
  }, []);

  useEffect(() => {
    if (!api || transactionId == null || !enabled) {
      setProgress('idle');
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setProgress('processing');

    async function poll() {
      try {
        const result = await fetchPaymentStatus(api!, transactionId!);
        if (cancelled) return;

        if (result.processed) {
          setProgress('processed');
          return;
        }

        if (result.status === 'failed') {
          setProgress('failed');
          return;
        }
      } catch {
        if (cancelled) return;
      }

      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        setProgress('unresolved');
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [api, transactionId, enabled, round]);

  return { progress, check };
}
