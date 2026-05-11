import { Feather } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SoldAppliance,
  SoldAppliancePage,
  fetchSoldAppliancePage,
  nextDueDate,
  saleCost,
  salePaid,
  saleCustomerName,
} from '@/api/appliances';
import { useSession } from '@/auth/SessionContext';
import { Button, Pill, StripedThumbnail, Text } from '@/components';
import { fonts, radii, semantic, shadows, spacing } from '@/theme';
import { useCurrency } from '@/utils/useCurrency';

type FilterId = 'all' | 'in_payoff' | 'paid';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in_payoff', label: 'In payoff' },
  { id: 'paid', label: 'Paid off' },
];

export default function SalesTab() {
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const { format: formatCurrency } = useCurrency();
  const [filter, setFilter] = useState<FilterId>('all');

  const sales = useInfiniteQuery({
    queryKey: ['agent-sales-list'],
    queryFn: ({ pageParam }) => fetchSoldAppliancePage(api!, pageParam ?? 1),
    initialPageParam: 1,
    getNextPageParam: (lastPage: SoldAppliancePage) =>
      lastPage.currentPage < lastPage.lastPage
        ? lastPage.currentPage + 1
        : undefined,
    enabled: !!api,
  });

  const items = useMemo(
    () => (sales.data?.pages ?? []).flatMap((page) => page.data),
    [sales.data],
  );

  const counts = useMemo(() => buildCounts(items), [items]);

  const filtered = useMemo(
    () => items.filter((s) => matches(s, filter)),
    [items, filter],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text variant="screenTitle">Your sales</Text>
          <Text variant="meta" tone="muted">
            {counts.all} system{counts.all === 1 ? '' : 's'} · all-time
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/sales/new')}
          hitSlop={8}
          style={({ pressed }) => [styles.headerCta, pressed && styles.pressed]}
        >
          <Feather name="plus" size={18} color={semantic.paper} />
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const label = f.id === 'all' ? `All ${counts.all}` : f.label;
          return (
            <Pill
              key={f.id}
              label={label}
              tone="neutral"
              selected={active}
              onPress={() => setFilter(f.id)}
            />
          );
        })}
      </View>

      {sales.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={semantic.blue} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Feather name="shopping-bag" size={28} color={semantic.blue} />
          </View>
          <Text variant="screenTitle" style={styles.emptyTitle}>
            {items.length === 0
              ? 'No sales yet'
              : 'Nothing matches this filter'}
          </Text>
          <Text variant="meta" tone="muted" style={styles.emptySubtitle}>
            {items.length === 0
              ? 'When you sell an SHS unit it will show up here.'
              : 'Try a different filter.'}
          </Text>
          {items.length === 0 ? (
            <Button
              label="Sell SHS"
              onPress={() => router.push('/(app)/sales/new')}
              style={styles.emptyCta}
            />
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.cardSep} />}
          onRefresh={() => sales.refetch()}
          refreshing={sales.isFetching && !sales.isFetchingNextPage}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (sales.hasNextPage && !sales.isFetchingNextPage) {
              void sales.fetchNextPage();
            }
          }}
          ListFooterComponent={
            sales.isFetchingNextPage || sales.hasNextPage ? (
              <View style={styles.listFooter}>
                <ActivityIndicator color={semantic.ink3} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <SaleCard sale={item} formatCurrency={formatCurrency} />
          )}
        />
      )}
    </View>
  );
}

function SaleCard({
  sale,
  formatCurrency,
}: {
  sale: SoldAppliance;
  formatCurrency: (n: number) => string;
}) {
  const cost = saleCost(sale);
  const paid = salePaid(sale);
  const left = Math.max(0, cost - paid);
  const hasCost = cost > 0;
  const progress = hasCost ? Math.min(1, paid / cost) : 0;
  const done = hasCost && progress >= 1;

  const name = sale.appliance?.name ?? 'SHS unit';
  const planLabel = describePlan(sale);
  const sizeLabel = shortLabel(name);
  const customerName = saleCustomerName(sale);
  const nextDue = nextDueDate(sale) ?? sale.first_payment_date ?? null;

  return (
    <Pressable
      onPress={() => router.push(`/(app)/sales/${sale.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHead}>
        <StripedThumbnail size={44} label={sizeLabel} />
        <View style={styles.cardHeadBody}>
          <Text variant="bodyEmphasis" numberOfLines={1}>
            {customerName ?? name}
          </Text>
          <Text variant="meta" tone="muted" numberOfLines={1}>
            {customerName ? `${name} · ${planLabel}` : planLabel}
          </Text>
        </View>
        {done ? (
          <Pill label="PAID" tone="green" />
        ) : nextDue ? (
          <Text variant="bodyEmphasis" tone="muted">
            Next {formatShortDate(nextDue)}
          </Text>
        ) : null}
      </View>

      {hasCost ? (
        <>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress * 100}%`,
                  backgroundColor: done ? semantic.green : semantic.blue,
                },
              ]}
            />
          </View>

          <View style={styles.cardFoot}>
            <Text variant="meta" tone="muted">
              Paid <Text style={styles.mono}>{formatCurrency(paid)}</Text>
            </Text>
            <Text variant="meta" tone="muted">
              Left{' '}
              <Text style={[styles.mono, done && { color: semantic.green }]}>
                {formatCurrency(left)}
              </Text>
            </Text>
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

function describePlan(sale: SoldAppliance): string {
  if (sale.payment_type === 'energy_service') return 'Energy service';
  if (sale.payment_type === 'installment') {
    return sale.tenure ? `${sale.tenure}-month plan` : 'Installment plan';
  }
  return 'Plan';
}

function matches(sale: SoldAppliance, filter: FilterId): boolean {
  if (filter === 'all') return true;
  const cost = saleCost(sale);
  const paid = salePaid(sale);
  const done = cost > 0 && paid >= cost;
  if (filter === 'paid') return done;
  if (filter === 'in_payoff') return !done;
  return true;
}

function buildCounts(items: SoldAppliance[]): Record<FilterId, number> {
  return {
    all: items.length,
    in_payoff: items.filter((s) => matches(s, 'in_payoff')).length,
    paid: items.filter((s) => matches(s, 'paid')).length,
  };
}

function shortLabel(name: string): string {
  const m = name.match(/(\d+)\s*W/i);
  return m ? `${m[1]}W` : 'SHS';
}

function formatShortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.bgSoft,
  },
  pressed: {
    opacity: 0.92,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    backgroundColor: semantic.paper,
  },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  headerCta: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: semantic.orange,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: semantic.paper,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.md,
    paddingTop: spacing.md,
  },
  cardSep: {
    height: spacing.md,
  },
  card: {
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: semantic.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardHeadBody: {
    flex: 1,
    gap: 2,
  },
  progressTrack: {
    height: 6,
    backgroundColor: semantic.line,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mono: {
    fontFamily: fonts.monoBold,
    color: semantic.ink,
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
    backgroundColor: semantic.paper,
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
