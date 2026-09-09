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
import { prefetchCitiesToDisk } from '@/storage/citiesCache';
import { getOrCreateDeviceId } from '@/storage/deviceId';
import { evictLastSyncedScope, markSyncedNow } from '@/storage/lastSync';
import { evictOutboxScope } from '@/storage/outbox';
import { cancelDrain, drainSettled } from '@/storage/outboxDrainer';
import {
  readJson,
  readString,
  remove,
  writeJson,
  writeString,
} from '@/storage/secureStorage';

import { migrateLegacyKeys, sessionScopeId, wipeScope } from './sessionScope';
import { fetchOnline } from './useNetworkStatus';

type SessionStatus = 'loading' | 'unauthenticated' | 'authenticated';

type SessionValue = {
  status: SessionStatus;
  environment: Environment | null;
  agent: Agent | null;
  appSettings: AppSettings | null;
  scopeId: string | null;
  api: AxiosInstance | null;
  setEnvironment: (environment: Environment) => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

const CITIES_PREFETCH_TIMEOUT_MS = 5000;
const SERVER_LOGOUT_TIMEOUT_MS = 5000;

async function clearStoredCredentials(): Promise<void> {
  await Promise.all([
    remove('accessToken'),
    remove('agent'),
    remove('appSettings'),
  ]);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [environment, setEnvironmentState] = useState<Environment | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);
  const deviceIdRef = useRef<string>('mpm-field-app');
  const apiRef = useRef<AxiosInstance | null>(null);
  const scopeRef = useRef<string | null>(null);
  const signOutRef = useRef<Promise<void> | null>(null);

  scopeRef.current = scopeId;

  const clearSessionState = useCallback(() => {
    tokenRef.current = null;
    setAgent(null);
    setAppSettings(null);
    setScopeId(null);
    scopeRef.current = null;
    setStatus('unauthenticated');
  }, []);

  /**
   * Token rejected by the server. Drops credentials and in-memory state but
   * leaves this scope's on-disk outbox alone so the same agent recovers
   * unsynced work when they sign in again. Coalesces concurrent 401s.
   */
  const forceSignOut = useCallback(async () => {
    if (signOutRef.current) return signOutRef.current;
    if (!tokenRef.current) return;
    const run = (async () => {
      cancelDrain();
      clearSessionState();
      await clearStoredCredentials();
      await drainSettled();
    })().finally(() => {
      signOutRef.current = null;
    });
    signOutRef.current = run;
    return run;
  }, [clearSessionState]);

  const api = useMemo(() => {
    if (!environment) return null;
    return createApiClient({
      environment,
      getAccessToken: () => tokenRef.current,
      getDeviceId: () => deviceIdRef.current,
      onUnauthenticated: () => {
        void forceSignOut();
      },
    });
  }, [environment, forceSignOut]);

  apiRef.current = api;

  useEffect(() => {
    void bootstrap();
  }, []);

  const refreshSession = useCallback(async () => {
    const client = apiRef.current;
    if (!client || !tokenRef.current) return;
    try {
      const me = await fetchMe(client);
      if (!tokenRef.current) return;
      setAgent(me.agent);
      setAppSettings(me.settings);
      await writeJson('agent', me.agent);
      if (me.settings) {
        await writeJson('appSettings', me.settings);
      } else {
        await remove('appSettings');
      }
      if (scopeRef.current) void markSyncedNow(scopeRef.current);
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

    const authed = !!(savedEnv && savedToken && savedAgent);
    const scope =
      savedEnv && savedAgent ? sessionScopeId(savedEnv, savedAgent) : null;

    // Hand pre-scope storage to the agent whose credentials are on the device
    // before anything reads the outbox.
    await migrateLegacyKeys(authed ? scope : null);

    if (savedEnv) setEnvironmentState(savedEnv);
    if (savedToken) tokenRef.current = savedToken;
    if (savedAgent) setAgent(savedAgent);
    if (savedSettings) setAppSettings(savedSettings);
    if (authed) setScopeId(scope);

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

  /**
   * Deliberate sign-out. Wipes every trace of this scope from the device, then
   * tells the server best-effort. Local state clears first so the UI never
   * waits on the network.
   */
  async function signOut(): Promise<void> {
    if (signOutRef.current) return signOutRef.current;
    if (status !== 'authenticated') return;
    const token = tokenRef.current;
    const client = apiRef.current;
    const scope = scopeRef.current;

    const run = (async () => {
      // Let a drain already on the wire finish under its own token rather than
      // firing it unauthenticated, then tear down.
      cancelDrain();
      await drainSettled();
      clearSessionState();
      await clearStoredCredentials();
      if (scope) {
        await wipeScope(scope);
        evictOutboxScope(scope);
        evictLastSyncedScope(scope);
      }
      if (client && token && (await fetchOnline())) {
        try {
          await logoutRequest(client, {
            token,
            timeoutMs: SERVER_LOGOUT_TIMEOUT_MS,
          });
        } catch {
          // best-effort server-side logout; local state is already gone
        }
      }
    })().finally(() => {
      signOutRef.current = null;
    });
    signOutRef.current = run;
    return run;
  }

  const value: SessionValue = {
    status,
    environment,
    agent,
    appSettings,
    scopeId,
    api,
    setEnvironment: async (next) => {
      setEnvironmentState(next);
      await writeJson('environment', next);
    },
    login: async (payload) => {
      if (!api || !environment) throw new Error('Environment not selected');
      const response = await loginRequest(api, payload);
      tokenRef.current = response.access_token;

      let me;
      try {
        await writeString('accessToken', response.access_token);
        me = await fetchMe(api);
      } catch (error) {
        // Never leave a stored token without a session behind it.
        tokenRef.current = null;
        await clearStoredCredentials();
        throw error;
      }

      const scope = sessionScopeId(environment, me.agent);
      await writeJson('agent', me.agent);
      if (me.settings) {
        await writeJson('appSettings', me.settings);
      } else {
        await remove('appSettings');
      }

      // Warm the village list while we still have connectivity — the register
      // screen is unusable without it and the agent may go offline at once.
      scopeRef.current = scope;
      await prefetchCitiesToDisk(api, scope, CITIES_PREFETCH_TIMEOUT_MS);
      void markSyncedNow(scope);

      setAgent(me.agent);
      setAppSettings(me.settings);
      setScopeId(scope);
      setStatus('authenticated');
    },
    signOut,
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
