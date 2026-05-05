import { Feather } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { assignMeterToCustomer } from '@/api/customer';
import {
  fetchConnectionGroups,
  fetchConnectionTypes,
  fetchManufacturers,
  fetchMeterTypes,
  fetchTariffs,
} from '@/api/referenceData';
import { useSession } from '@/auth/SessionContext';
import {
  AppBar,
  Button,
  Card,
  Screen,
  Select,
  Text,
  TextField,
} from '@/components';
import { colors, radius, spacing } from '@/theme';
import { captureGeoPoint, formatGeoPoint } from '@/utils/location';
import { formatCurrency } from '@/utils/format';

const schema = z.object({
  serial_number: z.string().trim().min(1, 'Serial number required.'),
  manufacturer_id: z.number({ error: 'Choose a manufacturer.' }),
  meter_type_id: z.number({ error: 'Choose a meter type.' }),
  tariff_id: z.number({ error: 'Choose a tariff.' }),
  connection_group_id: z.number({ error: 'Choose a connection group.' }),
  connection_type_id: z.number({ error: 'Choose a connection type.' }),
});

type AssignMeterForm = z.infer<typeof schema>;

export default function AddMeterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = Number(id);
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const [geoPoints, setGeoPoints] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    'pending' | 'captured' | 'denied'
  >('pending');
  const [done, setDone] = useState(false);
  const hasCaptured = useRef(false);

  const manufacturers = useQuery({
    queryKey: ['manufacturers'],
    queryFn: () => fetchManufacturers(api!),
    enabled: !!api,
  });
  const meterTypes = useQuery({
    queryKey: ['meter-types'],
    queryFn: () => fetchMeterTypes(api!),
    enabled: !!api,
  });
  const tariffs = useQuery({
    queryKey: ['tariffs'],
    queryFn: () => fetchTariffs(api!),
    enabled: !!api,
  });
  const connectionGroups = useQuery({
    queryKey: ['connection-groups'],
    queryFn: () => fetchConnectionGroups(api!),
    enabled: !!api,
  });
  const connectionTypes = useQuery({
    queryKey: ['connection-types'],
    queryFn: () => fetchConnectionTypes(api!),
    enabled: !!api,
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AssignMeterForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      serial_number: '',
      manufacturer_id: undefined as unknown as number,
      meter_type_id: undefined as unknown as number,
      tariff_id: undefined as unknown as number,
      connection_group_id: undefined as unknown as number,
      connection_type_id: undefined as unknown as number,
    },
  });

  const assignMutation = useMutation({
    mutationFn: (payload: AssignMeterForm) =>
      assignMeterToCustomer(api!, customerId, {
        ...payload,
        geo_points: geoPoints,
      }),
    onSuccess: () => setDone(true),
  });

  useEffect(() => {
    if (hasCaptured.current) return;
    hasCaptured.current = true;
    void captureGeoPoint().then((point) => {
      const formatted = formatGeoPoint(point);
      setGeoPoints(formatted);
      setLocationStatus(formatted ? 'captured' : 'denied');
    });
  }, []);

  async function retryLocation() {
    setLocationStatus('pending');
    const point = await captureGeoPoint();
    const formatted = formatGeoPoint(point);
    setGeoPoints(formatted);
    setLocationStatus(formatted ? 'captured' : 'denied');
  }

  const onSubmit = handleSubmit((values) => assignMutation.mutate(values));

  if (Number.isNaN(customerId)) {
    return (
      <Screen>
        <Text variant="body" tone="danger">
          Invalid customer.
        </Text>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen>
        <View style={styles.successRoot}>
          <View style={styles.successBadge}>
            <Feather name="check" size={36} color={colors.text.inverse} />
          </View>
          <Text variant="title" style={styles.successTitle}>
            Meter assigned
          </Text>
          <Button
            label="Back to home"
            onPress={() => router.replace('/(app)/(tabs)')}
            style={styles.successCta}
          />
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <AppBar
        title="Assign meter"
        subtitle={`Customer #${customerId}`}
        onBack={() => router.back()}
      />
      <Screen scroll>
        <View style={styles.header}>
          <Text variant="title">Assign a meter</Text>
          <Text variant="caption" tone="muted" style={styles.subtitle}>
            Fill in the hardware and tariff details for this customer.
          </Text>
        </View>

        <View style={styles.fields}>
          <Controller
            control={control}
            name="serial_number"
            render={({ field: { value, onChange, onBlur } }) => (
              <TextField
                label="Serial number"
                placeholder="e.g. MTR-000123"
                autoCapitalize="characters"
                autoCorrect={false}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.serial_number?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="manufacturer_id"
            render={({ field: { value, onChange } }) => (
              <Select
                label="Manufacturer"
                value={value ?? null}
                onChange={onChange}
                loading={manufacturers.isLoading}
                options={(manufacturers.data ?? []).map((m) => ({
                  value: m.id,
                  label: m.name,
                }))}
                error={errors.manufacturer_id?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="meter_type_id"
            render={({ field: { value, onChange } }) => (
              <Select
                label="Meter type"
                value={value ?? null}
                onChange={onChange}
                loading={meterTypes.isLoading}
                options={(meterTypes.data ?? []).map((m) => ({
                  value: m.id,
                  label: `${m.max_current}A · ${m.phase}P · ${m.online ? 'Online' : 'Offline'}`,
                }))}
                error={errors.meter_type_id?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="tariff_id"
            render={({ field: { value, onChange } }) => (
              <Select
                label="Tariff"
                value={value ?? null}
                onChange={onChange}
                loading={tariffs.isLoading}
                options={(tariffs.data ?? []).map((t) => ({
                  value: t.id,
                  label: t.name,
                  description: formatCurrency(t.price, t.currency),
                }))}
                error={errors.tariff_id?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="connection_group_id"
            render={({ field: { value, onChange } }) => (
              <Select
                label="Connection group"
                value={value ?? null}
                onChange={onChange}
                loading={connectionGroups.isLoading}
                options={(connectionGroups.data ?? []).map((g) => ({
                  value: g.id,
                  label: g.name,
                }))}
                error={errors.connection_group_id?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="connection_type_id"
            render={({ field: { value, onChange } }) => (
              <Select
                label="Connection type"
                value={value ?? null}
                onChange={onChange}
                loading={connectionTypes.isLoading}
                options={(connectionTypes.data ?? []).map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                error={errors.connection_type_id?.message}
              />
            )}
          />
        </View>

        <Card style={styles.locationCard}>
          <View style={styles.locationRow}>
            <View style={styles.locationBody}>
              <Text variant="label">Meter location</Text>
              <Text variant="caption" tone="muted">
                {locationStatus === 'pending' && 'Capturing position…'}
                {locationStatus === 'captured' &&
                  geoPoints &&
                  `Captured: ${geoPoints}`}
                {locationStatus === 'denied' &&
                  'Skipped. Retry if the meter is elsewhere.'}
              </Text>
            </View>
            <Pressable onPress={retryLocation} hitSlop={8}>
              <Text variant="label" tone="brand">
                Retry
              </Text>
            </Pressable>
          </View>
        </Card>

        {assignMutation.isError ? (
          <Text variant="caption" tone="danger" style={styles.error}>
            {mutationErrorMessage(assignMutation.error)}
          </Text>
        ) : null}

        <Button
          label="Assign meter"
          onPress={onSubmit}
          loading={isSubmitting || assignMutation.isPending}
          style={[styles.cta, { marginBottom: bottomInset }]}
        />
      </Screen>
    </View>
  );
}

function mutationErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (
      error as {
        response?: {
          data?: { message?: string; errors?: Record<string, string[]> };
        };
      }
    ).response;
    const firstFieldError = response?.data?.errors
      ? Object.values(response.data.errors).flat()[0]
      : undefined;
    if (firstFieldError) return firstFieldError;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return 'Could not attach the meter. Try again.';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.page,
  },
  header: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  fields: {
    gap: spacing.md,
  },
  locationCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  locationBody: {
    flex: 1,
    gap: spacing.xs,
  },
  error: {
    marginTop: spacing.md,
  },
  cta: {
    marginTop: spacing.xl,
  },
  successRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.status.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  successTitle: {
    marginBottom: spacing.xxl,
  },
  successCta: {
    alignSelf: 'stretch',
  },
});
