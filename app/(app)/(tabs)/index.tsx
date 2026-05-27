import { Feather } from '@expo/vector-icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Href, router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AgentTransaction,
  fetchBalance,
  fetchTodaysTransactions,
} from '@/api/agent';
import { agentFullName } from '@/api/auth';
import { findDeviceLookup, searchCustomers } from '@/api/customer';
import {
  humanizeTransactionType,
  isShsTransaction,
  transactionPersonName,
  transactionSerial,
} from '@/utils/transactionDisplay';
import { useSession } from '@/auth/SessionContext';
import {
  Card,
  Fab,
  GradientHero,
  Text,
  Timeline,
  TimelineDotTone,
  TimelineItem,
} from '@/components';
import { fonts, radii, semantic, shadows, spacing } from '@/theme';
import { initials } from '@/utils/format';
import { buildTransactionDetailHref } from '@/utils/transactionRoutes';
import { useCurrency } from '@/utils/useCurrency';

const FAB_ACTIONS = [
  {
    key: 'collect',
    labelKey: 'home.fab.collect',
    icon: 'credit-card' as const,
    color: semantic.orange,
    href: '/(app)/payments/new',
  },
  {
    key: 'sell',
    labelKey: 'home.fab.sell',
    icon: 'shopping-bag' as const,
    color: semantic.blue,
    href: '/(app)/sales/new',
  },
  {
    key: 'register',
    labelKey: 'home.fab.register',
    icon: 'user-plus' as const,
    color: semantic.green,
    href: '/(app)/customers/new',
  },
] satisfies {
  key: string;
  labelKey: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  href: Href;
}[];

// TODO: fetch real notifications and show count in the bell icon badge.
const hasUnreadNotifications = false;

export default function Home() {
  const { t } = useTranslation();
  const { api, agent, refreshSession } = useSession();
  const { format: formatCurrency } = useCurrency();
  const balanceQuery = useBalance();
  const todayQuery = useTodaysTransactions();

  const todays: AgentTransaction[] = todayQuery.data ?? [];
  const cashToday = todays.reduce((sum, tx) => sum + (tx.amount || 0), 0);

  // Per-serial customer lookup for the timeline. Caches via React Query.
  // Skip transactions whose `message` is empty or "-" (SHS down payments etc.).
  const uniqueSerials = useMemo(() => {
    const set = new Set<string>();
    for (const tx of todays) {
      const s = transactionSerial(tx);
      if (s) set.add(s);
    }
    return Array.from(set);
  }, [todays]);

  const lookups = useQueries({
    queries: uniqueSerials.map((serial) => ({
      queryKey: ['transaction-lookup', serial],
      queryFn: async () => {
        const customers = await searchCustomers(api!, serial);
        return findDeviceLookup(customers, serial);
      },
      enabled: !!api && !!serial,
      staleTime: 5 * 60_000,
    })),
  });

  const customerBySerial = useMemo(() => {
    const map = new Map<string, string>();
    uniqueSerials.forEach((serial, idx) => {
      const data = lookups[idx]?.data;
      if (data?.customer) {
        map.set(
          serial,
          `${data.customer.name} ${data.customer.surname}`.trim(),
        );
      }
    });
    return map;
  }, [uniqueSerials, lookups]);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      refreshSession(),
      balanceQuery.refetch(),
      todayQuery.refetch(),
    ]);
  }, [balanceQuery, todayQuery]);

  const isRefreshing = balanceQuery.isFetching || todayQuery.isFetching;

  const fullName = agentFullName(agent);
  const greeting = t('home.greeting', { name: fullName ?? t('common.agent') });
  const initial = initials(fullName ?? agent?.email ?? 'A').slice(0, 1);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing && !balanceQuery.isLoading}
            onRefresh={onRefresh}
            tintColor={semantic.blue}
          />
        }
      >
        <GradientHero variant="blue" paddedBottom={64}>
          <View style={styles.heroTopRow}>
            <View style={styles.avatar}>
              <Text variant="bodyEmphasis" style={styles.avatarLetter}>
                {initial}
              </Text>
            </View>
            <View style={styles.heroGreeting}>
              <Text variant="bodyEmphasis" tone="onNavy" numberOfLines={1}>
                {greeting}
              </Text>
              {agent?.email ? (
                <Text variant="meta" tone="onNavyMuted" numberOfLines={1}>
                  {agent.email}
                </Text>
              ) : null}
            </View>
            <View style={styles.heroActions}>
              <Pressable
                onPress={() => {
                  // TODO: route to notifications screen once available.
                }}
                hitSlop={8}
                accessibilityLabel={t('home.notifications')}
                style={({ pressed }) => [
                  styles.heroBtn,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Feather name="bell" size={18} color={semantic.paper} />
                {hasUnreadNotifications ? (
                  <View style={styles.unreadDot} />
                ) : null}
              </Pressable>
              <Pressable
                onPress={() => router.push('/(app)/settings')}
                hitSlop={8}
                accessibilityLabel={t('settings.title')}
                style={({ pressed }) => [
                  styles.heroBtn,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Feather name="menu" size={20} color={semantic.paper} />
              </Pressable>
            </View>
          </View>

          <View style={styles.heroAmountBlock}>
            <Text
              variant="sectionLabel"
              tone="onNavyMuted"
              style={styles.heroLabel}
            >
              {t('home.collectedToday')}
            </Text>
            <Text variant="heroNumberSm" tone="onNavy">
              {formatCurrency(cashToday)}
            </Text>
            <Text variant="meta" tone="onNavyMuted">
              {todays.length === 0
                ? t('home.noPaymentsYet')
                : t('home.transactionCount', { count: todays.length })}
            </Text>
          </View>
        </GradientHero>

        <View style={styles.statsWrap}>
          <Card elevated style={styles.statsCard}>
            <StatCol
              label={t('home.stat.paymentsToday')}
              value={String(todays.length)}
              tone="orange"
            />
            <Divider />
            <StatCol
              label={t('home.stat.cashToday')}
              value={formatCurrency(cashToday)}
              tone="blue"
            />
            <Divider />
            <StatCol
              label={t('home.stat.balance')}
              value={
                balanceQuery.isLoading
                  ? '—'
                  : formatCurrency(balanceQuery.data ?? 0)
              }
              tone="green"
            />
          </Card>
        </View>

        <View style={styles.section}>
          <Text variant="sectionLabel" tone="muted" style={styles.sectionLabel}>
            {t('home.section.yourDay')}
          </Text>

          {todayQuery.isLoading ? (
            <Text variant="meta" tone="muted">
              {t('common.loading')}
            </Text>
          ) : todays.length > 0 ? (
            <Timeline
              items={buildTimeline(
                todays,
                customerBySerial,
                formatCurrency,
                t('home.shsDownPayment'),
              )}
            />
          ) : (
            <View style={styles.empty}>
              <Text variant="body" tone="muted" style={styles.emptyText}>
                {t('home.emptyToday')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Fab
        actions={FAB_ACTIONS.map((a) => ({
          key: a.key,
          label: t(a.labelKey),
          icon: a.icon,
          color: a.color,
          onPress: () => router.push(a.href),
        }))}
      />
    </View>
  );
}

type StatTone = 'orange' | 'blue' | 'green' | 'ink';

const STAT_COLOR: Record<StatTone, string> = {
  orange: semantic.orange,
  blue: semantic.blue,
  green: semantic.green,
  ink: semantic.ink,
};

function StatCol({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: string;
  tone?: StatTone;
}) {
  return (
    <View style={styles.statCol}>
      <Text
        variant="numericSmall"
        style={{ color: STAT_COLOR[tone] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text variant="meta" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.statDivider} />;
}

function useBalance() {
  const { api, agent } = useSession();
  return useQuery({
    queryKey: ['agent-balance', agent?.id],
    queryFn: () => fetchBalance(api!),
    enabled: !!api,
  });
}

function useTodaysTransactions() {
  const { api, agent } = useSession();
  return useQuery({
    queryKey: ['agent-transactions-today', agent?.id],
    queryFn: () => fetchTodaysTransactions(api!),
    enabled: !!api,
    staleTime: 30_000,
  });
}

function timelineTone(type: string): TimelineDotTone {
  const t = type.toLowerCase();
  if (t.includes('sale') || t.includes('shs')) return 'blue';
  if (t.includes('register') || t.includes('customer')) return 'green';
  return 'orange';
}

function timelineIcon(
  type: string,
): React.ComponentProps<typeof Feather>['name'] {
  const t = type.toLowerCase();
  if (t.includes('sale') || t.includes('shs')) return 'shopping-bag';
  if (t.includes('register') || t.includes('customer')) return 'user-plus';
  return 'credit-card';
}

function buildTimeline(
  transactions: AgentTransaction[],
  customerBySerial: Map<string, string>,
  formatCurrency: (n: number) => string,
  shsDownPaymentLabel: string,
): TimelineItem[] {
  return transactions.slice(0, 6).map((tx) => {
    const serial = transactionSerial(tx);
    const passedName = transactionPersonName(tx);
    const lookedUpName = serial ? customerBySerial.get(serial) : undefined;
    const isShs = isShsTransaction(tx);
    const primary =
      passedName ??
      lookedUpName ??
      serial ??
      (isShs ? shsDownPaymentLabel : humanizeTransactionType(tx.type));
    const tone = isShs ? 'blue' : timelineTone(tx.type);
    const icon = isShs ? 'shopping-bag' : timelineIcon(tx.type);

    return {
      key: String(tx.id),
      tone,
      icon,
      content: (
        <Pressable
          onPress={() => router.push(buildTransactionDetailHref(tx))}
          style={({ pressed }) => [
            styles.timelineRow,
            pressed && { opacity: 0.6 },
          ]}
        >
          <View style={styles.timelineMain}>
            <Text variant="bodyEmphasis" tone="primary" numberOfLines={1}>
              {primary}
            </Text>
            <Text variant="meta" tone="muted" numberOfLines={1}>
              {relativeTime(tx.created_at)} ·{' '}
              {humanizeTransactionType(tx.payment_type ?? tx.type)}
            </Text>
          </View>
          <Text
            variant="bodyEmphasis"
            tone="primary"
            style={styles.timelineAmount}
          >
            {formatCurrency(tx.amount || 0)}
          </Text>
        </Pressable>
      ),
    };
  });
}

function relativeTime(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.paper,
  },
  scroll: {
    paddingBottom: 160,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(119,217,247,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: semantic.sky,
  },
  avatarLetter: {
    color: semantic.paper,
    fontFamily: fonts.ptBold,
    fontSize: 16,
  },
  heroGreeting: {
    flex: 1,
    gap: 2,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: semantic.orange,
    borderWidth: 1.5,
    borderColor: semantic.blue,
  },
  heroAmountBlock: {
    marginTop: spacing.lg,
    gap: 4,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.72)',
  },
  statsWrap: {
    marginTop: -36,
    paddingHorizontal: spacing.lg,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    ...shadows.card,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: semantic.line,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  sectionLabel: {
    color: semantic.ink3,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  timelineMain: {
    flex: 1,
    gap: 2,
  },
  timelineAmount: {
    fontFamily: fonts.ptBold,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});
