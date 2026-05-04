import { AgentTransaction } from '@/api/agent';

/**
 * Some transaction endpoints (e.g. SHS down payments) come back without a
 * device serial. The agent endpoint also returns "-" as a placeholder for
 * unknown serials. Treat those as "no serial".
 */
export function transactionSerial(
  tx: Pick<AgentTransaction, 'message'>,
): string | null {
  const value = tx.message?.trim();
  if (!value || value === '-') return null;
  return value;
}

export function transactionPersonName(
  tx: Pick<AgentTransaction, 'person'>,
): string | null {
  const person = tx.person;
  if (!person) return null;
  const name = `${person.name ?? ''} ${person.surname ?? ''}`.trim();
  return name.length > 0 ? name : null;
}

export function isShsTransaction(
  tx: Pick<AgentTransaction, 'type' | 'payment_type' | 'device_type'>,
): boolean {
  const blob =
    `${tx.type ?? ''} ${tx.payment_type ?? ''} ${tx.device_type ?? ''}`.toLowerCase();
  return (
    blob.includes('down') ||
    blob.includes('deposit') ||
    blob.includes('appliance') ||
    blob.includes('shs') ||
    blob.includes('installment')
  );
}

export function humanizeTransactionType(value?: string | null): string {
  if (!value) return 'Payment';
  const cleaned = value.replace(/[_-]+/g, ' ').toLowerCase();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
