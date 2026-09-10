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

type CitiesPage = City[] | { data: City[]; last_page?: number };

/** `timeoutMs` budgets the whole walk, so a caller on a deadline aborts instead of caching a partial list. */
export async function fetchCities(
  client: AxiosInstance,
  options: { timeoutMs?: number } = {},
): Promise<City[]> {
  const deadline =
    options.timeoutMs != null ? Date.now() + options.timeoutMs : null;
  const cities: City[] = [];

  for (let page = 1; ; page += 1) {
    const timeout = deadline != null ? deadline - Date.now() : undefined;
    if (timeout != null && timeout <= 0) {
      throw new Error('Timed out loading villages');
    }

    const { data } = await client.get<CitiesPage>(
      `${BASE}/cities?page=${page}`,
      timeout != null ? { timeout } : undefined,
    );

    if (Array.isArray(data)) return data;
    cities.push(...data.data);

    if (data.last_page == null || page >= data.last_page) return cities;
  }
}

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
