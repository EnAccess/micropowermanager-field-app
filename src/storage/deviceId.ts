import { readString, writeString } from './secureStorage';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await readString('deviceId');
  if (existing) return existing;

  const generated = globalThis.crypto?.randomUUID?.() ?? fallbackId();
  await writeString('deviceId', generated);
  return generated;
}

function fallbackId(): string {
  const random = Math.random().toString(16).slice(2, 14);
  return `mpm-${Date.now().toString(16)}-${random}`;
}
