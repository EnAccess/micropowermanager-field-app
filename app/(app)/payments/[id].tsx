import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  ToastAndroid,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentTransaction } from '@/api/agent';
import { Customer, findDeviceLookup, searchCustomers } from '@/api/customer';
import { useSession } from '@/auth/SessionContext';
import {
  Card,
  MonoChip,
  Pill,
  ReceiptCard,
  SecondaryHeader,
  Text,
} from '@/components';
import { radii, semantic, spacing } from '@/theme';
import { initials } from '@/utils/format';
import {
  humanizeTransactionType,
  isShsTransaction,
} from '@/utils/transactionDisplay';
import { useCurrency } from '@/utils/useCurrency';

export default function TransactionDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    amount?: string;
    message?: string;
    sender?: string;
    type?: string;
    created_at?: string;
    payment_type?: string;
    device_type?: string;
    person_id?: string;
    person_name?: string;
  }>();
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const { format: formatCurrency, symbol: currency } = useCurrency();
  const queryClient = useQueryClient();

  // Prefer the freshest copy of the transaction from any cached list query
  // (the queue worker rewrites `type` from "energy" to "deferred_payment"
  // after the sale, and the list refetches pick that up). Navigation params
  // are a stale snapshot from tap-time, so we only fall back to them when
  // there's no cache hit.
  const txId = Number(params.id);
  const cachedTx = useMemo(
    () => findCachedTransaction(queryClient, txId),
    [queryClient, txId],
  );

  const amount = cachedTx
    ? Number(cachedTx.amount ?? 0)
    : Number(params.amount ?? 0);
  const rawSerial = (cachedTx?.message ?? params.message ?? '').trim();
  const serial = rawSerial && rawSerial !== '-' ? rawSerial : '';
  const reference = `Ref #${params.id}`;
  const sender = cachedTx?.sender ?? params.sender ?? null;
  const createdAt = cachedTx?.created_at ?? params.created_at ?? null;
  const txType = cachedTx?.type ?? params.type ?? '';
  const paymentType = cachedTx?.payment_type ?? params.payment_type ?? null;
  const deviceType = cachedTx?.device_type ?? params.device_type ?? null;

  const isShs = isShsTransaction({
    type: txType,
    payment_type: paymentType,
    device_type: deviceType,
  });
  const typeLabel = humanizeTransactionType(paymentType || txType);

  // The payload routed in from the list already has the customer name when
  // the agent endpoint surfaced it. If not, we *only* try the device-serial
  // lookup when there's actually a serial — SHS down payments don't have one.
  const passedPersonName =
    `${cachedTx?.person?.name ?? ''} ${cachedTx?.person?.surname ?? ''}`.trim() ||
    params.person_name?.trim() ||
    '';

  async function copySerial() {
    if (!serial) return;
    await Clipboard.setStringAsync(serial);
    if (Platform.OS === 'android') {
      ToastAndroid.show('Serial copied', ToastAndroid.SHORT);
    }
  }

  const lookupQuery = useQuery({
    queryKey: ['transaction-lookup', serial],
    queryFn: async () => {
      const customers = await searchCustomers(api!, serial);
      return findDeviceLookup(customers, serial);
    },
    enabled: !!api && !passedPersonName && serial.length > 0,
  });

  const lookedUpCustomer = lookupQuery.data?.customer ?? null;
  const customerName =
    passedPersonName ||
    (lookedUpCustomer
      ? `${lookedUpCustomer.name} ${lookedUpCustomer.surname}`.trim()
      : '');
  const phone = lookedUpCustomer ? primaryPhone(lookedUpCustomer) : null;
  const receiptCustomerName =
    customerName || (isShs ? 'SHS down payment' : '—');

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title="Payment"
        subtitle={reference}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
      >
        <ReceiptCard
          amount={formatCurrency(amount)}
          currency={currency ? `${currency} · ${typeLabel}` : typeLabel}
          customerName={receiptCustomerName}
          reference={reference}
          style={styles.receipt}
        />

        <Card padded={false} elevated style={styles.detailsCard}>
          <DataRow label="When" value={formatDateTime(createdAt) ?? '—'} />
          <DataRow
            label="For"
            value={
              <Pill
                label={typeLabel}
                tone={isShs ? 'blue' : 'orange'}
                leading={
                  <Feather
                    name={isShs ? 'shopping-bag' : 'zap'}
                    size={12}
                    color={isShs ? semantic.blue : semantic.orange}
                  />
                }
              />
            }
          />
          {serial ? (
            <DataRow
              label="Device"
              value={<MonoChip value={serial} onCopy={copySerial} />}
            />
          ) : (
            <DataRow
              label="Device"
              value={isShs ? 'No device assigned' : '—'}
            />
          )}
          {sender ? <DataRow label="Sender" value={sender} mono /> : null}
          <DataRow label="Reference" value={reference} mono last />
        </Card>

        <View style={styles.section}>
          <Text variant="sectionLabel" tone="muted" style={styles.sectionLabel}>
            CUSTOMER
          </Text>

          {customerName ? (
            <Card elevated>
              <View style={styles.customerRow}>
                <View style={styles.avatar}>
                  <Text variant="bodyEmphasis" tone="brand">
                    {initials(customerName)}
                  </Text>
                </View>
                <View style={styles.customerBody}>
                  <Text variant="bodyEmphasis" numberOfLines={1}>
                    {customerName}
                  </Text>
                  {phone ? (
                    <Text variant="meta" tone="muted" numberOfLines={1}>
                      {phone}
                    </Text>
                  ) : null}
                  {lookupQuery.data?.device ? (
                    <Text variant="meta" tone="muted" numberOfLines={1}>
                      Device ·{' '}
                      {humanizeDeviceType(lookupQuery.data.device.device_type)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>
          ) : lookupQuery.isLoading && serial ? (
            <Card elevated>
              <ActivityIndicator color={semantic.ink3} />
            </Card>
          ) : isShs ? (
            <Card elevated>
              <Text variant="meta" tone="muted">
                SHS down payments aren&apos;t linked to the customer record on
                this screen yet — open the Customers tab to find them.
              </Text>
            </Card>
          ) : serial ? (
            <Card elevated>
              <Text variant="meta" tone="muted">
                No customer matched serial{' '}
                <Text variant="mono" tone="muted">
                  {serial}
                </Text>
                .
              </Text>
            </Card>
          ) : (
            <Card elevated>
              <Text variant="meta" tone="muted">
                No customer linked.
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function DataRow({
  label,
  value,
  mono,
  last,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.dataRow, last && styles.dataRowLast]}>
      <Text variant="meta" tone="muted">
        {label}
      </Text>
      {typeof value === 'string' ? (
        mono ? (
          <Text variant="mono">{value}</Text>
        ) : (
          <Text variant="bodyEmphasis">{value}</Text>
        )
      ) : (
        value
      )}
    </View>
  );
}

function primaryPhone(customer: Customer): string | null {
  return (
    customer.addresses?.find((a) => a.is_primary)?.phone ??
    customer.addresses?.[0]?.phone ??
    null
  );
}

function humanizeDeviceType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('meter')) return 'Meter';
  if (t.includes('solar') || t.includes('shs')) return 'SHS unit';
  if (t.includes('appliance')) return 'Appliance';
  return type;
}

function findCachedTransaction(
  queryClient: ReturnType<typeof useQueryClient>,
  id: number,
): AgentTransaction | null {
  if (!Number.isFinite(id)) return null;

  // Infinite-pagination caches (payments tab, sales tab use this shape).
  const paged = queryClient.getQueriesData<{
    pages?: { data: AgentTransaction[] }[];
  }>({ queryKey: ['agent-transactions-list'] });
  for (const [, data] of paged) {
    for (const page of data?.pages ?? []) {
      const hit = page.data.find((tx) => tx.id === id);
      if (hit) return hit;
    }
  }

  // Flat array caches (home page "today" feed).
  for (const key of [['agent-transactions-today'], ['agent-transactions']]) {
    const flats = queryClient.getQueriesData<AgentTransaction[]>({
      queryKey: key,
    });
    for (const [, data] of flats) {
      const hit = data?.find((tx) => tx.id === id);
      if (hit) return hit;
    }
  }
  return null;
}

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.bgSoft,
  },
  scrollContent: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  receipt: {
    width: '100%',
  },
  detailsCard: {
    overflow: 'hidden',
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
  },
  dataRowLast: {
    borderBottomWidth: 0,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    paddingHorizontal: 4,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: semantic.bgSoft,
    borderWidth: 1.5,
    borderColor: semantic.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerBody: {
    flex: 1,
    gap: 2,
  },
});
