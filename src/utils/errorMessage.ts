type ApiErrorResponse = {
  data?: {
    message?: string;
    errors?: Record<string, string[]>;
    data?: { message?: string };
  };
};

export function extractServerError(error: unknown, fallback = ''): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const data = (error as { response?: ApiErrorResponse }).response?.data;
    const message =
      (data?.errors ? Object.values(data.errors).flat()[0] : undefined) ??
      data?.data?.message ??
      data?.message;
    if (message) return message;
  }
  return fallback;
}
