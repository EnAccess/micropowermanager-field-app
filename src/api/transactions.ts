import { AxiosInstance } from 'axios';

export const CASH_PAYMENT_PROVIDER = 0;

export const INITIATE_TIMEOUT_MS = 150_000;

export type PaymentProvider = {
  id: number;
  name: string;
};

export type ProviderPaymentFields = {
  payment_provider?: number;
  payer_phone?: string;
};

export type CollectPaymentPayload = ProviderPaymentFields & {
  device_serial: string;
  amount: number;
};

export type InstallmentPaymentPayload = ProviderPaymentFields & {
  amount: number;
};

export type InitiatedPayment = {
  transactionId: number | null;
  redirectUrl: string | null;
  providerData: Record<string, unknown>;
};

export type PaymentStatus = 'processing' | 'processed' | 'failed';

export type PaymentStatusResult = {
  status: PaymentStatus;
  processed: boolean;
  transactionId: number | null;
};

export type PaymentToken = {
  id: number;
  token: string;
  token_type?: string | null;
  token_unit?: string | null;
  token_amount?: number | null;
  device_id?: number | null;
  created_at?: string;
};

export type TokenResponse = {
  transaction_id: number;
  token: PaymentToken | null;
};

function initiateConfig(fields: ProviderPaymentFields) {
  const provider = fields.payment_provider ?? CASH_PAYMENT_PROVIDER;
  return provider === CASH_PAYMENT_PROVIDER
    ? {}
    : { timeout: INITIATE_TIMEOUT_MS };
}

export function readInitiatedPayment(
  body: Record<string, unknown> | undefined | null,
  idKey: string,
): InitiatedPayment {
  const {
    [idKey]: rawId,
    redirect_url: rawRedirectUrl,
    ...providerData
  } = body ?? {};

  return {
    transactionId: typeof rawId === 'number' ? rawId : null,
    redirectUrl: typeof rawRedirectUrl === 'string' ? rawRedirectUrl : null,
    providerData,
  };
}

export async function fetchPaymentProviders(
  client: AxiosInstance,
): Promise<PaymentProvider[]> {
  const { data } = await client.get<{ data: PaymentProvider[] }>(
    '/app/agents/payment-providers',
  );
  return data.data ?? [];
}

export async function collectAgentPayment(
  client: AxiosInstance,
  payload: CollectPaymentPayload,
): Promise<InitiatedPayment> {
  const { data } = await client.post<{ data: Record<string, unknown> }>(
    '/app/agents/transactions',
    payload,
    initiateConfig(payload),
  );
  return readInitiatedPayment(data.data, 'id');
}

export async function payInstallment(
  client: AxiosInstance,
  appliancePersonId: number,
  payload: InstallmentPaymentPayload,
): Promise<InitiatedPayment> {
  const { data } = await client.post<{ data: Record<string, unknown> }>(
    `/app/agents/appliances/${appliancePersonId}/payment`,
    payload,
    initiateConfig(payload),
  );
  return readInitiatedPayment(data.data, 'transaction_id');
}

export async function fetchPaymentStatus(
  client: AxiosInstance,
  transactionId: number,
): Promise<PaymentStatusResult> {
  const { data } = await client.get<{
    data: { status: PaymentStatus; processed: boolean; transaction_id: number };
  }>(`/app/agents/transactions/${transactionId}/status`);

  return {
    status: data.data?.status ?? 'processing',
    processed: data.data?.processed ?? false,
    transactionId: data.data?.transaction_id ?? null,
  };
}

export async function fetchTransactionToken(
  client: AxiosInstance,
  transactionId: number,
): Promise<PaymentToken | null> {
  const { data } = await client.get<{ data: TokenResponse }>(
    `/app/agents/transactions/${transactionId}/token`,
  );
  return data.data?.token ?? null;
}
