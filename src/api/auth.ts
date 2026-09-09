import { AxiosInstance } from 'axios';

export type Agent = {
  id: number;
  name?: string;
  email: string;
  balance: number;
  mini_grid_id: number | null;
  mobile_device_id?: string | null;
  person?: {
    id: number;
    name?: string | null;
    surname?: string | null;
  } | null;
  miniGrid?: {
    id: number;
    name: string;
  } | null;
};

export function agentFullName(agent: Agent | null | undefined): string | null {
  if (!agent) return null;
  const first = agent.person?.name?.trim() ?? '';
  const last = agent.person?.surname?.trim() ?? '';
  const full = `${first} ${last}`.trim();
  return full !== '' ? full : null;
}

export type LoginPayload = {
  email: string;
  password: string;
};

export type AppSettings = {
  currency: string | null;
  country: string | null;
  language: string | null;
  company_name: string | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type MeResponse = {
  agent: Agent;
  settings?: AppSettings | null;
};

export async function login(
  client: AxiosInstance,
  payload: LoginPayload,
): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/app/login', payload);
  return data;
}

export async function fetchMe(
  client: AxiosInstance,
): Promise<{ agent: Agent; settings: AppSettings | null }> {
  const { data } = await client.get<MeResponse>('/app/me');
  return { agent: data.agent, settings: data.settings ?? null };
}

/**
 * `token` is passed explicitly because sign-out clears the session before
 * telling the server, so the request interceptor has nothing to attach.
 */
export async function logout(
  client: AxiosInstance,
  options: { token?: string; timeoutMs?: number } = {},
): Promise<void> {
  await client.post('/app/logout', undefined, {
    ...(options.token
      ? { headers: { Authorization: `Bearer ${options.token}` } }
      : {}),
    ...(options.timeoutMs != null ? { timeout: options.timeoutMs } : {}),
  });
}
