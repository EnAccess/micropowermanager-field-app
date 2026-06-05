import { AgentTransaction, TransactionPerson } from '@/api/agent';

/**
 * Some transaction endpoints (e.g. SHS down payments) come back without a
 * device serial. The agent endpoint also returns "-" as a placeholder for
 * unknown serials. Non-PAYGO appliance sales carry the appliance_person id in
 * `message` rather than a serial, so they aren't a serial either.
 */
export function transactionSerial(
  tx: Pick<AgentTransaction, 'message' | 'device' | 'non_paygo_appliance'>,
): string | null {
  if (tx.non_paygo_appliance && !tx.device) return null;
  const value = tx.message?.trim();
  if (!value || value === '-') return null;
  return value;
}

export function transactionPerson(
  tx: Pick<AgentTransaction, 'person' | 'device' | 'non_paygo_appliance'>,
): TransactionPerson | null {
  return (
    tx.person ?? tx.device?.person ?? tx.non_paygo_appliance?.person ?? null
  );
}

export function transactionApplianceName(
  tx: Pick<AgentTransaction, 'non_paygo_appliance'>,
): string | null {
  const name = tx.non_paygo_appliance?.appliance?.name?.trim();
  return name ? name : null;
}

export function transactionPersonName(
  tx: Pick<AgentTransaction, 'person' | 'device' | 'non_paygo_appliance'>,
): string | null {
  const person = transactionPerson(tx);
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
