import { AxiosInstance } from 'axios';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';

import {
  Agent,
  AppSettings,
  LoginPayload,
  fetchMe,
  login as loginRequest,
  logout as logoutRequest,
} from '@/api/auth';
import { createApiClient } from '@/api/client';
import { Environment } from '@/config/environments';
import { getOrCreateDeviceId } from '@/storage/deviceId';
import {
  readJson,
  readString,
  remove,
  writeJson,
  writeString,
} from '@/storage/secureStorage';

type SessionStatus = 'loading' | 'unauthenticated' | 'authenticated';

type SessionValue = {
  status: SessionStatus;
  environment: Environment | null;
  agent: Agent | null;
  appSettings: AppSettings | null;
  api: AxiosInstance | null;
  setEnvironment: (environment: Environment) => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [environment, setEnvironmentState] = useState<Environment | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const tokenRef = useRef<string | null>(null);
  const deviceIdRef = useRef<string>('mpm-field-app');
  const apiRef = useRef<AxiosInstance | null>(null);

  const api = useMemo(() => {
    if (!environment) return null;
    return createApiClient({
      environment,
      getAccessToken: () => tokenRef.current,
      getDeviceId: () => deviceIdRef.current,
      onUnauthenticated: () => {
        void clearSession();
      },
    });
  }, [environment]);

  apiRef.current = api;

  useEffect(() => {
    void bootstrap();
  }, []);

  const refreshSession = useCallback(async () => {
    const client = apiRef.current;
    if (!client || !tokenRef.current) return;
    try {
      const me = await fetchMe(client);
      setAgent(me.agent);
      setAppSettings(me.settings);
      await writeJson('agent', me.agent);
      if (me.settings) {
        await writeJson('appSettings', me.settings);
      } else {
        await remove('appSettings');
      }
    } catch (error) {
      // 401 is handled by api client `onUnauthenticated`. Surface other
      // failures so we don't silently keep stale settings (the most common
      // user-facing symptom: changed currency on the web doesn't propagate).
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status !== 401) {
        console.warn('[session] refresh failed', status ?? error);
      }
    }
  }, []);

  async function bootstrap() {
    deviceIdRef.current = await getOrCreateDeviceId();
    const [savedEnv, savedToken, savedAgent, savedSettings] = await Promise.all(
      [
        readJson<Environment>('environment'),
        readString('accessToken'),
        readJson<Agent>('agent'),
        readJson<AppSettings>('appSettings'),
      ],
    );

    if (savedEnv) setEnvironmentState(savedEnv);
    if (savedToken) tokenRef.current = savedToken;
    if (savedAgent) setAgent(savedAgent);
    if (savedSettings) setAppSettings(savedSettings);

    const authed = !!(savedEnv && savedToken && savedAgent);
    setStatus(authed ? 'authenticated' : 'unauthenticated');

    if (authed) {
      // Pull fresh server state so dashboard-side changes (currency, etc.) reach the app.
      void refreshSession();
    }
  }

  // Refresh on foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && status === 'authenticated') {
        void refreshSession();
      }
    });
    return () => sub.remove();
  }, [status, refreshSession]);

  async function clearSession() {
    tokenRef.current = null;
    setAgent(null);
    setAppSettings(null);
    await Promise.all([
      remove('accessToken'),
      remove('agent'),
      remove('appSettings'),
    ]);
    setStatus('unauthenticated');
  }

  const value: SessionValue = {
    status,
    environment,
    agent,
    appSettings,
    api,
    setEnvironment: async (next) => {
      setEnvironmentState(next);
      await writeJson('environment', next);
    },
    login: async (payload) => {
      if (!api) throw new Error('Environment not selected');
      const response = await loginRequest(api, payload);
      tokenRef.current = response.access_token;
      await writeString('accessToken', response.access_token);

      let nextAgent = response.agent ?? null;
      let nextSettings = response.settings ?? null;

      if (!nextAgent || !nextSettings) {
        const me = await fetchMe(api);
        nextAgent = nextAgent ?? me.agent;
        nextSettings = nextSettings ?? me.settings;
      }

      setAgent(nextAgent);
      setAppSettings(nextSettings);
      await writeJson('agent', nextAgent);
      if (nextSettings) {
        await writeJson('appSettings', nextSettings);
      } else {
        await remove('appSettings');
      }
      setStatus('authenticated');
    },
    logout: async () => {
      if (api) {
        try {
          await logoutRequest(api);
        } catch {
          // best-effort server-side logout; local state clears regardless
        }
      }
      await clearSession();
    },
    refreshSession,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value)
    throw new Error('useSession must be used within a SessionProvider');
  return value;
}
