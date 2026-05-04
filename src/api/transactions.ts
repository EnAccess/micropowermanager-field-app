import { AxiosInstance } from 'axios';

export type CollectPaymentPayload = {
  device_serial: string;
  amount: number;
};

export type CollectPaymentResult = {
  transaction_id: number | null;
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

export async function collectAgentPayment(
  client: AxiosInstance,
  payload: CollectPaymentPayload,
): Promise<CollectPaymentResult> {
  const { data } = await client.post<{ data: { id: number | null } }>(
    '/app/agents/transactions',
    payload,
  );
  return { transaction_id: data.data?.id ?? null };
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
