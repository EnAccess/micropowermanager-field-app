import { PaymentToken } from '@/api/transactions';

export function describeTokenCredit(token: PaymentToken): string | null {
  if (token.token_amount == null) return null;
  const unit = token.token_unit ?? '';
  const amount = token.token_amount;
  if (unit === 'kWh') return `${amount.toFixed(3)} ${unit}`;
  if (unit === 'days' || unit === 'weeks' || unit === 'months') {
    return `${amount.toFixed(1)} ${unit}`;
  }
  return unit ? `${amount} ${unit}` : null;
}
