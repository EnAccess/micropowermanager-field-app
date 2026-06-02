import type { TFunction } from 'i18next';

export function formatRelativeTime(ts: number | null, t: TFunction): string {
  if (ts == null) return '';
  const ms = Date.now() - ts;
  if (!Number.isFinite(ms) || ms < 0) return t('time.justNow');
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t('time.justNow');
  if (min < 60) return t('time.minutesAgo', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('time.hoursAgo', { count: hr });
  const d = Math.floor(hr / 24);
  return t('time.daysAgo', { count: d });
}
