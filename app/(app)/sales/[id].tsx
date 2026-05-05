import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  ToastAndroid,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SaleRate,
  SoldAppliance,
  fetchAllSoldAppliances,
  saleCost,
  saleCustomerName,
  saleCustomerPhone,
  salePaid,
} from '@/api/appliances';
import { useSession } from '@/auth/SessionContext';
import { Button, Card, GradientHero, MonoChip, Pill, Text } from '@/components';
import { fonts, radii, semantic, shadows, spacing } from '@/theme';
import { initials } from '@/utils/format';
import { useCurrency } from '@/utils/useCurrency';

export default function SaleDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const { format: formatCurrency } = useCurrency();
  const queryClient = useQueryClient();

  const cached = useMemo(
    () => findInCachedPages(queryClient, id),
    [queryClient, id],
  );

  const fallbackQuery = useQuery({
    queryKey: ['agent-sold-appliances-all'],
    queryFn: () => fetchAllSoldAppliances(api!),
    enabled: !!api && !cached,
    staleTime: 60_000,
  });

  const sale = cached ?? fallbackQuery.data?.find((s) => s.id === id) ?? null;
  const sortedRates = useSortedRates(
    sale?.rates,
    Number(sale?.down_payment ?? 0),
  );

  if (!sale) {
    return (
      <View style={styles.loadingRoot}>
        {fallbackQuery.isLoading ? (
          <ActivityIndicator color={semantic.blue} />
        ) : (
          <>
            <Text variant="body" tone="muted">
              Sale not found.
            </Text>
            <Button label="Back" tone="ghost" onPress={() => router.back()} />
          </>
        )}
      </View>
    );
  }

  const customerId = sale.person_id ?? sale.person?.id ?? null;
  const customerName = saleCustomerName(sale) ?? 'Customer';
  const phone = saleCustomerPhone(sale);
  const cost = saleCost(sale);
  const paid = salePaid(sale);
  const remaining = Math.max(0, cost - paid);
  const hasCost = cost > 0;
  const progress = hasCost ? Math.min(1, paid / cost) : 0;
  const done = hasCost && progress >= 1;
  const isEnergyService = sale.payment_type === 'energy_service';
  const tenure = Number(sale.tenure ?? 0);
  const downPayment = Number(sale.down_payment ?? 0);
  const monthlyEstimate =
    !isEnergyService && tenure > 1
      ? Math.round(Math.max(0, cost - downPayment) / tenure)
      : 0;
  const planLabel = describePlan(sale);
  const applianceName = sale.appliance?.name ?? 'SHS unit';
  const nextRate = sortedRates.find((r) => Number(r.remaining) > 0) ?? null;

  return (
    <View style={styles.root}>
      <GradientHero variant="blue" paddedBottom={56}>
        <View style={styles.heroTopRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => [
              styles.heroBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Feather name="chevron-left" size={20} color={semantic.paper} />
          </Pressable>
          <View style={styles.heroLabel}>
            <Text variant="meta" tone="onNavyMuted">
              Sale
            </Text>
          </View>
          {phone ? (
            <Pressable
              onPress={() => Linking.openURL(`tel:${phone}`)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.heroBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Feather name="phone" size={18} color={semantic.paper} />
            </Pressable>
          ) : (
            <View style={styles.heroBtn} />
          )}
        </View>

        <View style={styles.heroIdentity}>
          <View style={styles.avatarLg}>
            <Text variant="screenTitle" tone="brand">
              {initials(customerName)}
            </Text>
          </View>
          <View style={styles.heroIdentityBody}>
            <Text variant="pageTitle" tone="onNavy" numberOfLines={1}>
              {customerName}
            </Text>
            <Text variant="meta" tone="onNavyMuted" numberOfLines={1}>
              {applianceName}
            </Text>
          </View>
        </View>
      </GradientHero>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.kpiWrap}>
          <Card elevated style={styles.kpiCard}>
            <KpiCol label="PAID" value={formatCurrency(paid)} tone="brand" />
            <KpiDivider />
            <KpiCol
              label="LEFT"
              value={formatCurrency(remaining)}
              tone="primary"
            />
            <KpiDivider />
            <KpiCol label="TOTAL" value={formatCurrency(cost)} tone="primary" />
          </Card>
        </View>

        {hasCost ? (
          <View style={styles.section}>
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
            <Text variant="meta" tone="muted" style={styles.progressMeta}>
              {done
                ? 'Fully paid off'
                : `${Math.round(progress * 100)}% paid · ${formatCurrency(remaining)} remaining`}
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text variant="sectionLabel" tone="muted" style={styles.sectionLabel}>
            PLAN
          </Text>
          <Card elevated>
            <DetailRow
              label="Type"
              value={<Pill label={planLabel} tone="blue" />}
            />
            {!isEnergyService && tenure > 0 ? (
              <DetailRow
                label="Tenure"
                value={`${tenure} month${tenure === 1 ? '' : 's'}`}
              />
            ) : null}
            {downPayment > 0 ? (
              <DetailRow
                label="Down payment"
                value={formatCurrency(downPayment)}
                mono
              />
            ) : null}
            {monthlyEstimate > 0 ? (
              <DetailRow
                label="Monthly"
                value={`${formatCurrency(monthlyEstimate)} / mo`}
                mono
              />
            ) : null}
            {sale.first_payment_date ? (
              <DetailRow
                label="First payment"
                value={formatDate(sale.first_payment_date)}
                mono
              />
            ) : null}
            {nextRate && !done ? (
              <DetailRow
                label="Next due"
                value={formatDate(nextRate.due_date)}
                mono
                last={!sale.created_at}
              />
            ) : null}
            {sale.created_at ? (
              <DetailRow
                label="Sold on"
                value={formatDate(sale.created_at)}
                mono
                last
              />
            ) : null}
          </Card>
        </View>

        <View style={styles.section}>
          <Text variant="sectionLabel" tone="muted" style={styles.sectionLabel}>
            DEVICE
          </Text>
          <Card elevated>
            <View style={styles.deviceRow}>
              <View style={styles.deviceIcon}>
                <Feather name="sun" size={20} color={semantic.orange} />
              </View>
              <View style={styles.deviceBody}>
                <Text variant="bodyEmphasis" numberOfLines={1}>
                  {applianceName}
                </Text>
                <View style={styles.deviceSerialRow}>
                  {sale.device_serial ? (
                    <MonoChip
                      value={sale.device_serial}
                      onCopy={() =>
                        copyToClipboard(sale.device_serial!, 'Serial copied')
                      }
                    />
                  ) : (
                    <Text variant="meta" tone="muted">
                      No serial recorded
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </Card>
        </View>

        {sortedRates.length > 0 ? (
          <View style={styles.section}>
            <Text
              variant="sectionLabel"
              tone="muted"
              style={styles.sectionLabel}
            >
              PAYMENT SCHEDULE
            </Text>
            <Card elevated padded={false} style={styles.scheduleCard}>
              {sortedRates.map((rate, idx) => (
                <RateRow
                  key={rate.id}
                  rate={rate}
                  formatCurrency={formatCurrency}
                  last={idx === sortedRates.length - 1}
                />
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          styles.footerRow,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <Button
          label="Customer"
          tone="ghost"
          disabled={!customerId}
          onPress={() => {
            if (customerId) {
              router.push(`/(app)/customers/${customerId}`);
            }
          }}
          style={styles.footerSecondary}
        />
        <Button
          tone="accent"
          label={done ? 'Paid off' : 'Collect payment'}
          disabled={done}
          onPress={() =>
            router.push({
              pathname: '/(app)/payments/new',
              params: sale.device_serial
                ? { serial: sale.device_serial }
                : undefined,
            })
          }
          style={styles.footerPrimary}
        />
      </View>
    </View>
  );
}

function DetailRow({
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
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text variant="meta" tone="muted" style={styles.detailLabel}>
        {label}
      </Text>
      <View style={styles.detailValue}>
        {typeof value === 'string' ? (
          mono ? (
            <Text
              variant="mono"
              numberOfLines={1}
              ellipsizeMode="middle"
              style={styles.detailValueText}
            >
              {value}
            </Text>
          ) : (
            <Text
              variant="bodyEmphasis"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.detailValueText}
            >
              {value}
            </Text>
          )
        ) : (
          value
        )}
      </View>
    </View>
  );
}

function RateRow({
  rate,
  formatCurrency,
  last,
}: {
  rate: SaleRate;
  formatCurrency: (n: number) => string;
  last: boolean;
}) {
  const cost = Number(rate.rate_cost);
  const remaining = Number(rate.remaining);
  const paid = Math.max(0, cost - remaining);
  const fullyPaid = remaining <= 0;
  const dueDate = rate.due_date ? formatDate(rate.due_date) : '—';

  return (
    <View style={[styles.rateRow, last && styles.rateRowLast]}>
      <View
        style={[
          styles.rateDot,
          { backgroundColor: fullyPaid ? semantic.green : semantic.line2 },
        ]}
      />
      <View style={styles.rateBody}>
        <Text variant="bodyEmphasis" numberOfLines={1}>
          {dueDate}
        </Text>
        <Text variant="meta" tone="muted">
          {fullyPaid
            ? `Paid ${formatCurrency(cost)}`
            : paid > 0
              ? `Partial — ${formatCurrency(paid)} of ${formatCurrency(cost)}`
              : `Due ${formatCurrency(cost)}`}
        </Text>
      </View>
      {fullyPaid ? (
        <Pill label="PAID" tone="green" />
      ) : (
        <Text variant="mono" style={styles.rateAmount}>
          {formatCurrency(remaining)}
        </Text>
      )}
    </View>
  );
}

function KpiCol({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'primary';
}) {
  const color = tone === 'brand' ? semantic.blue : semantic.ink;
  return (
    <View style={styles.kpiCol}>
      <Text variant="sectionLabel" tone="muted" style={styles.kpiLabel}>
        {label}
      </Text>
      <Text
        style={[styles.kpiValue, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

function KpiDivider() {
  return <View style={styles.kpiDivider} />;
}

function useSortedRates(
  rates: SaleRate[] | undefined,
  downPayment: number,
): SaleRate[] {
  return useMemo(() => {
    if (!rates) return [];
    const sorted = [...rates].sort((a, b) => {
      const da = new Date(a.due_date).getTime();
      const db = new Date(b.due_date).getTime();
      if (Number.isNaN(da) || Number.isNaN(db)) return 0;
      return da - db;
    });
    // The backend stores the down payment as its own paid rate
    // (rate_cost === down_payment, remaining === 0, due_date === sale time).
    // It's already surfaced in the "Down payment" plan row, so skip it here.
    if (downPayment > 0) {
      const downPaymentRounded = Math.round(downPayment);
      const skipIdx = sorted.findIndex(
        (r) =>
          Number(r.remaining) === 0 &&
          Math.round(Number(r.rate_cost)) === downPaymentRounded,
      );
      if (skipIdx !== -1) sorted.splice(skipIdx, 1);
    }
    return sorted;
  }, [rates, downPayment]);
}

function findInCachedPages(
  queryClient: ReturnType<typeof useQueryClient>,
  id: number,
): SoldAppliance | null {
  const queries = queryClient.getQueriesData<{
    pages?: { data: SoldAppliance[] }[];
  }>({ queryKey: ['agent-sales-list'] });
  for (const [, data] of queries) {
    for (const page of data?.pages ?? []) {
      const hit = page.data.find((s) => s.id === id);
      if (hit) return hit;
    }
  }
  return null;
}

function describePlan(sale: SoldAppliance): string {
  if (sale.payment_type === 'energy_service') return 'Energy service';
  if (sale.payment_type === 'installment') {
    return sale.tenure ? `${sale.tenure}-month PAYG` : 'Installment';
  }
  return 'Plan';
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

async function copyToClipboard(value: string, toast: string) {
  await Clipboard.setStringAsync(value);
  if (Platform.OS === 'android') {
    ToastAndroid.show(toast, ToastAndroid.SHORT);
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.bgSoft,
  },
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.paper,
    gap: spacing.md,
  },

  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    flex: 1,
  },
  heroIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  avatarLg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: semantic.sky,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIdentityBody: {
    flex: 1,
    gap: 2,
  },

  scrollContent: {
    paddingTop: 0,
    gap: spacing.md,
  },

  kpiWrap: {
    paddingHorizontal: spacing.md,
    marginTop: -20,
  },
  kpiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    ...shadows.card,
  },
  kpiCol: {
    flex: 1,
    paddingHorizontal: 6,
    gap: 4,
    alignItems: 'flex-start',
  },
  kpiLabel: {
    color: semantic.ink3,
  },
  kpiValue: {
    fontFamily: fonts.ptBold,
    fontSize: 20,
    lineHeight: 22,
  },
  kpiDivider: {
    width: 1,
    height: 28,
    backgroundColor: semantic.line,
  },

  section: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  sectionLabel: {
    paddingHorizontal: spacing.xs,
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
  progressMeta: {
    paddingHorizontal: spacing.xs,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
    marginHorizontal: -spacing.md,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    flexShrink: 0,
  },
  detailValue: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  detailValueText: {
    textAlign: 'right',
  },

  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: semantic.orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceBody: {
    flex: 1,
    gap: spacing.xs,
  },
  deviceSerialRow: {
    flexDirection: 'row',
  },

  scheduleCard: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
  },
  rateRowLast: {
    borderBottomWidth: 0,
  },
  rateDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  rateBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rateAmount: {
    fontFamily: fonts.monoBold,
    color: semantic.ink,
    flexShrink: 0,
    textAlign: 'right',
  },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: semantic.paper,
    borderTopWidth: 1,
    borderTopColor: semantic.line,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  footerSecondary: {
    flexBasis: 120,
    flexGrow: 0,
  },
  footerPrimary: {
    flex: 1,
  },
});
