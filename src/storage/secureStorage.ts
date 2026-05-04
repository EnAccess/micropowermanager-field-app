import * as SecureStore from 'expo-secure-store';

const KEYS = {
  environment: 'mpm.environment',
  accessToken: 'mpm.access_token',
  agent: 'mpm.agent',
  appSettings: 'mpm.app_settings',
  deviceId: 'mpm.device_id',
} as const;

export type StorageKey = keyof typeof KEYS;

export async function readJson<T>(key: StorageKey): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(KEYS[key]);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(
  key: StorageKey,
  value: unknown,
): Promise<void> {
  await SecureStore.setItemAsync(KEYS[key], JSON.stringify(value));
}

export async function readString(key: StorageKey): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS[key]);
}

export async function writeString(
  key: StorageKey,
  value: string,
): Promise<void> {
  await SecureStore.setItemAsync(KEYS[key], value);
}

export async function remove(key: StorageKey): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS[key]);
}
