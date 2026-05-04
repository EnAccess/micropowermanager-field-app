import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';

import { Environment, apiUrl } from '@/config/environments';

export type UnauthenticatedHandler = () => void;

type ClientDependencies = {
  environment: Environment;
  getAccessToken: () => string | null;
  getDeviceId: () => string;
  onUnauthenticated?: UnauthenticatedHandler;
};

export function createApiClient({
  environment,
  getAccessToken,
  getDeviceId,
  onUnauthenticated,
}: ClientDependencies): AxiosInstance {
  const instance = axios.create({
    baseURL: apiUrl(environment, ''),
    timeout: 15_000,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    config.headers.set('device-id', getDeviceId());
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401 && onUnauthenticated) {
        onUnauthenticated();
      }
      return Promise.reject(error);
    },
  );

  return instance;
}
