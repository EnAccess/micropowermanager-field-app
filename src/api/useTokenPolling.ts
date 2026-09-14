import { AxiosInstance } from 'axios';
import { useEffect, useState } from 'react';

import { PaymentToken, fetchTransactionToken } from './transactions';

export type TokenStatus = 'pending' | 'ready' | 'unavailable' | 'skipped';

const POLL_INTERVAL_MS = 2000;
const MAX_ATTEMPTS = 12;

export function useTokenPolling(
  api: AxiosInstance | null,
  transactionId: number | null,
): { token: PaymentToken | null; status: TokenStatus } {
  const [token, setToken] = useState<PaymentToken | null>(null);
  const [status, setStatus] = useState<TokenStatus>(
    transactionId == null ? 'skipped' : 'pending',
  );

  useEffect(() => {
    if (!api || transactionId == null) {
      setStatus('skipped');
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const result = await fetchTransactionToken(api!, transactionId!);
        if (cancelled) return;
        if (result) {
          setToken(result);
          setStatus('ready');
          return;
        }
      } catch {
        if (cancelled) return;
      }

      attempts += 1;
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) {
        setStatus('unavailable');
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [api, transactionId]);

  return { token, status };
}
