import AsyncStorage from '@react-native-async-storage/async-storage';

import { RegisterCustomerPayload } from '@/api/customer';
import { scopedKey } from '@/auth/sessionScope';

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

type Bucket = {
  cache: OutboxEntry[] | null;
  writeChain: Promise<void>;
  listeners: Set<(entries: OutboxEntry[]) => void>;
};

const buckets = new Map<string, Bucket>();

function bucketFor(scopeId: string): Bucket {
  let bucket = buckets.get(scopeId);
  if (!bucket) {
    bucket = {
      cache: null,
      writeChain: Promise.resolve(),
      listeners: new Set(),
    };
    buckets.set(scopeId, bucket);
  }
  return bucket;
}

function storageKey(scopeId: string): string {
  return scopedKey(scopeId, 'outbox.v1');
}

function archiveKey(scopeId: string): string {
  return scopedKey(scopeId, 'outbox.v1.corrupted');
}

function uuid(): string {
  // RFC 4122-ish v4 uuid using Math.random — fine for client ids; not crypto.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function readFromDisk(scopeId: string): Promise<OutboxEntry[]> {
  const raw = await AsyncStorage.getItem(storageKey(scopeId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('outbox: expected array');
    return parsed as OutboxEntry[];
  } catch (err) {
    console.warn('outbox: corrupted store, archiving and resetting', err);
    await AsyncStorage.setItem(archiveKey(scopeId), raw);
    await AsyncStorage.removeItem(storageKey(scopeId));
    return [];
  }
}

async function loadCache(scopeId: string): Promise<OutboxEntry[]> {
  const bucket = bucketFor(scopeId);
  if (bucket.cache) return bucket.cache;
  bucket.cache = await readFromDisk(scopeId);
  return bucket.cache;
}

function notify(scopeId: string) {
  const bucket = bucketFor(scopeId);
  const snapshot = bucket.cache ? [...bucket.cache] : [];
  for (const listener of bucket.listeners) listener(snapshot);
}

function persist(scopeId: string, next: OutboxEntry[]): Promise<void> {
  const bucket = bucketFor(scopeId);
  bucket.cache = next;
  // Serialize all writes through a single chain so concurrent enqueue/remove
  // calls don't clobber each other's state.
  bucket.writeChain = bucket.writeChain
    .catch(() => undefined)
    .then(() =>
      AsyncStorage.setItem(storageKey(scopeId), JSON.stringify(next)),
    );
  notify(scopeId);
  return bucket.writeChain;
}

export async function listOutbox(scopeId: string): Promise<OutboxEntry[]> {
  const entries = await loadCache(scopeId);
  return [...entries];
}

export function subscribeOutbox(
  scopeId: string,
  listener: (entries: OutboxEntry[]) => void,
): () => void {
  const bucket = bucketFor(scopeId);
  bucket.listeners.add(listener);
  // Hydrate the listener with the current snapshot if we already have one.
  if (bucket.cache) listener([...bucket.cache]);
  else
    void loadCache(scopeId).then(() =>
      listener(bucket.cache ? [...bucket.cache] : []),
    );
  return () => {
    bucket.listeners.delete(listener);
  };
}

/**
 * Drops the in-memory bucket after its on-disk keys are gone. Any listener
 * still attached is told the scope is empty first so the UI can't keep
 * rendering rows that no longer exist.
 */
export function evictOutboxScope(scopeId: string): void {
  const bucket = buckets.get(scopeId);
  if (!bucket) return;
  bucket.cache = [];
  notify(scopeId);
  buckets.delete(scopeId);
}

export class OutboxFullError extends Error {
  constructor() {
    super(`Outbox is full (max ${MAX_OUTBOX_ENTRIES} entries).`);
    this.name = 'OutboxFullError';
  }
}

export async function enqueueRegisterCustomer(
  scopeId: string,
  payload: RegisterCustomerPayload,
): Promise<RegisterCustomerOutboxEntry> {
  const entries = await loadCache(scopeId);
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
  await persist(scopeId, [...entries, entry]);
  return entry;
}

export async function removeOutboxEntry(
  scopeId: string,
  localId: string,
): Promise<void> {
  const entries = await loadCache(scopeId);
  const next = entries.filter((e) => e.local_id !== localId);
  if (next.length === entries.length) return;
  await persist(scopeId, next);
}

export async function markOutboxFailed(
  scopeId: string,
  localId: string,
  error: OutboxError,
): Promise<void> {
  const entries = await loadCache(scopeId);
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
  await persist(scopeId, next);
}

export async function bumpOutboxAttempt(
  scopeId: string,
  localId: string,
): Promise<void> {
  const entries = await loadCache(scopeId);
  const next = entries.map((e) =>
    e.local_id === localId ? { ...e, attempts: e.attempts + 1 } : e,
  );
  await persist(scopeId, next);
}

export async function retryOutboxEntry(
  scopeId: string,
  localId: string,
): Promise<void> {
  const entries = await loadCache(scopeId);
  const next = entries.map((e) =>
    e.local_id === localId
      ? { ...e, status: 'pending' as const, last_error: undefined }
      : e,
  );
  await persist(scopeId, next);
}
