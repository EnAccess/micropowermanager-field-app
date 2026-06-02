import { AxiosInstance } from 'axios';

export type CustomerAddress = {
  id: number;
  phone: string | null;
  email: string | null;
  city_id: number | null;
  is_primary: number;
  city?: { id: number; name: string } | null;
};

export type CustomerDevice = {
  id: number;
  device_serial: string;
  device_type: string;
};

export type Gender = 'male' | 'female' | 'non-binary';

export type Customer = {
  id: number;
  name: string;
  surname: string;
  is_customer: number;
  birth_date?: string | null;
  gender?: Gender | string | null;
  created_at?: string;
  addresses?: CustomerAddress[];
  devices?: CustomerDevice[];
};

export type RegisterCustomerPayload = {
  name: string;
  surname: string;
  phone: string;
  city_id: number;
  birth_date?: string | null;
  gender?: Gender | null;
  geo_points?: string | null;
};

export type AvailableMeter = {
  id: number;
  serial_number: string;
  manufacturer_id: number;
  meter_type_id: number;
};

export async function fetchAvailableMeters(
  client: AxiosInstance,
  params: { manufacturer_id?: number; meter_type_id?: number } = {},
): Promise<AvailableMeter[]> {
  const { data } = await client.get<{ data: AvailableMeter[] }>(
    '/app/agents/meters',
    { params },
  );
  return data.data ?? [];
}

export type AssignMeterPayload = {
  serial_number: string;
  manufacturer_id: number;
  meter_type_id: number;
  tariff_id: number;
  connection_group_id: number;
  connection_type_id: number;
  geo_points?: string | null;
};

export type AssignedMeter = {
  id: number;
  serial_number: string;
  tariff_id: number;
  device?: { id: number; device_serial: string; person_id: number };
};

export async function registerCustomer(
  client: AxiosInstance,
  payload: RegisterCustomerPayload,
  options: { timeoutMs?: number } = {},
): Promise<Customer> {
  const { data } = await client.post<{ data: Customer }>(
    '/app/agents/customers',
    payload,
    options.timeoutMs != null ? { timeout: options.timeoutMs } : undefined,
  );
  return data.data;
}

export async function assignMeterToCustomer(
  client: AxiosInstance,
  customerId: number,
  payload: AssignMeterPayload,
): Promise<AssignedMeter> {
  const { data } = await client.post<{ data: AssignedMeter }>(
    `/app/agents/customers/${customerId}/meters`,
    payload,
  );
  return data.data;
}

export async function fetchCustomer(
  client: AxiosInstance,
  customerId: number,
): Promise<Customer> {
  const { data } = await client.get<{ data: Customer }>(
    `/app/agents/customers/${customerId}`,
  );
  return data.data;
}

export type CustomerPage = {
  data: Customer[];
  currentPage: number;
  lastPage: number;
  total: number;
};

type LaravelPaginated<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};

export async function fetchCustomerPage(
  client: AxiosInstance,
  page = 1,
): Promise<CustomerPage> {
  const { data } = await client.get<LaravelPaginated<Customer>>(
    '/app/agents/customers',
    {
      params: { page },
    },
  );
  return {
    data: data.data ?? [],
    currentPage: data.current_page ?? page,
    lastPage: data.last_page ?? page,
    total: data.total ?? data.data?.length ?? 0,
  };
}

export async function searchCustomers(
  client: AxiosInstance,
  term: string,
): Promise<Customer[]> {
  const { data } = await client.get<
    { data: Customer[] } | LaravelPaginated<Customer>
  >('/app/agents/customers/search', { params: { term } });
  return data.data ?? [];
}

export type DeviceLookup = {
  device: CustomerDevice;
  customer: Customer;
};

export function findDeviceLookup(
  customers: Customer[],
  serial: string,
): DeviceLookup | null {
  const normalized = serial.trim();
  for (const customer of customers) {
    const match = customer.devices?.find((d) => d.device_serial === normalized);
    if (match) return { device: match, customer };
  }
  return null;
}
