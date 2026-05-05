import AsyncStorage from '@react-native-async-storage/async-storage';

import type { City } from '@/api/referenceData';

const KEY_PREFIX = 'mpm.cache.cities.v1';
const CACHE_VERSION = 1;

type Envelope = {
  version: number;
  fetched_at: number;
  data: City[];
};

function keyFor(agentId: number): string {
  return `${KEY_PREFIX}:${agentId}`;
}

export async function readCachedCities(
  agentId: number,
): Promise<City[] | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(agentId));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope;
    if (env?.version !== CACHE_VERSION) return null;
    if (!Array.isArray(env.data)) return null;
    return env.data;
  } catch {
    return null;
  }
}

export async function writeCachedCities(
  agentId: number,
  cities: City[],
): Promise<void> {
  const env: Envelope = {
    version: CACHE_VERSION,
    fetched_at: Date.now(),
    data: cities,
  };
  await AsyncStorage.setItem(keyFor(agentId), JSON.stringify(env));
}

export async function clearAllCachedCities(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter((k) => k.startsWith(KEY_PREFIX));
  if (ours.length) await AsyncStorage.multiRemove(ours);
}
