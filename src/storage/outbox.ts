import AsyncStorage from '@react-native-async-storage/async-storage';

import { RegisterCustomerPayload } from '@/api/customer';

const STORAGE_KEY = 'mpm.outbox.v1';
const ARCHIVE_KEY = 'mpm.outbox.v1.corrupted';
const MAX_OUTBOX_ENTRIES = 200;

export type OutboxEntryKind = 'register_customer';

export type OutboxStatus = 'pending' | 'failed';

export type OutboxError = {
  code?: number;
  message: string;
};

type BaseEntry = {
  local_id: string;
  status: OutboxStatus;
  attempts: number;
  last_error?: OutboxError;
  created_at: string;
};

export type RegisterCustomerOutboxEntry = BaseEntry & {
  kind: 'register_customer';
  payload: RegisterCustomerPayload;
};

export type OutboxEntry = RegisterCustomerOutboxEntry;

let cache: OutboxEntry[] | null = null;
let writeChain: Promise<void> = Promise.resolve();
const listeners = new Set<(entries: OutboxEntry[]) => void>();

function uuid(): string {
  // RFC 4122-ish v4 uuid using Math.random — fine for client ids; not crypto.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function readFromDisk(): Promise<OutboxEntry[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('outbox: expected array');
    return parsed as OutboxEntry[];
  } catch (err) {
    console.warn('outbox: corrupted store, archiving and resetting', err);
    await AsyncStorage.setItem(ARCHIVE_KEY, raw);
    await AsyncStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

async function loadCache(): Promise<OutboxEntry[]> {
  if (cache) return cache;
  cache = await readFromDisk();
  return cache;
}

function notify() {
  const snapshot = cache ? [...cache] : [];
  for (const listener of listeners) listener(snapshot);
}

function persist(next: OutboxEntry[]): Promise<void> {
  cache = next;
  // Serialize all writes through a single chain so concurrent enqueue/remove
  // calls don't clobber each other's state.
  writeChain = writeChain
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)));
  notify();
  return writeChain;
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const entries = await loadCache();
  return [...entries];
}

export function subscribeOutbox(
  listener: (entries: OutboxEntry[]) => void,
): () => void {
  listeners.add(listener);
  // Hydrate the listener with the current snapshot if we already have one.
  if (cache) listener([...cache]);
  else void loadCache().then(() => listener(cache ? [...cache] : []));
  return () => {
    listeners.delete(listener);
  };
}

export class OutboxFullError extends Error {
  constructor() {
    super(`Outbox is full (max ${MAX_OUTBOX_ENTRIES} entries).`);
    this.name = 'OutboxFullError';
  }
}

export async function enqueueRegisterCustomer(
  payload: RegisterCustomerPayload,
): Promise<RegisterCustomerOutboxEntry> {
  const entries = await loadCache();
  if (entries.length >= MAX_OUTBOX_ENTRIES) {
    throw new OutboxFullError();
  }
  const entry: RegisterCustomerOutboxEntry = {
    local_id: uuid(),
    kind: 'register_customer',
    payload,
    status: 'pending',
    attempts: 0,
    created_at: new Date().toISOString(),
  };
  await persist([...entries, entry]);
  return entry;
}

export async function removeOutboxEntry(localId: string): Promise<void> {
  const entries = await loadCache();
  const next = entries.filter((e) => e.local_id !== localId);
  if (next.length === entries.length) return;
  await persist(next);
}

export async function markOutboxFailed(
  localId: string,
  error: OutboxError,
): Promise<void> {
  const entries = await loadCache();
  const next = entries.map((e) =>
    e.local_id === localId
      ? {
          ...e,
          status: 'failed' as const,
          attempts: e.attempts + 1,
          last_error: error,
        }
      : e,
  );
  await persist(next);
}

export async function bumpOutboxAttempt(localId: string): Promise<void> {
  const entries = await loadCache();
  const next = entries.map((e) =>
    e.local_id === localId ? { ...e, attempts: e.attempts + 1 } : e,
  );
  await persist(next);
}

export async function retryOutboxEntry(localId: string): Promise<void> {
  const entries = await loadCache();
  const next = entries.map((e) =>
    e.local_id === localId
      ? { ...e, status: 'pending' as const, last_error: undefined }
      : e,
  );
  await persist(next);
}

export async function clearOutbox(): Promise<void> {
  await persist([]);
}
