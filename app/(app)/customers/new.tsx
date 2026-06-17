import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  isValidPhoneNumber,
  validatePhoneNumberLength,
} from 'libphonenumber-js';

import { Customer, Gender, registerCustomer } from '@/api/customer';
import { City, fetchCities } from '@/api/referenceData';
import { readCachedCities, writeCachedCities } from '@/storage/citiesCache';
import { useSession } from '@/auth/SessionContext';
import { fetchOnline, useNetworkStatus } from '@/auth/useNetworkStatus';
import {
  Button,
  Callout,
  Card,
  DateField,
  DocumentSection,
  LocationPickerSheet,
  PhoneField,
  ProgressSteps,
  SecondaryHeader,
  Select,
  SuccessCheckmark,
  Text,
  TextField,
  toIsoDate,
} from '@/components';
import {
  enqueueRegisterCustomer,
  RegisterCustomerOutboxEntry,
  removeOutboxEntry,
} from '@/storage/outbox';
import { useRegisterCustomerOutbox } from '@/storage/useOutbox';
import { fonts, radii, semantic, spacing } from '@/theme';
import { extractServerError as mutationErrorMessage } from '@/utils/errorMessage';
import {
  GeoPoint,
  captureGeoPoint,
  formatGeoPoint,
  parseGeoPoint,
  reverseGeocode,
} from '@/utils/location';
import { z } from 'zod';

function buildSchema(t: TFunction) {
  return z.object({
    name: z.string().trim().min(2, t('customerNew.errors.firstNameMin')),
    surname: z.string().trim().min(2, t('customerNew.errors.surnameMin')),
    phone: z
      .string()
      .trim()
      .superRefine((v, ctx) => {
        if (!v) {
          ctx.addIssue({
            code: 'custom',
            message: t('customerNew.errors.phoneRequired'),
          });
          return;
        }
        if (validatePhoneNumberLength(v) || !isValidPhoneNumber(v)) {
          ctx.addIssue({
            code: 'custom',
            message: t('customerNew.errors.phoneInvalid'),
          });
        }
      }),
    city_id: z.number({ error: t('customerNew.errors.cityRequired') }),
    birth_date: z
      .date()
      .max(new Date(), t('customerNew.errors.birthDateFuture'))
      .optional(),
    gender: z.enum(['male', 'female', 'non-binary']).optional(),
    street: z.string().trim().optional(),
  });
}

function buildGenderOptions(t: TFunction): { value: Gender; label: string }[] {
  return [
    { value: 'male', label: t('customerNew.genderMale') },
    { value: 'female', label: t('customerNew.genderFemale') },
    { value: 'non-binary', label: t('customerNew.genderNonBinary') },
  ];
}

type RegisterForm = {
  name: string;
  surname: string;
  phone: string;
  city_id: number;
  birth_date?: Date;
  gender?: Gender;
  street?: string;
};

type Step = 'form' | 'success';

export default function RegisterCustomerScreen() {
  const { t } = useTranslation();
  const { api, agent } = useSession();
  const queryClient = useQueryClient();
  const schema = useMemo(() => buildSchema(t), [t]);
  const params = useLocalSearchParams<{ retry_local_id?: string }>();
  const retryLocalId = params.retry_local_id ?? null;
  const outboxEntries = useRegisterCustomerOutbox();
  const retryEntry = useMemo(
    () =>
      retryLocalId
        ? (outboxEntries.find((e) => e.local_id === retryLocalId) ?? null)
        : null,
    [retryLocalId, outboxEntries],
  );

  const { online } = useNetworkStatus();
  const [step, setStep] = useState<Step>('form');
  const [registered, setRegistered] = useState<Customer | null>(null);
  const [pendingLocal, setPendingLocal] =
    useState<RegisterCustomerOutboxEntry | null>(null);
  const [continueAfterSave, setContinueAfterSave] = useState(false);
  const [geoPoints, setGeoPoints] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    'pending' | 'captured' | 'denied'
  >('pending');
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasCaptured = useRef(false);

  const cities = useCachedCities(api, agent?.id ?? null);

  const scopedCities = useMemo(
    () =>
      cities.data.filter(
        (city) =>
          !agent?.mini_grid_id || city.mini_grid_id === agent.mini_grid_id,
      ),
    [cities.data, agent?.mini_grid_id],
  );

  const {
    control,
    handleSubmit,
    reset: resetForm,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      surname: '',
      phone: '',
      city_id: undefined as unknown as number,
      birth_date: undefined,
      gender: undefined,
      street: '',
    },
  });

  const maybeFillStreetFromPoint = useCallback(
    async (point: GeoPoint) => {
      if ((getValues('street') ?? '').trim().length > 0) return;
      const street = await reverseGeocode(point);
      if (!street) return;
      if ((getValues('street') ?? '').trim().length > 0) return;
      setValue('street', street, { shouldDirty: false });
    },
    [getValues, setValue],
  );

  const applyPoint = useCallback(
    (point: GeoPoint) => {
      const formatted = formatGeoPoint(point);
      setGeoPoints(formatted);
      setLocationStatus(formatted ? 'captured' : 'denied');
      void maybeFillStreetFromPoint(point);
    },
    [maybeFillStreetFromPoint],
  );

  useEffect(() => {
    if (hasCaptured.current) return;
    hasCaptured.current = true;
    void captureGeoPoint().then((point) => {
      if (point) applyPoint(point);
      else setLocationStatus('denied');
    });
  }, [applyPoint]);

  async function retryLocation() {
    setLocationStatus('pending');
    const point = await captureGeoPoint();
    if (point) applyPoint(point);
    else setLocationStatus('denied');
  }

  // Prefill from a failed outbox entry when the user navigated here to retry.
  useEffect(() => {
    if (!retryEntry) return;
    resetForm({
      name: retryEntry.payload.name,
      surname: retryEntry.payload.surname,
      phone: retryEntry.payload.phone,
      city_id: retryEntry.payload.city_id,
      birth_date: retryEntry.payload.birth_date
        ? new Date(`${retryEntry.payload.birth_date}T00:00:00`)
        : undefined,
      gender: retryEntry.payload.gender ?? undefined,
      street: retryEntry.payload.street ?? '',
    });
    if (retryEntry.payload.geo_points) {
      setGeoPoints(retryEntry.payload.geo_points);
      setLocationStatus('captured');
    }
  }, [retryEntry, resetForm]);

  type RegisterResult =
    | { kind: 'remote'; customer: Customer }
    | { kind: 'local'; entry: RegisterCustomerOutboxEntry };

  const registerMutation = useMutation<RegisterResult, unknown, RegisterForm>({
    mutationFn: async (payload) => {
      const fullPayload = {
        name: payload.name,
        surname: payload.surname,
        phone: payload.phone,
        city_id: payload.city_id,
        birth_date: payload.birth_date ? toIsoDate(payload.birth_date) : null,
        gender: payload.gender ?? null,
        street: payload.street?.trim() || null,
        geo_points: geoPoints,
      };
      // Pre-flight: re-check connectivity here rather than trusting the cached
      // hook state, which can be stale on first render. If we're definitely
      // offline we skip the request entirely and queue immediately.
      const reachable = online && (await fetchOnline());
      if (!reachable) {
        const entry = await enqueueRegisterCustomer(fullPayload);
        return { kind: 'local', entry };
      }
      try {
        const customer = await registerCustomer(api!, fullPayload, {
          timeoutMs: 5000,
        });
        return { kind: 'remote', customer };
      } catch (err) {
        // Network failures (no HTTP response) and tight-timeout aborts are
        // recoverable — queue and sync later. Validation / auth errors (4xx)
        // propagate as mutation errors and stay inline on the form.
        if (isNetworkError(err)) {
          const entry = await enqueueRegisterCustomer(fullPayload);
          return { kind: 'local', entry };
        }
        throw err;
      }
    },
    onSuccess: async (result) => {
      // If the user was retrying a failed outbox entry, drop the old one now
      // that we've either synced it or replaced it with a fresh queued entry.
      if (retryLocalId) {
        await removeOutboxEntry(retryLocalId);
      }
      await queryClient.invalidateQueries({ queryKey: ['agent-customers'] });
      if (result.kind === 'remote') {
        setRegistered(result.customer);
        if (continueAfterSave) {
          router.replace(`/(app)/customers/${result.customer.id}/add-meter`);
          return;
        }
      } else {
        setPendingLocal(result.entry);
      }
      setStep('success');
    },
  });

  const submit = (intent: 'continue' | 'save') =>
    handleSubmit((values) => {
      setContinueAfterSave(intent === 'continue');
      registerMutation.mutate(values);
    });

  if (step === 'success' && (registered || pendingLocal)) {
    return (
      <SuccessStep
        customer={registered}
        pendingEntry={pendingLocal}
        onAssignMeter={() =>
          registered &&
          router.replace(`/(app)/customers/${registered.id}/add-meter`)
        }
        onHome={() => router.replace('/(app)/(tabs)')}
      />
    );
  }

  return (
    <>
      <FormStep
        control={control}
        errors={errors}
        cities={scopedCities}
        citiesLoading={cities.loading}
        citiesUnavailable={cities.unavailable}
        onRetryCities={() => void cities.refetch()}
        gridLabel={agent?.mini_grid_id ? `#${agent.mini_grid_id}` : '—'}
        busy={registerMutation.isPending}
        retryHint={retryEntry?.last_error?.message ?? null}
        error={
          registerMutation.isError
            ? mutationErrorMessage(
                registerMutation.error,
                t,
                'customerNew.errors.submitGeneric',
              )
            : null
        }
        geoPoints={geoPoints}
        locationStatus={locationStatus}
        onPickLocation={() => setPickerOpen(true)}
        onRetryLocation={retryLocation}
        onContinue={submit('continue')}
        onSaveLinkLater={submit('save')}
        onBack={() => router.back()}
      />
      <LocationPickerSheet
        visible={pickerOpen}
        initial={parseGeoPoint(geoPoints)}
        onClose={() => setPickerOpen(false)}
        onConfirm={(point) => {
          applyPoint(point);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

type CachedCities = {
  data: City[];
  loading: boolean;
  unavailable: boolean;
  refetch: () => void;
};

function useCachedCities(
  api: ReturnType<typeof useSession>['api'],
  agentId: number | null,
): CachedCities {
  const [diskCities, setDiskCities] = useState<City[] | null>(null);
  const [diskReady, setDiskReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (agentId == null) {
      setDiskReady(true);
      return;
    }
    void readCachedCities(agentId).then((cached) => {
      if (cancelled) return;
      setDiskCities(cached);
      setDiskReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const networkQuery = useQuery({
    queryKey: ['cities', agentId],
    queryFn: async () => {
      const fresh = await fetchCities(api!);
      if (agentId != null) {
        await writeCachedCities(agentId, fresh);
      }
      return fresh;
    },
    enabled: !!api && agentId != null,
    staleTime: 24 * 60 * 60_000,
  });

  const data = networkQuery.data ?? diskCities ?? [];
  const hasUsable = data.length > 0;
  const loading = !diskReady || (!hasUsable && networkQuery.isFetching);
  const unavailable = diskReady && !hasUsable && !networkQuery.isFetching;

  return {
    data,
    loading,
    unavailable,
    refetch: () => void networkQuery.refetch(),
  };
}

type ControlType = ReturnType<typeof useForm<RegisterForm>>['control'];
type ErrorsType = ReturnType<
  typeof useForm<RegisterForm>
>['formState']['errors'];

function FormStep({
  control,
  errors,
  cities,
  citiesLoading,
  citiesUnavailable,
  onRetryCities,
  gridLabel,
  busy,
  retryHint,
  error,
  geoPoints,
  locationStatus,
  onPickLocation,
  onRetryLocation,
  onContinue,
  onSaveLinkLater,
  onBack,
}: {
  control: ControlType;
  errors: ErrorsType;
  cities: { id: number; name: string }[];
  citiesLoading: boolean;
  citiesUnavailable: boolean;
  onRetryCities: () => void;
  gridLabel: string;
  busy: boolean;
  retryHint: string | null;
  error: string | null;
  geoPoints: string | null;
  locationStatus: 'pending' | 'captured' | 'denied';
  onPickLocation: () => void;
  onRetryLocation: () => void;
  onContinue: () => void;
  onSaveLinkLater: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const genderOptions = useMemo(() => buildGenderOptions(t), [t]);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('customerNew.title')}
        subtitle={t('customerNew.step')}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={2} current={1} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {retryHint ? (
            <Callout tone="warning" style={styles.retryCallout}>
              <Text variant="meta" tone="secondary">
                {t('customerNew.retryHint', { reason: retryHint })}
              </Text>
            </Callout>
          ) : null}
          {citiesUnavailable ? (
            <Callout tone="warning" style={styles.retryCallout}>
              <View style={styles.citiesUnavailable}>
                <Text variant="meta" tone="secondary" style={styles.flex}>
                  {t('customerNew.noVillages')}
                </Text>
                <Button
                  label={t('customerNew.retry')}
                  tone="ghost"
                  onPress={onRetryCities}
                  style={styles.citiesRetryBtn}
                />
              </View>
            </Callout>
          ) : null}
          <Text variant="sectionLabel" tone="muted">
            {t('customerNew.section')}
          </Text>

          <View style={styles.fields}>
            <Controller
              control={control}
              name="name"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextField
                  label={t('customerNew.firstName')}
                  placeholder={t('customerNew.firstNamePlaceholder')}
                  autoCapitalize="words"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.name?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="surname"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextField
                  label={t('customerNew.surname')}
                  placeholder={t('customerNew.surnamePlaceholder')}
                  autoCapitalize="words"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.surname?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field: { value, onChange, onBlur } }) => (
                <PhoneField
                  label={t('customerNew.phone')}
                  value={value}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={errors.phone?.message}
                />
              )}
            />

            <View style={styles.row}>
              <View style={styles.flex}>
                <Controller
                  control={control}
                  name="birth_date"
                  render={({ field: { value, onChange } }) => (
                    <DateField
                      label={t('customerNew.birthDate')}
                      placeholder={t('customerNew.fieldOptional')}
                      value={value ?? null}
                      onChange={onChange}
                      maximumDate={new Date()}
                      error={errors.birth_date?.message}
                    />
                  )}
                />
              </View>
              <View style={styles.flex}>
                <Controller
                  control={control}
                  name="gender"
                  render={({ field: { value, onChange } }) => (
                    <Select
                      label={t('customerNew.gender')}
                      placeholder={t('customerNew.fieldOptional')}
                      value={value ?? null}
                      onChange={onChange}
                      options={genderOptions}
                      error={errors.gender?.message}
                    />
                  )}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.cellVillage}>
                <Controller
                  control={control}
                  name="city_id"
                  render={({ field: { value, onChange } }) => (
                    <Select
                      label={t('customerNew.village')}
                      placeholder={t('customerNew.villagePlaceholder')}
                      value={value ?? null}
                      onChange={onChange}
                      loading={citiesLoading}
                      options={cities.map((c) => ({
                        value: c.id,
                        label: c.name,
                      }))}
                      error={errors.city_id?.message}
                    />
                  )}
                />
              </View>
              <View style={styles.cellGrid}>
                <Text
                  variant="sectionLabel"
                  tone="secondary"
                  style={styles.gridLabel}
                >
                  {t('customerNew.grid')}
                </Text>
                <View style={styles.gridReadonly}>
                  <Text style={styles.gridValue}>{gridLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          <Card style={styles.locationCard}>
            <View style={styles.locationRow}>
              <View style={styles.locationBody}>
                <Text variant="label">{t('customerNew.addressTitle')}</Text>
                <Text variant="caption" tone="muted">
                  {locationStatus === 'pending' &&
                    t('customerNew.addressCapturing')}
                  {locationStatus === 'captured' &&
                    geoPoints &&
                    t('customerNew.addressCaptured', { coords: geoPoints })}
                  {locationStatus === 'denied' &&
                    t('customerNew.addressDenied')}
                </Text>
              </View>
              <View style={styles.locationActions}>
                <Pressable onPress={onPickLocation} hitSlop={8}>
                  <Text variant="label" tone="brand">
                    {t('customerNew.pickOnMap')}
                  </Text>
                </Pressable>
                <Pressable onPress={onRetryLocation} hitSlop={8}>
                  <Text variant="label" tone="brand">
                    {t('customerNew.retry')}
                  </Text>
                </Pressable>
              </View>
            </View>
            <Controller
              control={control}
              name="street"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextField
                  label={t('customerNew.street')}
                  placeholder={t('customerNew.streetPlaceholder')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  error={errors.street?.message}
                  containerStyle={styles.streetField}
                />
              )}
            />
          </Card>

          <Callout tone="info" style={styles.callout}>
            <Text variant="meta" tone="secondary">
              {t('customerNew.hint')}
            </Text>
          </Callout>

          {error ? (
            <Text variant="meta" tone="danger" style={styles.error}>
              {error}
            </Text>
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
            label={t('customerNew.saveLater')}
            tone="ghost"
            onPress={onSaveLinkLater}
            loading={busy && !errors.city_id}
            disabled={citiesUnavailable}
            style={styles.footerSecondary}
          />
          <Button
            tone="accent"
            label={t('customerNew.continue')}
            onPress={onContinue}
            loading={busy}
            disabled={citiesUnavailable}
            style={styles.footerPrimary}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SuccessStep({
  customer,
  pendingEntry,
  onAssignMeter,
  onHome,
}: {
  customer: Customer | null;
  pendingEntry: RegisterCustomerOutboxEntry | null;
  onAssignMeter: () => void;
  onHome: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isPending = !!pendingEntry;
  const fullName = customer
    ? `${customer.name} ${customer.surname}`.trim()
    : pendingEntry
      ? `${pendingEntry.payload.name} ${pendingEntry.payload.surname}`.trim()
      : '';

  return (
    <View style={styles.root}>
      <View
        style={[styles.successHeader, { paddingTop: insets.top + spacing.sm }]}
      >
        {/* visual balance only */}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.successScroll,
          { paddingBottom: insets.bottom + 100 },
        ]}
      >
        <SuccessCheckmark />
        <Text variant="pageTitle" tone="success" style={styles.successTitle}>
          {isPending
            ? t('customerNew.successSavedLocally')
            : t('customerNew.successRegistered')}
        </Text>
        <Text variant="body" tone="muted" style={styles.successSubtitle}>
          {fullName}
        </Text>
        {isPending ? (
          <Callout tone="info" style={styles.successCallout}>
            <Text variant="meta" tone="secondary">
              {t('customerNew.offlineNote')}
            </Text>
          </Callout>
        ) : customer ? (
          <View style={styles.successDocs}>
            <DocumentSection customerId={customer.id} />
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
          label={t('customerNew.done')}
          tone="ghost"
          onPress={onHome}
          style={styles.footerSecondary}
        />
        <Button
          label={t('customerNew.assignMeter')}
          onPress={onAssignMeter}
          disabled={isPending}
          style={styles.footerPrimary}
        />
      </View>
    </View>
  );
}

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { response?: unknown; code?: string; message?: string };
  // axios sets `response` only when the server replied; lack of response = network failure
  if ('response' in e && e.response !== undefined) return false;
  if (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED') return true;
  return true;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.paper,
  },
  flex: {
    flex: 1,
  },
  progressWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  fields: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-end',
  },
  cellVillage: {
    flex: 2,
  },
  cellGrid: {
    flex: 1,
    gap: spacing.xs,
  },
  gridLabel: {
    marginBottom: 2,
  },
  gridReadonly: {
    backgroundColor: semantic.bgSoft,
    borderRadius: radii.input,
    borderWidth: 1.5,
    borderColor: semantic.line,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  gridValue: {
    fontFamily: fonts.ptBold,
    color: semantic.ink2,
    fontSize: 15,
  },
  locationCard: {
    marginTop: spacing.xs,
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
  streetField: {
    marginTop: spacing.md,
  },
  callout: {
    marginTop: spacing.xs,
  },
  error: {
    marginTop: spacing.xs,
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
    flexGrow: 0,
  },
  footerPrimary: {
    flex: 1,
  },

  /* success */
  successHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: 32,
  },
  successScroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  successTitle: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
  successSubtitle: {
    textAlign: 'center',
  },
  successCallout: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  successDocs: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  retryCallout: {
    marginBottom: spacing.md,
  },
  citiesUnavailable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  citiesRetryBtn: {
    flexGrow: 0,
  },
});
