import AsyncStorage from '@react-native-async-storage/async-storage';
import { AxiosInstance } from 'axios';

import type { City } from '@/api/referenceData';
import { fetchCities } from '@/api/referenceData';
import { scopedKey } from '@/auth/sessionScope';

const CACHE_VERSION = 1;

type Envelope = {
  version: number;
  fetched_at: number;
  data: City[];
};

function keyFor(scopeId: string): string {
  return scopedKey(scopeId, 'cities.v1');
}

export async function readCachedCities(
  scopeId: string,
): Promise<City[] | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(scopeId));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope;
    if (env?.version !== CACHE_VERSION) return null;
    if (!Array.isArray(env.data)) return null;
    return env.data;
  } catch {
    return null;
  }
}

/** Never throws — a storage failure must not cost the caller the cities it fetched. */
export async function writeCachedCities(
  scopeId: string,
  cities: City[],
): Promise<void> {
  const env: Envelope = {
    version: CACHE_VERSION,
    fetched_at: Date.now(),
    data: cities,
  };
  try {
    await AsyncStorage.setItem(keyFor(scopeId), JSON.stringify(env));
  } catch {
    return;
  }
}

/**
 * Warms the on-disk cache at login so an agent who loses connectivity
 * immediately afterwards can still pick a village. Never throws — a failed
 * prefetch must not fail the sign-in.
 */
export async function prefetchCitiesToDisk(
  api: AxiosInstance,
  scopeId: string,
  timeoutMs: number,
): Promise<void> {
  try {
    const cities = await fetchCities(api, { timeoutMs });
    if (cities.length) await writeCachedCities(scopeId, cities);
  } catch {
    // the tab shell retries via usePrefetchCities
  }
}
