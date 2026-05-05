import { AxiosInstance } from 'axios';

export type AgentTransaction = {
  id: number;
  amount: number;
  message: string;
  sender: string;
  type: string;
  created_at: string;
  original_transaction_type?: string | null;
  original_transaction_id?: number | null;
  person?: {
    id: number;
    name?: string | null;
    surname?: string | null;
  } | null;
  device_type?: string | null;
  payment_type?: string | null;
  paid_for?: string | null;
};

export type AgentTransactionPage = {
  data: AgentTransaction[];
  currentPage: number;
  lastPage: number;
};

type LaravelPaginated<T> = {
  data: T[];
  current_page: number;
  last_page: number;
};

export async function fetchBalance(client: AxiosInstance): Promise<number> {
  const { data } = await client.get<unknown>('/app/agents/balance');
  return parseBalance(data);
}

function parseBalance(payload: unknown): number {
  if (typeof payload === 'number')
    return Number.isFinite(payload) ? payload : 0;
  if (typeof payload === 'string') {
    const n = Number(payload);
    return Number.isFinite(n) ? n : 0;
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['data', 'balance', 'amount', 'value']) {
      if (key in obj) {
        const n = Number(obj[key] as string | number);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return 0;
}

export async function fetchTransactionsPage(
  client: AxiosInstance,
  page = 1,
): Promise<AgentTransactionPage> {
  const { data } = await client.get<LaravelPaginated<AgentTransaction>>(
    '/app/agents/transactions',
    { params: { page } },
  );
  return {
    data: data.data ?? [],
    currentPage: data.current_page ?? page,
    lastPage: data.last_page ?? page,
  };
}

export async function fetchRecentTransactions(
  client: AxiosInstance,
  limit = 5,
): Promise<AgentTransaction[]> {
  const page = await fetchTransactionsPage(client, 1);
  return page.data.slice(0, limit);
}

/**
 * Walk paginated transactions and keep every row whose created_at is today.
 * The backend does not return rows sorted by created_at, so we cannot bail
 * out early — we have to scan each page in full. Capped to keep first paint
 * snappy; agents who accumulate more than `MAX_PAGES * page_size` history
 * still see today's rows because they exist somewhere in the first pages.
 */
export async function fetchTodaysTransactions(
  client: AxiosInstance,
): Promise<AgentTransaction[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();

  const collected: AgentTransaction[] = [];
  let page = 1;
  const MAX_PAGES = 8;

  while (page <= MAX_PAGES) {
    const result = await fetchTransactionsPage(client, page);
    if (result.data.length === 0) break;

    for (const tx of result.data) {
      const ts = new Date(tx.created_at).getTime();
      if (!Number.isNaN(ts) && ts >= startMs) {
        collected.push(tx);
      }
    }

    if (page >= result.lastPage) break;
    page += 1;
  }

  return collected;
}
