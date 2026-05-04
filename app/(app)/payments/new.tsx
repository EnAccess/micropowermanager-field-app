import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosInstance } from 'axios';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
} from '@/api/appliances';
import {
  DeviceLookup,
  findDeviceLookup,
  searchCustomers,
} from '@/api/customer';
import {
  PaymentToken,
  collectAgentPayment,
  fetchTransactionToken,
} from '@/api/transactions';
import { useSession } from '@/auth/SessionContext';
import {
  Button,
  Callout,
  Card,
  CustomerChip,
  MonoChip,
  NumericKeypad,
  Pill,
  ProgressSteps,
  QuickAddChips,
  ReceiptCard,
  Screen,
  SecondaryHeader,
  SuccessCheckmark,
  Text,
  TextField,
} from '@/components';
import { fonts, radii, semantic, spacing } from '@/theme';
import { useCurrency } from '@/utils/useCurrency';

type Step = 'find' | 'amount' | 'confirm' | 'success';

const QUICK_ADD = [5000, 10000, 20000, 50000];

export default function CollectPaymentScreen() {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const { symbol: currency } = useCurrency();
  const params = useLocalSearchParams<{ serial?: string }>();
  const prefilledSerial = (params.serial ?? '').trim();

  const [step, setStep] = useState<Step>('find');
  const [serial, setSerial] = useState(prefilledSerial);
  const [lookup, setLookup] = useState<DeviceLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [transactionRef, setTransactionRef] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [autoLookupAttempted, setAutoLookupAttempted] = useState(false);

  const lookupMutation = useMutation({
    mutationFn: async (s: string) => {
      const customers = await searchCustomers(api!, s);
      return findDeviceLookup(customers, s);
    },
  });

  const matchedSaleQuery = useQuery({
    queryKey: [
      'matched-sold-appliance',
      lookup?.customer.id ?? null,
      lookup?.device.device_serial ?? null,
    ],
    queryFn: async () => {
      const sales = await fetchCustomerSoldAppliances(api!, lookup!.customer.id);
      return (
        sales.find((s) => s.device_serial === lookup!.device.device_serial) ??
        null
      );
    },
    enabled: !!api && !!lookup,
    staleTime: 60_000,
  });

  const matchedSale = matchedSaleQuery.data ?? null;
  const minimumPayment = computeMinimumPayment(matchedSale);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const result = await collectAgentPayment(api!, {
        device_serial: lookup!.device.device_serial,
        amount: amountValue,
      });
      return result;
    },
    onSuccess: async (result) => {
      const ref = String(Date.now()).slice(-6);
      setTransactionRef(ref);
      setTransactionId(result.transaction_id);
      setStep('success');
      await queryClient.invalidateQueries({ queryKey: ['agent-balance'] });
      await queryClient.invalidateQueries({ queryKey: ['agent-transactions'] });
      await queryClient.invalidateQueries({
        queryKey: ['agent-transactions-today'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['agent-transactions-list'],
      });
    },
    onError: (e) => setSubmitError(errorMessage(e)),
  });

  const amountValue = Number(amountStr) || 0;

  // When the screen is opened with a `?serial=…` (e.g. from a sale detail
  // page), skip the manual Find step: run the lookup once and jump straight
  // to amount entry. If the lookup fails, fall through to the Find step with
  // the prefilled serial and the error so the user can correct it.
  useEffect(() => {
    if (autoLookupAttempted) return;
    if (!api || !prefilledSerial) return;
    setAutoLookupAttempted(true);
    void (async () => {
      try {
        const match = await lookupMutation.mutateAsync(prefilledSerial);
        if (match) {
          setLookup(match);
          setStep('amount');
        } else {
          setLookupError(`No device found with serial "${prefilledSerial}".`);
        }
      } catch (e) {
        setLookupError(errorMessage(e, 'Lookup failed. Try again.'));
      }
    })();
  }, [api, prefilledSerial, autoLookupAttempted, lookupMutation]);

  function reset() {
    setStep('find');
    setSerial('');
    setLookup(null);
    setLookupError(null);
    setAmountStr('');
    setSubmitError(null);
    setTransactionRef(null);
    setTransactionId(null);
    submitMutation.reset();
    lookupMutation.reset();
  }

  async function handleFind() {
    setLookupError(null);
    const trimmed = serial.trim();
    if (!trimmed) {
      setLookupError('Enter the meter or SHS serial.');
      return;
    }
    try {
      const match = await lookupMutation.mutateAsync(trimmed);
      if (!match) {
        setLookupError(`No device found with serial "${trimmed}".`);
        return;
      }
      setLookup(match);
      setStep('amount');
    } catch (e) {
      setLookupError(errorMessage(e, 'Lookup failed. Try again.'));
    }
  }

  function handleKeypress(key: string) {
    setAmountStr((prev) => {
      const next = prev + key;
      if (next.length > 9) return prev;
      return next.replace(/^0+(\d)/, '$1');
    });
  }

  function handleDelete() {
    setAmountStr((prev) => prev.slice(0, -1));
  }

  function handleQuickAdd(value: number) {
    setAmountStr((prev) => String((Number(prev) || 0) + value));
  }

  if (step === 'find') {
    return (
      <FindStep
        serial={serial}
        onChangeSerial={setSerial}
        onContinue={handleFind}
        loading={lookupMutation.isPending}
        error={lookupError}
        onBack={() => router.back()}
      />
    );
  }

  if (step === 'amount' && lookup) {
    const belowMinimum =
      minimumPayment > 0 && amountValue > 0 && amountValue < minimumPayment;
    return (
      <AmountStep
        lookup={lookup}
        amount={amountValue}
        amountFormatted={formatAmount(amountStr)}
        currency={currency}
        minimumPayment={minimumPayment}
        belowMinimum={belowMinimum}
        onKeyPress={handleKeypress}
        onDelete={handleDelete}
        onQuickAdd={handleQuickAdd}
        onChangeCustomer={() => setStep('find')}
        onContinue={() => {
          if (amountValue <= 0 || belowMinimum) return;
          setSubmitError(null);
          setStep('confirm');
        }}
        onBack={() => setStep('find')}
      />
    );
  }

  if (step === 'confirm' && lookup) {
    return (
      <ConfirmStep
        lookup={lookup}
        amount={amountValue}
        amountFormatted={formatAmount(amountStr)}
        currency={currency}
        onBack={() => setStep('amount')}
        onConfirm={() => submitMutation.mutate()}
        loading={submitMutation.isPending}
        error={submitError}
      />
    );
  }

  if (step === 'success' && lookup) {
    return (
      <SuccessStep
        lookup={lookup}
        amountFormatted={formatAmount(amountStr)}
        reference={transactionRef ?? '—'}
        currency={currency}
        transactionId={transactionId}
        onClose={() => router.replace('/(app)/(tabs)')}
        onNext={reset}
      />
    );
  }

  return null;
}

function FindStep({
  serial,
  onChangeSerial,
  onContinue,
  loading,
  error,
  onBack,
}: {
  serial: string;
  onChangeSerial: (s: string) => void;
  onContinue: () => void;
  loading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <SecondaryHeader
        title="Collect payment"
        subtitle="Find device"
        onBack={onBack}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.findContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="pageTitle" style={styles.findTitle}>
            Which device are you collecting for?
          </Text>
          <Text variant="body" tone="muted" style={styles.findSubtitle}>
            Enter the meter or SHS serial. We&apos;ll show the customer next.
          </Text>
          <TextField
            label="Device serial"
            placeholder="e.g. MTR-000123"
            autoCapitalize="characters"
            autoCorrect={false}
            value={serial}
            onChangeText={onChangeSerial}
            error={error ?? undefined}
            mono
            containerStyle={styles.findField}
          />
        </ScrollView>
        <View
          style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <Button label="Continue" onPress={onContinue} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function AmountStep({
  lookup,
  amount,
  amountFormatted,
  currency,
  minimumPayment,
  belowMinimum,
  onKeyPress,
  onDelete,
  onQuickAdd,
  onChangeCustomer,
  onContinue,
  onBack,
}: {
  lookup: DeviceLookup;
  amount: number;
  amountFormatted: string;
  currency: string | null;
  minimumPayment: number;
  belowMinimum: boolean;
  onKeyPress: (k: string) => void;
  onDelete: () => void;
  onQuickAdd: (v: number) => void;
  onChangeCustomer: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const customerName =
    `${lookup.customer.name} ${lookup.customer.surname}`.trim();

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title="Collect payment"
        subtitle="Step 1 of 3"
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={3} current={1} />
      </View>

      <View style={styles.amountBody}>
        <CustomerChip
          name={customerName}
          meta={deviceShortLabel(lookup.device.device_type)}
          onChange={onChangeCustomer}
          style={styles.amountChip}
        />

        <View style={styles.amountCenter}>
          <Text variant="sectionLabel" tone="muted">
            AMOUNT RECEIVED
          </Text>
          <Text
            variant="heroNumber"
            tone="brand"
            style={styles.amountNumber}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {amountFormatted}
          </Text>
          {currency ? (
            <Text variant="meta" tone="muted">
              {currency}
            </Text>
          ) : null}
          {minimumPayment > 0 ? (
            <Text
              variant="meta"
              tone={belowMinimum ? 'danger' : 'muted'}
              style={styles.amountMinimum}
            >
              {belowMinimum ? 'Below minimum: ' : 'Minimum: '}
              {currency ? `${currency} ` : ''}
              {formatAmount(String(minimumPayment))}
            </Text>
          ) : null}
        </View>

        <QuickAddChips
          values={QUICK_ADD}
          onAdd={onQuickAdd}
          style={styles.quickAdd}
        />
      </View>

      <NumericKeypad
        onKeyPress={onKeyPress}
        onDelete={onDelete}
        style={styles.keypad}
      />

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
      >
        <Button
          tone="accent"
          label="Review & confirm"
          onPress={onContinue}
          disabled={amount <= 0 || belowMinimum}
        />
      </View>
    </View>
  );
}

function ConfirmStep({
  lookup,
  amount,
  amountFormatted,
  currency,
  onBack,
  onConfirm,
  loading,
  error,
}: {
  lookup: DeviceLookup;
  amount: number;
  amountFormatted: string;
  currency: string | null;
  onBack: () => void;
  onConfirm: () => void;
  loading: boolean;
  error: string | null;
}) {
  const insets = useSafeAreaInsets();
  const customerName =
    `${lookup.customer.name} ${lookup.customer.surname}`.trim();
  const phone = primaryPhone(lookup.customer);

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title="Confirm payment"
        subtitle="Step 2 of 3"
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={3} current={2} />
      </View>

      <Screen scroll padded={false}>
        <LinearGradient
          colors={[semantic.orangeLight, semantic.paper]}
          style={styles.confirmHero}
        >
          <Text variant="sectionLabel" tone="muted">
            YOU ARE COLLECTING
          </Text>
          <Text
            variant="heroNumber"
            style={[styles.confirmAmount, { color: semantic.orange }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {amountFormatted}
          </Text>
          <Text variant="body" tone="secondary">
            {currency ? `${currency} · in cash` : 'In cash'}
          </Text>
        </LinearGradient>

        <View style={styles.confirmCardWrap}>
          <Card padded={false} style={styles.confirmCard}>
            <View style={styles.customerRow}>
              <View style={styles.customerAvatar}>
                <Text variant="bodyEmphasis" tone="brand">
                  {avatarInitials(customerName)}
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
              </View>
            </View>

            <DataRow
              label="For"
              value={
                <Pill
                  label={deviceForLabel(lookup.device.device_type)}
                  tone="blue"
                  leading={
                    <Feather
                      name={
                        deviceKind(lookup.device.device_type) === 'shs'
                          ? 'sun'
                          : 'zap'
                      }
                      size={12}
                      color={semantic.blue}
                    />
                  }
                />
              }
            />
            <DataRow
              label="Device"
              value={
                <MonoChip value={truncateUuid(lookup.device.device_serial)} />
              }
            />
          </Card>

          <Callout tone="warning" style={styles.confirmCallout}>
            <Text variant="body" tone="secondary">
              Confirm only <Text variant="bodyStrong">after</Text> you&apos;ve
              received cash from the customer. This action is final.
            </Text>
          </Callout>

          {error ? (
            <Text variant="meta" tone="danger" style={styles.confirmError}>
              {error}
            </Text>
          ) : null}
        </View>
      </Screen>

      <View
        style={[
          styles.footer,
          styles.footerRow,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <Button
          label="Back"
          tone="ghost"
          onPress={onBack}
          style={styles.footerBack}
        />
        <Button
          tone="success"
          label="Cash received — confirm"
          onPress={onConfirm}
          loading={loading}
          disabled={amount <= 0}
          style={styles.footerPrimary}
        />
      </View>
    </View>
  );
}

function SuccessStep({
  lookup,
  amountFormatted,
  reference,
  currency,
  transactionId,
  onClose,
  onNext,
}: {
  lookup: DeviceLookup;
  amountFormatted: string;
  reference: string;
  currency: string | null;
  transactionId: number | null;
  onClose: () => void;
  onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const customerName =
    `${lookup.customer.name} ${lookup.customer.surname}`.trim();
  const phone = primaryPhone(lookup.customer);
  const tokenState = useTokenPolling(api, transactionId);

  return (
    <View style={styles.root}>
      <View
        style={[styles.successHeader, { paddingTop: insets.top + spacing.sm }]}
      >
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={({ pressed }) => [
            styles.closeBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Feather name="x" size={18} color={semantic.ink2} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.successScroll,
          { paddingBottom: insets.bottom + spacing.xxl + 80 },
        ]}
      >
        <View style={styles.successHero}>
          <SuccessCheckmark />
          <Text variant="pageTitle" tone="success" style={styles.successTitle}>
            Payment collected
          </Text>
          <Text variant="body" tone="muted" style={styles.successSubtitle}>
            {phone ? `Receipt sent to ${phone}` : 'Recorded successfully'}
          </Text>
        </View>

        <TokenCard token={tokenState.token} state={tokenState.status} />

        <ReceiptCard
          amount={amountFormatted}
          currency={
            currency
              ? `${currency} · ${deviceShortLabel(lookup.device.device_type).toLowerCase()}`
              : deviceShortLabel(lookup.device.device_type)
          }
          customerName={customerName}
          reference={`Ref #${reference}`}
          style={styles.receipt}
        />
      </ScrollView>

      <View
        style={[
          styles.footer,
          styles.footerRow,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <Button
          label="Back to home"
          tone="ghost"
          onPress={onClose}
          style={styles.footerBack}
        />
        <Button
          label="Next customer"
          onPress={onNext}
          style={styles.footerPrimary}
        />
      </View>
    </View>
  );
}

type TokenStatus = 'pending' | 'ready' | 'unavailable' | 'skipped';

function useTokenPolling(
  api: AxiosInstance | null,
  transactionId: number | null,
): { token: PaymentToken | null; status: TokenStatus } {
  const [token, setToken] = useState<PaymentToken | null>(null);
  const [status, setStatus] = useState<TokenStatus>(
    transactionId == null ? 'skipped' : 'pending',
  );

  useEffect(() => {
    if (!api || transactionId == null) {
      setStatus('skipped');
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 12; // ~24s with 2s interval

    async function poll() {
      try {
        const result = await fetchTransactionToken(api!, transactionId!);
        if (cancelled) return;
        if (result) {
          setToken(result);
          setStatus('ready');
          return;
        }
      } catch {
        // Ignore — try again, give up after MAX_ATTEMPTS.
      }
      attempts += 1;
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) {
        setStatus('unavailable');
        return;
      }
      setTimeout(poll, 2000);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [api, transactionId]);

  return { token, status };
}

function TokenCard({
  token,
  state,
}: {
  token: PaymentToken | null;
  state: TokenStatus;
}) {
  if (state === 'skipped') return null;

  if (state === 'pending') {
    return (
      <View style={[styles.tokenCard, styles.tokenCardPending]}>
        <View style={styles.tokenHeader}>
          <Feather name="key" size={16} color={semantic.blue} />
          <Text variant="sectionLabel" tone="brand">
            GENERATING TOKEN
          </Text>
        </View>
        <View style={styles.tokenLoadingRow}>
          <ActivityIndicator color={semantic.blue} />
          <Text variant="meta" tone="muted">
            Waiting for the device to issue a code…
          </Text>
        </View>
      </View>
    );
  }

  if (state === 'unavailable' || !token) {
    return (
      <View style={[styles.tokenCard, styles.tokenCardMuted]}>
        <View style={styles.tokenHeader}>
          <Feather name="info" size={16} color={semantic.ink3} />
          <Text variant="sectionLabel" tone="muted">
            NO TOKEN ISSUED
          </Text>
        </View>
        <Text variant="meta" tone="muted">
          The payment was recorded. If a token is sent later, the customer will
          receive it via SMS.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.tokenCard, styles.tokenCardReady]}>
      <View style={styles.tokenHeader}>
        <Feather name="key" size={16} color={semantic.green} />
        <Text variant="sectionLabel" tone="success">
          TOKEN
        </Text>
      </View>
      <Pressable
        onPress={() => copyToken(token.token)}
        style={({ pressed }) => [
          styles.tokenValueRow,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text
          style={styles.tokenValue}
          selectable
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {token.token}
        </Text>
        <Feather name="copy" size={16} color={semantic.ink2} />
      </Pressable>
      <Text variant="meta" tone="muted">
        {describeTokenAmount(token) ?? 'Read this code to the customer.'}
      </Text>
    </View>
  );
}

function describeTokenAmount(token: PaymentToken): string | null {
  if (token.token_amount == null) return null;
  const unit = token.token_unit ?? '';
  const amount = Number(token.token_amount);
  if (Number.isNaN(amount)) return null;
  if (unit === 'kWh') return `${amount.toFixed(3)} ${unit}`;
  if (unit === 'days' || unit === 'weeks' || unit === 'months') {
    return `${amount.toFixed(1)} ${unit}`;
  }
  return unit ? `${amount} ${unit}` : null;
}

async function copyToken(value: string) {
  await Clipboard.setStringAsync(value);
  if (Platform.OS === 'android') {
    ToastAndroid.show('Token copied', ToastAndroid.SHORT);
  }
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.dataRow}>
      <Text variant="meta" tone="muted">
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text variant="bodyEmphasis">{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

function avatarInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

function primaryPhone(customer: {
  addresses?: { is_primary: number; phone: string | null }[];
}): string | null {
  const primary = customer.addresses?.find((a) => a.is_primary);
  return primary?.phone ?? customer.addresses?.[0]?.phone ?? null;
}

type DeviceKind = 'meter' | 'shs' | 'other';

function deviceKind(deviceType: string): DeviceKind {
  const t = deviceType.toLowerCase();
  if (t.includes('meter')) return 'meter';
  if (t.includes('solar') || t.includes('shs')) return 'shs';
  return 'other';
}

function deviceForLabel(deviceType: string): string {
  switch (deviceKind(deviceType)) {
    case 'meter':
      return 'Energy (meter)';
    case 'shs':
      return 'Solar home system';
    default:
      return deviceType || 'Device';
  }
}

function deviceShortLabel(deviceType: string): string {
  switch (deviceKind(deviceType)) {
    case 'meter':
      return 'Meter';
    case 'shs':
      return 'SHS';
    default:
      return deviceType || 'Device';
  }
}

function truncateUuid(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-5)}`;
}

function toPositiveAmount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function computeMinimumPayment(sale: SoldAppliance | null): number {
  if (!sale) return 0;
  if (sale.payment_type === 'energy_service') {
    return toPositiveAmount(sale.minimum_payable_amount);
  }
  return toPositiveAmount(sale.rates?.[1]?.rate_cost);
}

function formatAmount(raw: string): string {
  if (!raw) return '0';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return new Intl.NumberFormat('en-US').format(n);
}

function errorMessage(
  error: unknown,
  fallback = 'Payment failed. Try again.',
): string {
  if (error == null) return fallback;

  if (typeof error === 'object' && 'response' in error) {
    const response = (
      error as {
        response?: {
          status?: number;
          data?: {
            message?: string;
            errors?: Record<string, string[]>;
            data?: { message?: string };
          };
        };
      }
    ).response;

    const validationFirst = response?.data?.errors
      ? Object.values(response.data.errors).flat()[0]
      : undefined;
    if (validationFirst) return validationFirst;
    if (response?.data?.data?.message) return response.data.data.message;
    if (response?.data?.message) return response.data.message;

    const status = response?.status;
    if (status === 401) return 'Session expired. Sign in again.';
    if (status === 403) return 'You don’t have permission for this action.';
    if (status === 404) return 'Not found on the server.';
    if (status === 409)
      return 'Conflicting request. Pull to refresh and retry.';
    if (typeof status === 'number' && status >= 500) {
      return 'Server is having trouble. Try again in a moment.';
    }
  }

  if (typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string') {
      const lower = msg.toLowerCase();
      if (lower.includes('network') || lower.includes('timeout')) {
        return 'No connection. Check your internet and retry.';
      }
      if (msg.length > 0) return msg;
    }
  }

  return fallback;
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
    backgroundColor: semantic.paper,
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
  footerBack: {
    flexBasis: 96,
    flexGrow: 0,
  },
  footerPrimary: {
    flex: 1,
  },

  /* Find */
  findContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  findTitle: {
    marginTop: spacing.md,
  },
  findSubtitle: {
    marginTop: spacing.sm,
  },
  findField: {
    marginTop: spacing.xl,
  },

  /* Amount */
  amountBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  amountChip: {
    alignSelf: 'flex-start',
  },
  amountCenter: {
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  amountNumber: {
    fontFamily: fonts.ptBold,
  },
  amountMinimum: {
    marginTop: 4,
  },
  quickAdd: {
    marginTop: spacing.lg,
    justifyContent: 'center',
  },
  keypad: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },

  /* Confirm */
  confirmHero: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  confirmAmount: {
    marginTop: 4,
  },
  confirmCardWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  confirmCard: {
    overflow: 'hidden',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
  },
  customerAvatar: {
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
  confirmCallout: {
    marginTop: 0,
  },
  confirmError: {
    marginTop: spacing.sm,
  },

  /* Success */
  successHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: semantic.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successScroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  successHero: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  successTitle: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
  successSubtitle: {
    textAlign: 'center',
  },
  receipt: {
    width: '100%',
    marginTop: spacing.lg,
  },

  /* token */
  tokenCard: {
    width: '100%',
    marginTop: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tokenCardPending: {
    borderColor: semantic.line2,
    backgroundColor: semantic.bgSoft,
  },
  tokenCardReady: {
    borderColor: semantic.green,
    backgroundColor: semantic.greenLight,
  },
  tokenCardMuted: {
    borderColor: semantic.line,
    backgroundColor: semantic.paper,
  },
  tokenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tokenLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tokenValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tokenValue: {
    flex: 1,
    fontFamily: fonts.monoBold,
    fontSize: 22,
    letterSpacing: 1,
    color: semantic.ink,
  },
});
