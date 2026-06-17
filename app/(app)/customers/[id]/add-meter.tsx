import { Feather } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import type { TFunction } from 'i18next';

import { assignMeterToCustomer, fetchAvailableMeters } from '@/api/customer';
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
  LocationPickerSheet,
  Screen,
  Select,
  Text,
} from '@/components';
import { colors, radius, spacing } from '@/theme';
import {
  GeoPoint,
  captureGeoPoint,
  formatGeoPoint,
  parseGeoPoint,
} from '@/utils/location';
import { extractServerError as mutationErrorMessage } from '@/utils/errorMessage';
import { formatCurrency } from '@/utils/format';

function buildSchema(t: TFunction) {
  return z.object({
    manufacturer_id: z.number({ error: t('addMeter.errors.manufacturer') }),
    meter_type_id: z.number({ error: t('addMeter.errors.meterType') }),
    meter_id: z.number({ error: t('addMeter.errors.meter') }),
    tariff_id: z.number({ error: t('addMeter.errors.tariff') }),
    connection_group_id: z.number({
      error: t('addMeter.errors.connectionGroup'),
    }),
    connection_type_id: z.number({
      error: t('addMeter.errors.connectionType'),
    }),
  });
}

type AssignMeterForm = {
  manufacturer_id: number;
  meter_type_id: number;
  meter_id: number;
  tariff_id: number;
  connection_group_id: number;
  connection_type_id: number;
};

export default function AddMeterScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = Number(id);
  const { api } = useSession();
  const schema = useMemo(() => buildSchema(t), [t]);
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  const [geoPoints, setGeoPoints] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    'pending' | 'captured' | 'denied'
  >('pending');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [done, setDone] = useState(false);
  const hasCaptured = useRef(false);

  const currentPoint = parseGeoPoint(geoPoints);

  function applyPoint(point: GeoPoint) {
    const formatted = formatGeoPoint(point);
    setGeoPoints(formatted);
    setLocationStatus(formatted ? 'captured' : 'denied');
  }

  const manufacturers = useQuery({
    queryKey: ['manufacturers', 'meter'],
    queryFn: () => fetchManufacturers(api!, { type: 'meter' }),
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
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<AssignMeterForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      manufacturer_id: undefined as unknown as number,
      meter_type_id: undefined as unknown as number,
      meter_id: undefined as unknown as number,
      tariff_id: undefined as unknown as number,
      connection_group_id: undefined as unknown as number,
      connection_type_id: undefined as unknown as number,
    },
  });

  const manufacturerId = useWatch({ control, name: 'manufacturer_id' });
  const meterTypeId = useWatch({ control, name: 'meter_type_id' });

  const availableMeters = useQuery({
    queryKey: ['available-meters', manufacturerId, meterTypeId],
    queryFn: () =>
      fetchAvailableMeters(api!, {
        manufacturer_id: manufacturerId,
        meter_type_id: meterTypeId,
      }),
    enabled: !!api && !!manufacturerId && !!meterTypeId,
  });

  const queryClient = useQueryClient();
  const assignMutation = useMutation({
    mutationFn: (payload: AssignMeterForm) => {
      const meter = availableMeters.data?.find(
        (m) => m.id === payload.meter_id,
      );
      if (!meter) throw new Error(t('addMeter.errors.pickMeter'));
      const { meter_id: _meterId, ...rest } = payload;
      return assignMeterToCustomer(api!, customerId, {
        ...rest,
        serial_number: meter.serial_number,
        geo_points: geoPoints,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['available-meters'] });
      setDone(true);
    },
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
    if (point) {
      applyPoint(point);
    } else {
      setLocationStatus('denied');
    }
  }

  const onSubmit = handleSubmit((values) => assignMutation.mutate(values));

  if (Number.isNaN(customerId)) {
    return (
      <Screen>
        <Text variant="body" tone="danger">
          {t('addMeter.errors.invalidCustomer')}
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
            {t('addMeter.assigned')}
          </Text>
          <Button
            label={t('addMeter.backHome')}
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
        title={t('addMeter.title')}
        subtitle={t('addMeter.customerLabel', { id: customerId })}
        onBack={() => router.back()}
      />
      <Screen scroll>
        <View style={styles.header}>
          <Text variant="title">{t('addMeter.heading')}</Text>
          <Text variant="caption" tone="muted" style={styles.subtitle}>
            {t('addMeter.subheading')}
          </Text>
        </View>

        <View style={styles.fields}>
          <Controller
            control={control}
            name="manufacturer_id"
            render={({ field: { value, onChange } }) => (
              <Select
                label={t('addMeter.manufacturer')}
                value={value ?? null}
                onChange={(next) => {
                  onChange(next);
                  resetField('meter_id', {
                    defaultValue: undefined as unknown as number,
                  });
                }}
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
                label={t('addMeter.meterType')}
                value={value ?? null}
                onChange={(next) => {
                  onChange(next);
                  resetField('meter_id', {
                    defaultValue: undefined as unknown as number,
                  });
                }}
                loading={meterTypes.isLoading}
                options={(meterTypes.data ?? []).map((m) => ({
                  value: m.id,
                  label: `${m.max_current}A · ${m.phase}P · ${m.online ? t('addMeter.online') : t('addMeter.offline')}`,
                }))}
                error={errors.meter_type_id?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="meter_id"
            render={({ field: { value, onChange } }) => {
              const ready = !!manufacturerId && !!meterTypeId;
              const meters = availableMeters.data ?? [];
              return (
                <Select
                  label={t('addMeter.serial')}
                  placeholder={
                    ready
                      ? meters.length === 0 && !availableMeters.isLoading
                        ? t('addMeter.noUnassigned')
                        : t('addMeter.selectMeter')
                      : t('addMeter.pickFirst')
                  }
                  value={value ?? null}
                  onChange={onChange}
                  disabled={
                    !ready ||
                    (meters.length === 0 && !availableMeters.isLoading)
                  }
                  loading={availableMeters.isLoading}
                  searchable
                  searchPlaceholder={t('addMeter.searchSerial')}
                  options={meters.map((m) => ({
                    value: m.id,
                    label: m.serial_number,
                  }))}
                  error={errors.meter_id?.message}
                />
              );
            }}
          />
          <Controller
            control={control}
            name="tariff_id"
            render={({ field: { value, onChange } }) => (
              <Select
                label={t('addMeter.tariff')}
                value={value ?? null}
                onChange={onChange}
                loading={tariffs.isLoading}
                options={(tariffs.data ?? []).map((tariff) => ({
                  value: tariff.id,
                  label: tariff.name,
                  description: formatCurrency(tariff.price, tariff.currency),
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
                label={t('addMeter.connectionGroup')}
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
                label={t('addMeter.connectionType')}
                value={value ?? null}
                onChange={onChange}
                loading={connectionTypes.isLoading}
                options={(connectionTypes.data ?? []).map((ct) => ({
                  value: ct.id,
                  label: ct.name,
                }))}
                error={errors.connection_type_id?.message}
              />
            )}
          />
        </View>

        <Card style={styles.locationCard}>
          <View style={styles.locationRow}>
            <View style={styles.locationBody}>
              <Text variant="label">{t('addMeter.location.label')}</Text>
              <Text variant="caption" tone="muted">
                {locationStatus === 'pending' && t('addMeter.location.pending')}
                {locationStatus === 'captured' &&
                  geoPoints &&
                  t('addMeter.location.captured', { coords: geoPoints })}
                {locationStatus === 'denied' && t('addMeter.location.denied')}
              </Text>
            </View>
            <View style={styles.locationActions}>
              <Pressable onPress={() => setPickerOpen(true)} hitSlop={8}>
                <Text variant="label" tone="brand">
                  {t('addMeter.location.pickOnMap')}
                </Text>
              </Pressable>
              <Pressable onPress={retryLocation} hitSlop={8}>
                <Text variant="label" tone="brand">
                  {t('addMeter.location.retry')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Card>

        <LocationPickerSheet
          visible={pickerOpen}
          initial={currentPoint}
          onClose={() => setPickerOpen(false)}
          onConfirm={(point) => {
            applyPoint(point);
            setPickerOpen(false);
          }}
        />

        {assignMutation.isError ? (
          <Text variant="caption" tone="danger" style={styles.error}>
            {mutationErrorMessage(
              assignMutation.error,
              t,
              'addMeter.errors.submitGeneric',
            )}
          </Text>
        ) : null}

        <Button
          label={t('addMeter.submit')}
          onPress={onSubmit}
          loading={isSubmitting || assignMutation.isPending}
          style={[styles.cta, { marginBottom: bottomInset }]}
        />
      </Screen>
    </View>
  );
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
  locationActions: {
    alignItems: 'flex-end',
    gap: spacing.sm,
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
