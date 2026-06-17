import type { TFunction } from 'i18next';

type ApiErrorResponse = {
  status?: number;
  data?: {
    message?: string;
    errors?: Record<string, string[]>;
    data?: { message?: string };
  };
};

export function extractServerError(
  error: unknown,
  t: TFunction,
  fallbackKey = 'errors.serverTrouble',
): string {
  const fallback = t(fallbackKey);
  if (error == null) return fallback;

  if (typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: ApiErrorResponse }).response;

    const validationFirst = response?.data?.errors
      ? Object.values(response.data.errors).flat()[0]
      : undefined;
    if (validationFirst) return validationFirst;
    if (response?.data?.data?.message) return response.data.data.message;
    if (response?.data?.message) return response.data.message;

    const status = response?.status;
    if (status === 401) return t('errors.sessionExpired');
    if (status === 403) return t('errors.noPermission');
    if (status === 404) return t('errors.notFound');
    if (status === 409) return t('errors.conflict');
    if (typeof status === 'number' && status >= 500) {
      return t('errors.serverTrouble');
    }
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string') {
      const lower = msg.toLowerCase();
      if (lower.includes('network') || lower.includes('timeout')) {
        return t('errors.noConnection');
      }
      if (msg.length > 0) return msg;
    }
  }

  return fallback;
}
