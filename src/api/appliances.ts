import { AxiosInstance } from 'axios';

import {
  CASH_PAYMENT_PROVIDER,
  INITIATE_TIMEOUT_MS,
  InitiatedPayment,
  ProviderPaymentFields,
  readInitiatedPayment,
} from './transactions';

export type AppliancePaymentType = 'installment' | 'energy_service';

export type ApplianceType = {
  id: number;
  name: string;
  type?: string;
  category?: string;
};

export type AgentAssignedAppliance = {
  id: number;
  cost: number;
  appliance_id?: number;
  appliance?: {
    id: number;
    name: string;
    type?: string;
    category?: string;
    appliance_type_id?: number;
    appliance_type?: {
      id: number;
      name: string;
      paygo_enabled?: boolean;
    } | null;
    asset_type?: { id: number; name: string } | null;
  };
  appliance_type?: ApplianceType | null;
};

export async function fetchAgentAssignedAppliances(
  client: AxiosInstance,
): Promise<AgentAssignedAppliance[]> {
  const { data } = await client.get<{ data: AgentAssignedAppliance[] }>(
    '/app/agents/appliance_types',
  );
  return data.data ?? [];
}

export type UnassignedDeviceType = 'solar_home_system' | 'e_bike';

export type UnassignedDevice = {
  id: number;
  person_id: number | null;
  device_type: UnassignedDeviceType | string;
  device_id: number;
  device_serial: string;
  device?: {
    id: number;
    appliance_id: number;
    serial_number: string;
    manufacturer_id?: number;
    manufacturer?: { id: number; name: string; type?: string } | null;
    appliance?: {
      id: number;
      name: string;
      price?: number;
    } | null;
  } | null;
};

export async function fetchUnassignedDevices(
  client: AxiosInstance,
  applianceId: number,
  type: UnassignedDeviceType,
): Promise<UnassignedDevice[]> {
  const { data } = await client.get<{ data: UnassignedDevice[] }>(
    '/app/agents/devices/unassigned',
    { params: { appliance_id: applianceId, type } },
  );
  return data.data ?? [];
}

export type RatePaymentHistory = {
  id: number;
  transaction_id: number | null;
  amount?: number | null;
};

export type SaleRate = {
  id: number;
  rate_cost: number;
  remaining: number;
  due_date: string;
  created_at?: string;
  payment_histories?: RatePaymentHistory[];
};

export function ratePaymentTransactionIds(rate: SaleRate): number[] {
  return (rate.payment_histories ?? [])
    .map((history) => history.transaction_id)
    .filter((id): id is number => typeof id === 'number');
}

export type SalePerson = {
  id: number;
  name: string;
  surname: string;
  addresses?: { phone: string | null; is_primary?: number }[];
};

export type SoldAppliance = {
  id: number;
  person_id: number;
  agent_assigned_appliance_id: number;
  payment_type?: AppliancePaymentType | null;
  down_payment?: number | null;
  tenure?: number | null;
  first_payment_date?: string | null;
  total_paid?: number | null;
  total_cost?: number | null;
  minimum_payable_amount?: number | null;
  device_serial?: string | null;
  created_at?: string;
  appliance?: {
    id: number;
    name?: string;
    cost?: number;
  } | null;
  person?: SalePerson | null;
  rates?: SaleRate[];
};

export async function fetchCustomerSoldAppliances(
  client: AxiosInstance,
  customerId: number,
): Promise<SoldAppliance[]> {
  const { data } = await client.get<{ data: SoldAppliance[] }>(
    `/app/agents/appliances/${customerId}`,
  );
  return data.data ?? [];
}

export type SoldAppliancePage = {
  data: SoldAppliance[];
  currentPage: number;
  lastPage: number;
};

type LaravelPaginated<T> = {
  data: T[];
  current_page: number;
  last_page: number;
};

export async function fetchSoldAppliancePage(
  client: AxiosInstance,
  page = 1,
): Promise<SoldAppliancePage> {
  const { data } = await client.get<LaravelPaginated<SoldAppliance>>(
    '/app/agents/appliances',
    {
      params: { page },
    },
  );
  return {
    data: data.data ?? [],
    currentPage: data.current_page ?? page,
    lastPage: data.last_page ?? page,
  };
}

/**
 * Walk every page of /agents/appliances and return the union. Bounded so a
 * very long sales history doesn't block the UI; Customers/With SHS uses this
 * because customer.devices doesn't carry appliance assignments.
 */
export async function fetchAllSoldAppliances(
  client: AxiosInstance,
): Promise<SoldAppliance[]> {
  const collected: SoldAppliance[] = [];
  let page = 1;
  const MAX_PAGES = 15;
  while (page <= MAX_PAGES) {
    const result = await fetchSoldAppliancePage(client, page);
    if (result.data.length === 0) break;
    collected.push(...result.data);
    if (page >= result.lastPage) break;
    page += 1;
  }
  return collected;
}

export type SellAppliancePayload = ProviderPaymentFields & {
  person_id: number;
  agent_assigned_appliance_id: number;
  payment_type: AppliancePaymentType;
  rate_type?: 'monthly' | 'weekly';
  down_payment?: number;
  tenure?: number;
  first_payment_date?: string;
  device_serial?: string | null;
  price_per_day?: number;
  minimum_payable_amount?: number;
};

export async function sellAppliance(
  client: AxiosInstance,
  payload: SellAppliancePayload,
): Promise<InitiatedPayment> {
  const { data } = await client.post<{ data: Record<string, unknown> }>(
    '/app/agents/appliances',
    payload,
    (payload.payment_provider ?? CASH_PAYMENT_PROVIDER) ===
      CASH_PAYMENT_PROVIDER
      ? {}
      : { timeout: INITIATE_TIMEOUT_MS },
  );
  return readInitiatedPayment(data.data, 'transaction_id');
}

export function saleCost(sale: SoldAppliance): number {
  return sale.total_cost ?? sale.appliance?.cost ?? 0;
}

export function nextPayableRate(sale: SoldAppliance): SaleRate | null {
  if (!sale.rates?.length) return null;
  let earliest: SaleRate | null = null;
  let earliestTime = Number.POSITIVE_INFINITY;
  for (const rate of sale.rates) {
    if (rate.remaining <= 0) continue;
    const t = new Date(rate.due_date).getTime();
    if (Number.isNaN(t)) continue;
    if (t < earliestTime) {
      earliest = rate;
      earliestTime = t;
    }
  }
  return earliest;
}

export function nextDueDate(sale: SoldAppliance): string | null {
  return nextPayableRate(sale)?.due_date ?? null;
}

export function installmentFloor(sale: SoldAppliance): number {
  if (sale.payment_type === 'energy_service') {
    return Math.max(0, sale.minimum_payable_amount ?? 0);
  }
  return Math.max(0, nextPayableRate(sale)?.remaining ?? 0);
}

export function installmentCeiling(sale: SoldAppliance): number {
  if (sale.payment_type === 'energy_service') return 0;
  return (sale.rates ?? []).reduce(
    (total, rate) => total + Math.max(0, rate.remaining),
    0,
  );
}

export function salePaid(sale: SoldAppliance): number {
  if (sale.total_paid != null) return sale.total_paid;
  const downPayment = sale.down_payment ?? 0;
  if (!sale.rates) return downPayment;

  // The backend records the down payment as its own paid rate
  // (rate_cost === down_payment, remaining === 0). Skip it once when summing
  // so we can add `down_payment` unconditionally — that way the paid total is
  // correct whether or not the down-payment rate made it into the response.
  const downPaymentRounded = Math.round(downPayment);
  let downPaymentSkipped = false;
  let installmentsPaid = 0;
  for (const rate of sale.rates) {
    const cost = rate.rate_cost;
    const remaining = rate.remaining;
    if (
      !downPaymentSkipped &&
      downPayment > 0 &&
      remaining === 0 &&
      Math.round(cost) === downPaymentRounded
    ) {
      downPaymentSkipped = true;
      continue;
    }
    installmentsPaid += Math.max(0, cost - remaining);
  }
  return downPayment + installmentsPaid;
}

export function saleCustomerName(sale: SoldAppliance): string | null {
  if (!sale.person) return null;
  return (
    `${sale.person.name ?? ''} ${sale.person.surname ?? ''}`.trim() || null
  );
}

export function saleCustomerPhone(sale: SoldAppliance): string | null {
  const addresses = sale.person?.addresses;
  if (!addresses?.length) return null;
  return (
    addresses.find((a) => a.is_primary)?.phone ?? addresses[0].phone ?? null
  );
}

const APPLIANCE_TYPE_SHS = 1;
const APPLIANCE_TYPE_E_BIKE = 2;

export function isSolarHomeSystem(assignment: AgentAssignedAppliance): boolean {
  const descriptors = [
    assignment.appliance?.type,
    assignment.appliance?.category,
    assignment.appliance?.appliance_type?.name,
    assignment.appliance?.asset_type?.name,
    assignment.appliance_type?.type,
    assignment.appliance_type?.category,
    assignment.appliance_type?.name,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());

  if (descriptors.length === 0) return true; // no discriminator surfaced — show the appliance
  return descriptors.some(
    (value) => value.includes('shs') || value.includes('solar'),
  );
}

export function isPaygoAppliance(assignment: AgentAssignedAppliance): boolean {
  const paygoEnabled = assignment.appliance?.appliance_type?.paygo_enabled;
  if (typeof paygoEnabled === 'boolean') return paygoEnabled;
  return isSolarHomeSystem(assignment);
}

export function applianceDeviceType(
  assignment: AgentAssignedAppliance,
): UnassignedDeviceType | null {
  switch (assignment.appliance?.appliance_type_id) {
    case APPLIANCE_TYPE_SHS:
      return 'solar_home_system';
    case APPLIANCE_TYPE_E_BIKE:
      return 'e_bike';
    default:
      return isSolarHomeSystem(assignment) ? 'solar_home_system' : null;
  }
}
