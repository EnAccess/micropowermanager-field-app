import { Feather } from '@expo/vector-icons';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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

import { fetchAllSoldAppliances } from '@/api/appliances';
import {
  Customer,
  CustomerPage,
  fetchCustomerPage,
  searchCustomers,
} from '@/api/customer';
import { useSession } from '@/auth/SessionContext';
import { Button, Pill, SyncBanner, Text, TextField } from '@/components';
import { useDrainerStatus } from '@/storage/outboxDrainer';
import {
  PendingCustomer,
  isPendingCustomer,
  outboxAsCustomers,
  useRegisterCustomerOutbox,
} from '@/storage/useOutbox';
import { radii, semantic, shadows, spacing } from '@/theme';
import { initials } from '@/utils/format';

type FilterId = 'all' | 'meter' | 'shs' | 'today';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'meter', label: 'With meter' },
  { id: 'shs', label: 'With SHS' },
  { id: 'today', label: 'Registered today' },
];

export default function CustomersTab() {
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');

  const trimmedTerm = term.trim();
  const isSearching = trimmedTerm.length >= 2;

  const listQuery = useInfiniteQuery({
    queryKey: ['agent-customers'],
    queryFn: ({ pageParam }) => fetchCustomerPage(api!, pageParam ?? 1),
    initialPageParam: 1,
    getNextPageParam: (lastPage: CustomerPage) =>
      lastPage.currentPage < lastPage.lastPage
        ? lastPage.currentPage + 1
        : undefined,
    enabled: !!api && !isSearching,
  });

  const searchQuery = useQuery({
    queryKey: ['customer-search', trimmedTerm],
    queryFn: () => searchCustomers(api!, trimmedTerm),
    enabled: !!api && isSearching,
  });

  const queryClient = useQueryClient();
  const outboxEntries = useRegisterCustomerOutbox();
  const pendingCustomers = useMemo(
    () => outboxAsCustomers(outboxEntries),
    [outboxEntries],
  );
  const drainer = useDrainerStatus(api, queryClient);
  const pendingCount = outboxEntries.filter(
    (e) => e.status === 'pending',
  ).length;
  const failedCount = outboxEntries.filter((e) => e.status === 'failed').length;

  const baseItems = useMemo<(Customer | PendingCustomer)[]>(() => {
    const server = isSearching
      ? (searchQuery.data ?? [])
      : (listQuery.data?.pages ?? []).flatMap((p) => p.data);
    if (isSearching) {
      const term = trimmedTerm.toLowerCase();
      const matches = pendingCustomers.filter(
        (c) =>
          `${c.name} ${c.surname}`.toLowerCase().includes(term) ||
          c.addresses?.[0]?.phone?.includes(term),
      );
      return [...matches, ...server];
    }
    return [...pendingCustomers, ...server];
  }, [
    isSearching,
    searchQuery.data,
    listQuery.data,
    pendingCustomers,
    trimmedTerm,
  ]);

  // Customer.devices doesn't include sold appliances, so the only way to know
  // who owns an SHS is to walk /agents/appliances once and intersect by id.
  const soldAppliancesQuery = useQuery({
    queryKey: ['agent-sold-appliances-all'],
    queryFn: () => fetchAllSoldAppliances(api!),
    enabled: !!api,
    staleTime: 60_000,
  });

  const personIdsWithSold = useMemo(() => {
    const set = new Set<number>();
    for (const sale of soldAppliancesQuery.data ?? []) {
      if (sale.person_id) set.add(sale.person_id);
    }
    return set;
  }, [soldAppliancesQuery.data]);

  const shsNameByPerson = useMemo(() => {
    const map = new Map<number, string>();
    for (const sale of soldAppliancesQuery.data ?? []) {
      if (!sale.person_id) continue;
      const name = sale.appliance?.name?.trim();
      if (name && !map.has(sale.person_id)) map.set(sale.person_id, name);
    }
    return map;
  }, [soldAppliancesQuery.data]);

  const filtered = useMemo(
    () => baseItems.filter((c) => matchesFilter(c, filter, personIdsWithSold)),
    [baseItems, filter, personIdsWithSold],
  );

  const serverTotal =
    listQuery.data?.pages[0]?.total ??
    baseItems.filter((c) => !isPendingCustomer(c)).length;
  const totalCustomers = serverTotal + pendingCustomers.length;
  const counts = useMemo(
    () => buildFilterCounts(baseItems, personIdsWithSold, totalCustomers),
    [baseItems, personIdsWithSold, totalCustomers],
  );
  const loading = isSearching ? searchQuery.isLoading : listQuery.isLoading;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text variant="screenTitle">Customers</Text>
          <Text variant="meta" tone="muted">
            {counts[filter]} total
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/customers/new')}
          hitSlop={8}
          style={({ pressed }) => [styles.headerCta, pressed && styles.pressed]}
        >
          <Feather name="plus" size={18} color={semantic.paper} />
        </Pressable>
      </View>

      <View style={styles.searchBlock}>
        <TextField
          placeholder="Search name or phone…"
          autoCapitalize="none"
          autoCorrect={false}
          value={term}
          onChangeText={setTerm}
        />
      </View>

      <SyncBanner
        pendingCount={pendingCount}
        failedCount={failedCount}
        busy={drainer.status === 'draining'}
        offline={drainer.status === 'offline'}
        onSyncNow={drainer.drainNow}
      />

      <View style={styles.chipsRow}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          const label = f.label;
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={semantic.blue} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Feather name="users" size={28} color={semantic.blue} />
          </View>
          <Text variant="screenTitle" style={styles.emptyTitle}>
            {isSearching || filter !== 'all'
              ? 'No matches'
              : 'No customers yet'}
          </Text>
          <Text variant="meta" tone="muted" style={styles.emptySubtitle}>
            {isSearching
              ? 'Try a different search.'
              : filter !== 'all'
                ? 'Try a different filter.'
                : 'Register your first customer to get started.'}
          </Text>
          {!isSearching && filter === 'all' ? (
            <Button
              label="Register customer"
              onPress={() => router.push('/(app)/customers/new')}
              style={styles.emptyCta}
            />
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onRefresh={() => {
            if (isSearching) {
              void searchQuery.refetch();
            } else {
              void listQuery.refetch();
            }
          }}
          refreshing={
            isSearching
              ? searchQuery.isFetching
              : listQuery.isFetching && !listQuery.isFetchingNextPage
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (
              !isSearching &&
              listQuery.hasNextPage &&
              !listQuery.isFetchingNextPage
            ) {
              void listQuery.fetchNextPage();
            }
          }}
          ListFooterComponent={
            !isSearching &&
            (listQuery.isFetchingNextPage || listQuery.hasNextPage) ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={semantic.ink3} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <CustomerRow
              customer={item}
              hasShs={
                isPendingCustomer(item) ? false : personIdsWithSold.has(item.id)
              }
              shsName={
                isPendingCustomer(item)
                  ? null
                  : (shsNameByPerson.get(item.id) ?? null)
              }
              preferShs={filter === 'shs'}
            />
          )}
        />
      )}
    </View>
  );
}

function CustomerRow({
  customer,
  hasShs,
  shsName,
  preferShs,
}: {
  customer: Customer | PendingCustomer;
  hasShs: boolean;
  shsName: string | null;
  preferShs: boolean;
}) {
  const phone = primaryPhone(customer);
  const pending = isPendingCustomer(customer);
  const meta = pending
    ? null
    : describeMeta(customer, hasShs, shsName, preferShs);
  const registeredToday = isToday(customer.created_at);
  const failed = pending && customer._outbox_status === 'failed';

  return (
    <Pressable
      onPress={() => {
        if (pending) {
          // Send the user to a re-edit flow rather than a non-existent server id.
          router.push({
            pathname: '/(app)/customers/new',
            params: { retry_local_id: customer._local_id },
          });
        } else {
          router.push(`/(app)/customers/${customer.id}`);
        }
      }}
      style={({ pressed }) => [
        styles.row,
        pending && styles.rowPending,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.avatar, pending && styles.avatarPending]}>
        <Text variant="bodyEmphasis" tone={pending ? 'muted' : 'brand'}>
          {initials(`${customer.name} ${customer.surname}`)}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitle}>
          <Text variant="bodyEmphasis" numberOfLines={1} style={styles.rowName}>
            {customer.name} {customer.surname}
          </Text>
          {pending ? (
            <Pill
              label={failed ? 'SYNC FAILED' : 'PENDING SYNC'}
              tone={failed ? 'orange' : 'neutral'}
            />
          ) : registeredToday ? (
            <Pill label="NEW" tone="blue" />
          ) : null}
        </View>
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {meta ? meta : null}
          {meta && phone ? ' · ' : ''}
          {phone ?? ''}
        </Text>
        {failed && customer._outbox_error ? (
          <Text variant="meta" tone="danger" numberOfLines={2}>
            {customer._outbox_error}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={18} color={semantic.ink3} />
    </Pressable>
  );
}

function matchesFilter(
  customer: Customer | PendingCustomer,
  filter: FilterId,
  shsPersonIds: Set<number>,
): boolean {
  if (filter === 'all') return true;
  if (isPendingCustomer(customer)) {
    // Pending entries can't have meters or SHS yet, but they're trivially
    // "registered today" since they're brand new.
    return filter === 'today';
  }
  if (filter === 'meter') {
    return !!customer.devices?.some((d) => isMeter(d.device_type));
  }
  if (filter === 'shs') {
    return (
      shsPersonIds.has(customer.id) ||
      !!customer.devices?.some((d) => isShs(d.device_type))
    );
  }
  if (filter === 'today') {
    return isToday(customer.created_at);
  }
  return true;
}

function buildFilterCounts(
  customers: (Customer | PendingCustomer)[],
  shsPersonIds: Set<number>,
  total: number,
): Record<FilterId, number> {
  return {
    all: total,
    meter: customers.filter((c) => matchesFilter(c, 'meter', shsPersonIds))
      .length,
    shs: customers.filter((c) => matchesFilter(c, 'shs', shsPersonIds)).length,
    today: customers.filter((c) => matchesFilter(c, 'today', shsPersonIds))
      .length,
  };
}

function isMeter(deviceType: string): boolean {
  const t = deviceType.toLowerCase();
  return t.includes('meter');
}

function isShs(deviceType: string): boolean {
  const t = deviceType.toLowerCase();
  return t.includes('solar') || t.includes('shs');
}

function describeMeta(
  customer: Customer | PendingCustomer,
  hasShs: boolean,
  shsName: string | null,
  preferShs: boolean,
): string {
  const shsDevice = customer.devices?.find((d) => isShs(d.device_type));
  const ownsShs = hasShs || !!shsDevice;
  const shsLabel = shsName ?? shsDevice?.device_type ?? 'SHS';

  if (preferShs && ownsShs) {
    return shsLabel;
  }
  const device = customer.devices?.[0];
  const labels: string[] = [];
  if (device) {
    if (isMeter(device.device_type)) labels.push('Meter');
    else if (isShs(device.device_type)) labels.push(shsLabel);
    else labels.push(device.device_type);
  }
  if (ownsShs && !labels.includes(shsLabel)) {
    labels.push(shsLabel);
  }
  return labels.join(' · ');
}

function primaryPhone(customer: Customer | PendingCustomer): string | null {
  return (
    customer.addresses?.find((a) => a.is_primary)?.phone ??
    customer.addresses?.[0]?.phone ??
    null
  );
}

function isToday(value?: string): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return d.getTime() >= start.getTime();
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
  headerCta: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: semantic.orange,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
  searchBlock: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: semantic.paper,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowPending: {
    opacity: 0.85,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: semantic.bgSoft,
    borderWidth: 1.5,
    borderColor: semantic.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPending: {
    borderColor: semantic.line2,
    backgroundColor: semantic.paper,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    flexShrink: 1,
  },
  separator: {
    height: 1,
    backgroundColor: semantic.line,
  },
  footerLoading: {
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
