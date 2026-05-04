import { useEffect, useState } from 'react';

import { Customer } from '@/api/customer';

import {
  OutboxEntry,
  RegisterCustomerOutboxEntry,
  subscribeOutbox,
} from './outbox';

export function useOutbox(): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  useEffect(() => subscribeOutbox(setEntries), []);
  return entries;
}

export function useRegisterCustomerOutbox(): RegisterCustomerOutboxEntry[] {
  const all = useOutbox();
  return all.filter(
    (e): e is RegisterCustomerOutboxEntry => e.kind === 'register_customer',
  );
}

/**
 * A pending outbox entry rendered as a customer-shaped object so the rest of
 * the UI can treat it like a server customer (with caveats — `_pending` flips
 * disabling for actions that need a real server id).
 */
export type PendingCustomer = Customer & {
  _pending: true;
  _local_id: string;
  _outbox_status: 'pending' | 'failed';
  _outbox_error?: string;
};

export function outboxAsCustomers(
  entries: RegisterCustomerOutboxEntry[],
): PendingCustomer[] {
  return entries.map((entry) => ({
    id: pendingIdFor(entry.local_id),
    name: entry.payload.name,
    surname: entry.payload.surname,
    is_customer: 1,
    created_at: entry.created_at,
    addresses: [
      {
        id: pendingIdFor(entry.local_id),
        phone: entry.payload.phone,
        email: null,
        city_id: entry.payload.city_id,
        is_primary: 1,
      },
    ],
    devices: [],
    _pending: true,
    _local_id: entry.local_id,
    _outbox_status: entry.status,
    _outbox_error: entry.last_error?.message,
  }));
}

/**
 * Pending customers use a synthetic numeric id so they coexist with server
 * rows in TanStack Query caches. We keep them well below the realistic server
 * id range to make collisions impossible in practice. The `_pending` flag is
 * the canonical discriminator.
 */
const PENDING_ID_BASE = -1_000_000;
function pendingIdFor(localId: string): number {
  // Fold the uuid into a stable negative integer so the same local_id always
  // produces the same synthetic id (helpful for FlatList keying).
  let hash = 0;
  for (let i = 0; i < localId.length; i++) {
    hash = (hash * 31 + localId.charCodeAt(i)) | 0;
  }
  return PENDING_ID_BASE - Math.abs(hash);
}

export function isPendingCustomer(
  customer: Customer | PendingCustomer,
): customer is PendingCustomer {
  return (customer as PendingCustomer)._pending === true;
}
