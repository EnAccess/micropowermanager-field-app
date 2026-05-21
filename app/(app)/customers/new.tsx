import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  isValidPhoneNumber,
  validatePhoneNumberLength,
} from 'libphonenumber-js';

import { Customer, registerCustomer } from '@/api/customer';
import { City, fetchCities } from '@/api/referenceData';
import { readCachedCities, writeCachedCities } from '@/storage/citiesCache';
import { useSession } from '@/auth/SessionContext';
import { fetchOnline, useNetworkStatus } from '@/auth/useNetworkStatus';
import {
  Button,
  Callout,
  DocumentSection,
  PhoneField,
  ProgressSteps,
  SecondaryHeader,
  Select,
  SuccessCheckmark,
  Text,
  TextField,
} from '@/components';
import {
  enqueueRegisterCustomer,
  RegisterCustomerOutboxEntry,
  removeOutboxEntry,
} from '@/storage/outbox';
import { useRegisterCustomerOutbox } from '@/storage/useOutbox';
import { fonts, radii, semantic, spacing } from '@/theme';
import { captureGeoPoint, formatGeoPoint } from '@/utils/location';
import { z } from 'zod';

const schema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters.'),
  surname: z.string().trim().min(2, 'At least 2 characters.'),
  phone: z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      if (!v) {
        ctx.addIssue({ code: 'custom', message: 'Enter a phone number.' });
        return;
      }
      if (validatePhoneNumberLength(v) || !isValidPhoneNumber(v)) {
        ctx.addIssue({ code: 'custom', message: 'Invalid phone number.' });
      }
    }),
  city_id: z.number({ error: 'Choose a village.' }),
});

type RegisterForm = z.infer<typeof schema>;

type Step = 'form' | 'success';

export default function RegisterCustomerScreen() {
  const { api, agent } = useSession();
  const queryClient = useQueryClient();
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
  const geoPointsRef = useRef<string | null>(null);

  // Silent, non-blocking GPS capture (no UI for permission status).
  useEffect(() => {
    let cancelled = false;
    void captureGeoPoint().then((point) => {
      if (cancelled) return;
      geoPointsRef.current = formatGeoPoint(point);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      surname: '',
      phone: '',
      city_id: undefined as unknown as number,
    },
  });

  // Prefill from a failed outbox entry when the user navigated here to retry.
  useEffect(() => {
    if (!retryEntry) return;
    resetForm({
      name: retryEntry.payload.name,
      surname: retryEntry.payload.surname,
      phone: retryEntry.payload.phone,
      city_id: retryEntry.payload.city_id,
    });
    if (retryEntry.payload.geo_points) {
      geoPointsRef.current = retryEntry.payload.geo_points;
    }
  }, [retryEntry, resetForm]);

  type RegisterResult =
    | { kind: 'remote'; customer: Customer }
    | { kind: 'local'; entry: RegisterCustomerOutboxEntry };

  const registerMutation = useMutation<RegisterResult, unknown, RegisterForm>({
    mutationFn: async (payload) => {
      const fullPayload = { ...payload, geo_points: geoPointsRef.current };
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
          ? mutationErrorMessage(registerMutation.error)
          : null
      }
      onContinue={submit('continue')}
      onSaveLinkLater={submit('save')}
      onBack={() => router.back()}
    />
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
  onContinue: () => void;
  onSaveLinkLater: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title="Register customer"
        subtitle="Step 1 of 2 · Identity"
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
                Last sync attempt failed: {retryHint}. Edit the details and save
                to try again.
              </Text>
            </Callout>
          ) : null}
          {citiesUnavailable ? (
            <Callout tone="warning" style={styles.retryCallout}>
              <View style={styles.citiesUnavailable}>
                <Text variant="meta" tone="secondary" style={styles.flex}>
                  Villages aren&apos;t loaded yet. Connect once to enable
                  registration.
                </Text>
                <Button
                  label="Retry"
                  tone="ghost"
                  onPress={onRetryCities}
                  style={styles.citiesRetryBtn}
                />
              </View>
            </Callout>
          ) : null}
          <Text variant="sectionLabel" tone="muted">
            WHO ARE YOU REGISTERING?
          </Text>

          <View style={styles.fields}>
            <Controller
              control={control}
              name="name"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextField
                  label="First name"
                  placeholder="e.g. Fatuma"
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
                  label="Surname"
                  placeholder="e.g. Moshi"
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
                  label="Phone"
                  value={value}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={errors.phone?.message}
                />
              )}
            />

            <View style={styles.row}>
              <View style={styles.cellVillage}>
                <Controller
                  control={control}
                  name="city_id"
                  render={({ field: { value, onChange } }) => (
                    <Select
                      label="Village"
                      placeholder="Choose a village"
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
                  GRID
                </Text>
                <View style={styles.gridReadonly}>
                  <Text style={styles.gridValue}>{gridLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          <Callout tone="info" style={styles.callout}>
            <Text variant="meta" tone="secondary">
              Meter / SHS setup happens after — you can register identity first
              and link a device later. Documents can be attached once the
              customer is saved.
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
            label="Save & link later"
            tone="ghost"
            onPress={onSaveLinkLater}
            loading={busy && !errors.city_id}
            disabled={citiesUnavailable}
            style={styles.footerSecondary}
          />
          <Button
            tone="accent"
            label="Continue"
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
          {isPending ? 'Saved locally' : 'Customer registered'}
        </Text>
        <Text variant="body" tone="muted" style={styles.successSubtitle}>
          {fullName}
        </Text>
        {isPending ? (
          <Callout tone="info" style={styles.successCallout}>
            <Text variant="meta" tone="secondary">
              You&apos;re offline. We&apos;ll sync this customer to the server
              automatically when you&apos;re back online. Documents can be added
              once the customer reaches the server.
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
          label="Done"
          tone="ghost"
          onPress={onHome}
          style={styles.footerSecondary}
        />
        <Button
          label="Assign meter"
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

function mutationErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (
      error as {
        response?: {
          data?: { message?: string; errors?: Record<string, string[]> };
        };
      }
    ).response;
    const fieldError = response?.data?.errors
      ? Object.values(response.data.errors).flat()[0]
      : undefined;
    if (fieldError) return fieldError;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return 'Could not register the customer. Try again.';
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
