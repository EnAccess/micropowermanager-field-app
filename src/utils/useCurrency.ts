import { useCallback } from 'react';

import { useSession } from '@/auth/SessionContext';
import { formatCurrency } from './format';

export function useCurrency() {
  const { appSettings } = useSession();
  const symbol = appSettings?.currency ?? null;

  const format = useCallback(
    (amount: number, overrideSymbol?: string | null) =>
      formatCurrency(amount, overrideSymbol ?? symbol),
    [symbol],
  );

  return { symbol, format };
}
