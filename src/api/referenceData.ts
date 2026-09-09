import { AxiosInstance } from 'axios';

export type City = { id: number; name: string; mini_grid_id: number | null };
export type Manufacturer = { id: number; name: string; type?: string };
export type MeterType = {
  id: number;
  online: boolean;
  phase: number;
  max_current: number;
};
export type Tariff = {
  id: number;
  name: string;
  price: number;
  currency: string;
};
export type ConnectionGroup = { id: number; name: string };
export type ConnectionType = { id: number; name: string };

async function fetchList<T>(
  client: AxiosInstance,
  path: string,
  options: { timeoutMs?: number } = {},
): Promise<T[]> {
  const { data } = await client.get<{ data: T[] } | T[]>(
    path,
    options.timeoutMs != null ? { timeout: options.timeoutMs } : undefined,
  );
  return Array.isArray(data) ? data : (data.data ?? []);
}

const BASE = '/customer-registration-app';

export const fetchCities = (
  client: AxiosInstance,
  options: { timeoutMs?: number } = {},
) => fetchList<City>(client, `${BASE}/cities`, options);
export const fetchManufacturers = (
  client: AxiosInstance,
  params: { type?: string } = {},
) =>
  fetchList<Manufacturer>(
    client,
    params.type
      ? `${BASE}/manufacturers?type=${encodeURIComponent(params.type)}`
      : `${BASE}/manufacturers`,
  );
export const fetchMeterTypes = (client: AxiosInstance) =>
  fetchList<MeterType>(client, `${BASE}/meter-types`);
export const fetchTariffs = (client: AxiosInstance) =>
  fetchList<Tariff>(client, `${BASE}/tariffs`);
export const fetchConnectionGroups = (client: AxiosInstance) =>
  fetchList<ConnectionGroup>(client, `${BASE}/connection-groups`);
export const fetchConnectionTypes = (client: AxiosInstance) =>
  fetchList<ConnectionType>(client, `${BASE}/connection-types`);
