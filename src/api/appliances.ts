import { AxiosInstance } from 'axios';

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

export type SaleRate = {
  id: number;
  rate_cost: number;
  remaining: number;
  due_date: string;
  created_at?: string;
};

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

export type SellAppliancePayload = {
  person_id: number;
  agent_assigned_appliance_id: number;
  payment_type: AppliancePaymentType;
  down_payment?: number;
  tenure?: number;
  first_payment_date?: string;
  device_serial?: string | null;
};

export async function sellAppliance(
  client: AxiosInstance,
  payload: SellAppliancePayload,
): Promise<void> {
  await client.post('/app/agents/appliances', payload);
}

export function saleCost(sale: SoldAppliance): number {
  return Number(sale.total_cost ?? sale.appliance?.cost ?? 0);
}

export function salePaid(sale: SoldAppliance): number {
  if (sale.total_paid != null) return Number(sale.total_paid);
  const downPayment = Number(sale.down_payment ?? 0);
  if (!sale.rates) return downPayment;

  // The backend records the down payment as its own paid rate
  // (rate_cost === down_payment, remaining === 0). Skip it once when summing
  // so we can add `down_payment` unconditionally — that way the paid total is
  // correct whether or not the down-payment rate made it into the response.
  const downPaymentRounded = Math.round(downPayment);
  let downPaymentSkipped = false;
  let installmentsPaid = 0;
  for (const rate of sale.rates) {
    const cost = Number(rate.rate_cost);
    const remaining = Number(rate.remaining);
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

export function isSolarHomeSystem(assignment: AgentAssignedAppliance): boolean {
  const descriptors = [
    assignment.appliance?.type,
    assignment.appliance?.category,
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
