export type EnvironmentKind = 'demo' | 'cloud' | 'custom';

export type Environment = {
  kind: EnvironmentKind;
  label: string;
  baseUrl: string;
  slug?: string;
};

const CLOUD_DOMAIN = 'micropowermanager.cloud';
const DEMO_SLUG = 'democompany';

export function cloudEnvironment(slug: string): Environment {
  const normalized = slug.trim().toLowerCase();
  return {
    kind: 'cloud',
    label: normalized,
    baseUrl: `https://${normalized}.${CLOUD_DOMAIN}`,
    slug: normalized,
  };
}

export function demoEnvironment(): Environment {
  return {
    kind: 'demo',
    label: 'Demo',
    baseUrl: `https://${DEMO_SLUG}.${CLOUD_DOMAIN}`,
    slug: DEMO_SLUG,
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
