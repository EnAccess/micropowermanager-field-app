import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import type { ComponentProps } from 'react';
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
  SoldAppliance,
  fetchCustomerSoldAppliances,
  salePaid,
} from '@/api/appliances';
import { Customer, CustomerDevice, fetchCustomer } from '@/api/customer';
import { useSession } from '@/auth/SessionContext';
import {
  Button,
  Card,
  DocumentSection,
  GradientHero,
  MonoChip,
  Pill,
  Text,
} from '@/components';
import { fonts, radii, semantic, shadows, spacing } from '@/theme';
import { initials } from '@/utils/format';
import { useCurrency } from '@/utils/useCurrency';

export default function CustomerDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const { format: formatCurrency } = useCurrency();

  const customerQuery = useQuery({
    queryKey: ['customer-detail', id],
    queryFn: () => fetchCustomer(api!, id),
    enabled: !!api && Number.isFinite(id),
  });

  const salesQuery = useQuery({
    queryKey: ['sold-appliances', id],
    queryFn: () => fetchCustomerSoldAppliances(api!, id),
    enabled: !!api && Number.isFinite(id),
  });

  const customer = customerQuery.data ?? null;

  if (customerQuery.isLoading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={semantic.blue} />
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.loadingRoot}>
        <Text variant="body" tone="muted">
          Customer not found.
        </Text>
        <Button label="Back" tone="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const fullName = `${customer.name} ${customer.surname}`.trim();
  const phone = primaryPhone(customer);
  const since = formatSince(customer.created_at);
  const allDevices = customer.devices ?? [];
  const sales = salesQuery.data ?? [];
  // Sold SHS units appear in both customer.devices (as a Device row) and the
  // sales list (as an AppliancePerson row referencing the same serial). Show
  // the device once, attached to its sale when there is one.
  const saleSerials = new Set(
    sales.map((s) => s.device_serial?.trim()).filter((v): v is string => !!v),
  );
  const meters = allDevices.filter(
    (d) => !saleSerials.has(d.device_serial.trim()),
  );
  const totalPaid = sales.reduce((sum, s) => sum + salePaid(s), 0);
  const deviceCount = meters.length + sales.length;

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
              Customer
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
              {initials(fullName)}
            </Text>
          </View>
          <View style={styles.heroIdentityBody}>
            <Text variant="pageTitle" tone="onNavy" numberOfLines={1}>
              {fullName}
            </Text>
            {phone ? (
              <View style={styles.phoneRow}>
                <Feather name="phone" size={12} color={semantic.paper} />
                <Text variant="meta" tone="onNavyMuted">
                  {phone}
                </Text>
              </View>
            ) : null}
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
            <KpiCol label="DEVICES" value={String(deviceCount)} tone="brand" />
            <KpiDivider />
            <KpiCol
              label="PAID YTD"
              value={formatCurrency(totalPaid)}
              tone="brand"
            />
            <KpiDivider />
            <KpiCol label="SINCE" value={since ?? '—'} tone="primary" />
          </Card>
        </View>

        <View style={styles.section}>
          <DocumentSection customerId={id} />
        </View>

        {deviceCount > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="sectionLabel" tone="muted">
                DEVICES
              </Text>
              <Pressable
                onPress={() => router.push(`/(app)/customers/${id}/add-meter`)}
                hitSlop={8}
              >
                <Text variant="label" tone="brand">
                  + Assign meter
                </Text>
              </Pressable>
            </View>
            <View style={styles.deviceList}>
              {meters.map((d) => (
                <MeterCard
                  key={`meter-${d.id}`}
                  device={d}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/payments/new',
                      params: { serial: d.device_serial },
                    })
                  }
                />
              ))}
              {sales.map((s) => (
                <ApplianceCard
                  key={`sale-${s.id}`}
                  sale={s}
                  formatCurrency={formatCurrency}
                  onPress={
                    s.device_serial
                      ? () =>
                          router.push({
                            pathname: '/(app)/payments/new',
                            params: { serial: s.device_serial! },
                          })
                      : undefined
                  }
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Card elevated style={styles.emptyDevicesCard}>
              <Feather name="zap" size={28} color={semantic.blue} />
              <Text variant="bodyEmphasis" style={styles.emptyDevicesTitle}>
                No devices yet
              </Text>
              <Text variant="meta" tone="muted" style={styles.emptyDevicesBody}>
                Assign a meter to start collecting payments.
              </Text>
              <Button
                tone="accent"
                label="Assign meter"
                onPress={() => router.push(`/(app)/customers/${id}/add-meter`)}
                style={styles.emptyDevicesCta}
              />
            </Card>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          styles.footerRow,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <Pressable
          onPress={() => phone && Linking.openURL(`tel:${phone}`)}
          disabled={!phone}
          style={({ pressed }) => [
            styles.phoneCta,
            !phone && { opacity: 0.4 },
            pressed && phone && { opacity: 0.6 },
          ]}
        >
          <Feather name="phone" size={18} color={semantic.ink2} />
        </Pressable>
        <Button
          tone="accent"
          label="Collect payment"
          onPress={() => router.push('/(app)/payments/new')}
          style={styles.collectCta}
        />
      </View>
    </View>
  );
}

async function copyToClipboard(value: string, toast: string) {
  await Clipboard.setStringAsync(value);
  if (Platform.OS === 'android') {
    ToastAndroid.show(toast, ToastAndroid.SHORT);
  }
}

function MeterCard({
  device,
  onPress,
}: {
  device: CustomerDevice;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [pressed && onPress && { opacity: 0.7 }]}
    >
      <Card elevated>
        <View style={styles.deviceRow}>
          <View style={styles.deviceIcon}>
            <Feather
              name={deviceIcon(device.device_type)}
              size={20}
              color={semantic.blue}
            />
          </View>
          <View style={styles.deviceBody}>
            <Text variant="bodyEmphasis" numberOfLines={1}>
              {humanizeDeviceType(device.device_type)}
            </Text>
            <View style={styles.deviceSerialRow}>
              <MonoChip
                value={device.device_serial}
                onCopy={() =>
                  copyToClipboard(device.device_serial, 'Serial copied')
                }
              />
            </View>
          </View>
          {onPress ? (
            <Feather name="chevron-right" size={18} color={semantic.ink3} />
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

function ApplianceCard({
  sale,
  formatCurrency,
  onPress,
}: {
  sale: SoldAppliance;
  formatCurrency: (n: number) => string;
  onPress?: () => void;
}) {
  const name = sale.appliance?.name ?? 'SHS unit';
  const cost = sale.total_cost ?? sale.appliance?.cost ?? 0;
  const paid = salePaid(sale);
  const hasCost = cost > 0;
  const done = hasCost && paid >= cost;
  const progress = hasCost ? Math.min(1, paid / cost) : 0;
  const planLabel =
    sale.payment_type === 'energy_service'
      ? 'Energy service'
      : sale.payment_type === 'installment'
        ? sale.tenure
          ? `${sale.tenure}-month plan`
          : 'Installment plan'
        : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [pressed && onPress && { opacity: 0.7 }]}
    >
      <Card elevated>
        <View style={styles.deviceRow}>
          <View style={[styles.deviceIcon, styles.applianceIcon]}>
            <Feather
              name={applianceIcon(sale.appliance?.name)}
              size={20}
              color={semantic.orange}
            />
          </View>
          <View style={styles.deviceBody}>
            <View style={styles.applianceTitleRow}>
              <Text
                variant="bodyEmphasis"
                numberOfLines={1}
                style={styles.applianceName}
              >
                {name}
              </Text>
              {done ? <Pill label="PAID" tone="green" /> : null}
            </View>
            {planLabel ? (
              <Text variant="meta" tone="muted">
                {planLabel}
              </Text>
            ) : null}
            <View style={styles.deviceSerialRow}>
              {sale.device_serial ? (
                <MonoChip
                  value={sale.device_serial}
                  onCopy={() =>
                    copyToClipboard(sale.device_serial!, 'Serial copied')
                  }
                />
              ) : (
                <MonoChip
                  value={`Sale #${sale.id}`}
                  onCopy={() =>
                    copyToClipboard(String(sale.id), 'Sale ID copied')
                  }
                />
              )}
            </View>
          </View>
          {onPress ? (
            <Feather name="chevron-right" size={18} color={semantic.ink3} />
          ) : null}
        </View>
        {hasCost ? (
          <>
            <View style={styles.applianceProgress}>
              <View
                style={[
                  styles.applianceProgressFill,
                  {
                    width: `${progress * 100}%`,
                    backgroundColor: done ? semantic.green : semantic.blue,
                  },
                ]}
              />
            </View>
            <View style={styles.applianceFoot}>
              <Text variant="meta" tone="muted">
                Paid <Text style={styles.mono}>{formatCurrency(paid)}</Text>
              </Text>
              <Text variant="meta" tone="muted">
                Total <Text style={styles.mono}>{formatCurrency(cost)}</Text>
              </Text>
            </View>
          </>
        ) : null}
      </Card>
    </Pressable>
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

function primaryPhone(customer: Customer): string | null {
  return (
    customer.addresses?.find((a) => a.is_primary)?.phone ??
    customer.addresses?.[0]?.phone ??
    null
  );
}

function formatSince(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function humanizeDeviceType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('meter')) return 'Meter';
  if (t.includes('solar') || t.includes('shs')) return 'SHS unit';
  if (t.includes('bike') || t.includes('bms')) return 'E-bike';
  return type;
}

function deviceIcon(type: string): ComponentProps<typeof Feather>['name'] {
  const t = type.toLowerCase();
  if (t.includes('meter')) return 'zap';
  if (t.includes('solar') || t.includes('shs')) return 'sun';
  if (t.includes('bike') || t.includes('bms')) return 'battery-charging';
  return 'cpu';
}

function applianceIcon(name?: string): ComponentProps<typeof Feather>['name'] {
  const n = (name ?? '').toLowerCase();
  if (n.includes('solar') || n.includes('shs') || n.includes('sun'))
    return 'sun';
  if (n.includes('bike') || n.includes('bms')) return 'battery-charging';
  return 'shopping-bag';
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

  /* hero */
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
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  /* scroll body */
  scrollContent: {
    paddingTop: 0,
    gap: spacing.md,
  },

  /* KPI card floats over hero */
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

  /* sections */
  section: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  sectionLabel: {
    paddingHorizontal: spacing.xs,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  emptyDevicesCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  emptyDevicesTitle: {
    marginTop: spacing.sm,
  },
  emptyDevicesBody: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  emptyDevicesCta: {
    alignSelf: 'stretch',
  },

  /* device cards (meters + appliances) */
  deviceList: {
    gap: spacing.md,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  deviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: semantic.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applianceIcon: {
    backgroundColor: semantic.orangeLight,
  },
  deviceBody: {
    flex: 1,
    gap: 4,
  },
  deviceSerialRow: {
    flexDirection: 'row',
  },
  applianceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  applianceName: {
    flexShrink: 1,
  },
  applianceProgress: {
    height: 6,
    backgroundColor: semantic.line,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  applianceProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  applianceFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  mono: {
    fontFamily: fonts.monoBold,
    color: semantic.ink,
  },

  /* footer */
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
    alignItems: 'center',
  },
  phoneCta: {
    width: 48,
    height: 48,
    borderRadius: radii.button,
    borderWidth: 1.5,
    borderColor: semantic.line2,
    backgroundColor: semantic.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectCta: {
    flex: 1,
  },
});
