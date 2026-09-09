import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { Agent } from '@/api/auth';
import { Environment } from '@/config/environments';

const SCOPE_PREFIX = 'mpm.s';

const LEGACY_KEYS = [
  'mpm.outbox.v1',
  'mpm.outbox.v1.corrupted',
  'mpm.last_synced_at',
];
const LEGACY_CITIES_PREFIX = 'mpm.cache.cities.v1';

function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function sessionScopeId(environment: Environment, agent: Agent): string {
  const identity = `${environment.baseUrl}|${agent.email.toLowerCase()}|${agent.id}`;
  return hash(identity);
}

export function scopedKey(scopeId: string, name: string): string {
  return `${SCOPE_PREFIX}.${scopeId}.${name}`;
}

async function removeCachedDocuments(): Promise<void> {
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return;
    const files = await FileSystem.readDirectoryAsync(dir);
    await Promise.all(
      files
        .filter((name) => name.startsWith('doc-'))
        .map((name) =>
          FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }).catch(
            () => undefined,
          ),
        ),
    );
  } catch {
    // best effort — cached downloads are disposable
  }
}

export async function wipeScope(scopeId: string): Promise<void> {
  const prefix = `${SCOPE_PREFIX}.${scopeId}.`;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((key) => key.startsWith(prefix));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch (error) {
    console.warn('[scope] wipe failed', error);
  }
  await removeCachedDocuments();
}

/**
 * Pre-scope builds stored the outbox, last-sync timestamp and cities cache
 * under global keys. Hand the outbox to the agent whose credentials are on the
 * device — under the old single-session model no one else could have queued
 * them — and drop the rest.
 */
export async function migrateLegacyKeys(scopeId: string | null): Promise<void> {
  try {
    if (scopeId) {
      const raw = await AsyncStorage.getItem('mpm.outbox.v1');
      if (raw) {
        const target = scopedKey(scopeId, 'outbox.v1');
        const existing = await AsyncStorage.getItem(target);
        if (!existing) await AsyncStorage.setItem(target, raw);
      }
    }
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter(
      (key) =>
        LEGACY_KEYS.includes(key) || key.startsWith(LEGACY_CITIES_PREFIX),
    );
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch (error) {
    console.warn('[scope] legacy migration failed', error);
  }
}
