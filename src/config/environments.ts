export type EnvironmentKind = 'demo' | 'cloud' | 'custom';

export type Environment = {
  kind: EnvironmentKind;
  label: string;
  baseUrl: string;
};

const CLOUD_URL = 'https://api.cloud.micropowermanager.io';
const DEMO_URL = 'https://api.demo.micropowermanager.io';

export function cloudEnvironment(): Environment {
  return {
    kind: 'cloud',
    label: 'Cloud',
    baseUrl: CLOUD_URL,
  };
}

export function demoEnvironment(): Environment {
  return {
    kind: 'demo',
    label: 'Demo',
    baseUrl: DEMO_URL,
  };
}

export function customEnvironment(baseUrl: string): Environment {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return {
    kind: 'custom',
    label: trimmed,
    baseUrl: trimmed,
  };
}

export function apiUrl(environment: Environment, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${environment.baseUrl}/api${suffix}`;
}

/** Strips protocol, path, and trailing slashes — returns just the host. */
export function environmentHost(environment: Environment): string {
  return environment.baseUrl
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\/+$/, '');
}
