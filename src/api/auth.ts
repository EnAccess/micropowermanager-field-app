import { AxiosInstance } from 'axios';

export type Agent = {
  id: number;
  name: string;
  email: string;
  balance: number;
  mini_grid_id: number | null;
  mobile_device_id?: string | null;
};

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
  agent?: Agent;
  settings?: AppSettings | null;
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

export async function logout(client: AxiosInstance): Promise<void> {
  await client.post('/app/logout');
}
