import { Feather } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AgentTransaction,
  AgentTransactionPage,
  fetchTransactionsPage,
} from '@/api/agent';
import { useSession } from '@/auth/SessionContext';
import { Button, Pill, Select, Text } from '@/components';
import { fonts, radii, semantic, spacing } from '@/theme';
import {
  humanizeTransactionType,
  isShsTransaction,
  transactionPersonName,
  transactionSerial,
} from '@/utils/transactionDisplay';
import { buildTransactionDetailHref } from '@/utils/transactionRoutes';
import { useCurrency } from '@/utils/useCurrency';

type Category = 'all' | 'meter' | 'installment';
type Scope = 'today' | 'week' | 'all';

const CATEGORY_IDS: { id: Category; key: string }[] = [
  { id: 'all', key: 'paymentsList.categories.all' },
  { id: 'meter', key: 'paymentsList.categories.meter' },
  { id: 'installment', key: 'paymentsList.categories.installment' },
];

export default function PaymentsTab() {
  const { t } = useTranslation();
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const { format: formatCurrency } = useCurrency();
  const [category, setCategory] = useState<Category>('all');
  const [scope, setScope] = useState<Scope>('today');

  const scopeOptions: { value: Scope; label: string }[] = useMemo(
    () => [
      { value: 'today', label: t('paymentsList.scope.today') },
      { value: 'week', label: t('paymentsList.scope.week') },
      { value: 'all', label: t('paymentsList.scope.all') },
    ],
    [t],
  );

  const transactions = useInfiniteQuery({
    queryKey: ['agent-transactions-list'],
    queryFn: ({ pageParam }) => fetchTransactionsPage(api!, pageParam ?? 1),
    initialPageParam: 1,
    getNextPageParam: (lastPage: AgentTransactionPage) =>
      lastPage.currentPage < lastPage.lastPage
        ? lastPage.currentPage + 1
        : undefined,
    enabled: !!api,
  });

  const items = useMemo(
    () => (transactions.data?.pages ?? []).flatMap((p) => p.data),
    [transactions.data],
  );

  const filtered = useMemo(
    () => items.filter((tx) => matches(tx, category, scope)),
    [items, category, scope],
  );
  const filteredCash = filtered.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const scopeLabel = t(
    scope === 'today'
      ? 'paymentsList.scope.todayShort'
      : scope === 'week'
        ? 'paymentsList.scope.weekShort'
        : 'paymentsList.scope.allShort',
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text variant="screenTitle">{t('paymentsList.title')}</Text>
          <Text variant="meta" tone="muted">
            {filtered.length} {scopeLabel} · {formatCurrency(filteredCash)}
          </Text>
        </View>
      </View>

      <View style={styles.chipsRow}>
        {CATEGORY_IDS.map((c) => (
          <Pill
            key={c.id}
            label={t(c.key)}
            tone="neutral"
            selected={category === c.id}
            onPress={() => setCategory(c.id)}
          />
        ))}
      </View>
      <View style={styles.scopeRow}>
        <Select<Scope>
          value={scope}
          onChange={setScope}
          options={scopeOptions}
          compact
          containerStyle={styles.scopeSelect}
        />
      </View>

      <View style={styles.summary}>
        <SummaryCol
          label={t('paymentsList.cash')}
          value={formatCurrency(filteredCash)}
          tone="orange"
        />
        <SummaryCol
          label={t('paymentsList.count')}
          value={String(filtered.length)}
          tone="ink"
        />
      </View>

      {transactions.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={semantic.blue} />
        </View>
      ) : transactions.isError ? (
        <EmptyState
          icon="alert-circle"
          title={t('paymentsList.errorTitle')}
          subtitle={t('paymentsList.errorBody')}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="credit-card"
          title={
            items.length === 0
              ? t('paymentsList.noneTitle')
              : t('paymentsList.filterTitle')
          }
          subtitle={
            items.length === 0
              ? t('paymentsList.noneBody')
              : t('paymentsList.filterBody')
          }
          ctaLabel={items.length === 0 ? t('paymentsList.cta') : undefined}
          onCta={
            items.length === 0
              ? () => router.push('/(app)/payments/new')
              : undefined
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onRefresh={() => transactions.refetch()}
          refreshing={
            transactions.isFetching && !transactions.isFetchingNextPage
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (transactions.hasNextPage && !transactions.isFetchingNextPage) {
              void transactions.fetchNextPage();
            }
          }}
          ListFooterComponent={
            transactions.isFetchingNextPage || transactions.hasNextPage ? (
              <View style={styles.listFooter}>
                <ActivityIndicator color={semantic.ink3} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <TransactionRow
              transaction={item}
              formatCurrency={formatCurrency}
              t={t}
            />
          )}
        />
      )}
    </View>
  );
}

function SummaryCol({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'orange' | 'blue' | 'ink';
}) {
  const color =
    tone === 'orange'
      ? semantic.orange
      : tone === 'blue'
        ? semantic.blue
        : semantic.ink;
  return (
    <View style={styles.summaryCol}>
      <Text variant="sectionLabel" tone="muted">
        {label}
      </Text>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function TransactionRow({
  transaction,
  formatCurrency,
  t,
}: {
  transaction: AgentTransaction;
  formatCurrency: (n: number) => string;
  t: TFunction;
}) {
  const time = formatTime(transaction.created_at);
  const ref = `#${transaction.id}`;
  const typeLabel = humanizeTransactionType(
    transaction.payment_type ?? transaction.type,
  );
  const isShs = isShsTransaction(transaction);
  const serial = transactionSerial(transaction);
  const person = transactionPersonName(transaction);

  // Pick the most informative primary line we can produce from this row.
  const primary =
    person ?? serial ?? (isShs ? t('home.shsDownPayment') : typeLabel);

  return (
    <Pressable
      onPress={() => router.push(buildTransactionDetailHref(transaction))}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.rowIcon,
          isShs && { backgroundColor: 'rgba(23,69,105,0.10)' },
        ]}
      >
        <Feather
          name={isShs ? 'shopping-bag' : 'credit-card'}
          size={18}
          color={isShs ? semantic.blue : semantic.orange}
        />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTopLine}>
          <Text variant="bodyEmphasis" numberOfLines={1} style={styles.rowName}>
            {primary}
          </Text>
          <Text variant="bodyEmphasis" style={styles.rowAmount}>
            {formatCurrency(transaction.amount || 0)}
          </Text>
        </View>
        <View style={styles.rowMetaLine}>
          <Text
            variant="meta"
            tone="muted"
            numberOfLines={1}
            style={styles.rowMeta}
          >
            {time} ·{' '}
            <Text variant="mono" tone="muted">
              {ref}
            </Text>{' '}
            · {typeLabel}
          </Text>
          <View style={styles.syncedDot} />
        </View>
      </View>
    </Pressable>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  ctaLabel,
  onCta,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Feather name={icon} size={28} color={semantic.blue} />
      </View>
      <Text variant="screenTitle" style={styles.emptyTitle}>
        {title}
      </Text>
      <Text variant="meta" tone="muted" style={styles.emptySubtitle}>
        {subtitle}
      </Text>
      {ctaLabel && onCta ? (
        <Button label={ctaLabel} onPress={onCta} style={styles.emptyCta} />
      ) : null}
    </View>
  );
}

function matches(
  tx: AgentTransaction,
  category: Category,
  scope: Scope,
): boolean {
  const inScope =
    scope === 'all'
      ? true
      : scope === 'today'
        ? isToday(tx.created_at)
        : isThisWeek(tx.created_at);
  if (!inScope) return false;
  if (category === 'all') return true;
  const isInstallment = isShsTransaction(tx);
  if (category === 'installment') return isInstallment;
  if (category === 'meter') return !isInstallment;
  return true;
}

function isToday(value: string): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return d.getTime() >= start.getTime();
}

function isThisWeek(value: string): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoff;
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const sameDay = d.getTime() >= start.getTime();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  const sameYear = d.getFullYear() === start.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.paper,
  },
  pressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
    backgroundColor: semantic.paper,
  },
  scopeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: semantic.paper,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
  },
  scopeSelect: {
    width: 130,
  },
  summary: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: semantic.paper,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
  },
  summaryCol: {
    flex: 1,
    backgroundColor: semantic.bgSoft,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  summaryValue: {
    fontFamily: fonts.ptBold,
    fontSize: 18,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: semantic.orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: {
    flexShrink: 1,
  },
  rowAmount: {
    flexShrink: 0,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowMeta: {
    flexShrink: 1,
  },
  syncedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: semantic.green,
  },
  separator: {
    height: 1,
    backgroundColor: semantic.line,
  },
  listFooter: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: semantic.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
});
