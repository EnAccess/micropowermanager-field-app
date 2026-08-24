import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosInstance } from 'axios';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SoldAppliance, fetchCustomerSoldAppliances } from '@/api/appliances';
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
  ReceiptCard,
  Screen,
  SecondaryHeader,
  SuccessCheckmark,
  Text,
  TextField,
  useToast,
} from '@/components';
import { fonts, radii, semantic, spacing } from '@/theme';
import { extractServerError as errorMessage } from '@/utils/errorMessage';
import { describeTokenCredit } from '@/utils/tokenDisplay';
import { useCurrency } from '@/utils/useCurrency';

type Step = 'find' | 'amount' | 'confirm' | 'success';

export default function CollectPaymentScreen() {
  const { t } = useTranslation();
  const toast = useToast();
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
      const sales = await fetchCustomerSoldAppliances(
        api!,
        lookup!.customer.id,
      );
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
    onError: (e) => toast.showError(errorMessage(e, t('paymentNew.failed'))),
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
          setLookupError(
            t('paymentNew.find.errorNotFound', { serial: prefilledSerial }),
          );
        }
      } catch (e) {
        setLookupError(errorMessage(e, t('paymentNew.find.errorGeneric')));
      }
    })();
  }, [api, prefilledSerial, autoLookupAttempted, lookupMutation, t]);

  function reset() {
    setStep('find');
    setSerial('');
    setLookup(null);
    setLookupError(null);
    setAmountStr('');
    setTransactionRef(null);
    setTransactionId(null);
    submitMutation.reset();
    lookupMutation.reset();
  }

  async function handleFind() {
    setLookupError(null);
    const trimmed = serial.trim();
    if (!trimmed) {
      setLookupError(t('paymentNew.find.errorEnter'));
      return;
    }
    try {
      const match = await lookupMutation.mutateAsync(trimmed);
      if (!match) {
        setLookupError(t('paymentNew.find.errorNotFound', { serial: trimmed }));
        return;
      }
      setLookup(match);
      setStep('amount');
    } catch (e) {
      setLookupError(errorMessage(e, t('paymentNew.find.errorGeneric')));
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
        onChangeCustomer={() => setStep('find')}
        onContinue={() => {
          if (amountValue <= 0 || belowMinimum) return;
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('paymentNew.find.title')}
        subtitle={t('paymentNew.find.subtitle')}
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
            {t('paymentNew.find.question')}
          </Text>
          <Text variant="body" tone="muted" style={styles.findSubtitle}>
            {t('paymentNew.find.hint')}
          </Text>
          <TextField
            label={t('paymentNew.find.label')}
            placeholder={t('paymentNew.find.placeholder')}
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
          <Button
            label={t('paymentNew.find.continue')}
            onPress={onContinue}
            loading={loading}
          />
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
  onChangeCustomer: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const customerName =
    `${lookup.customer.name} ${lookup.customer.surname}`.trim();

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('paymentNew.amount.title')}
        subtitle={t('paymentNew.amount.step')}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={3} current={1} />
      </View>

      <View style={styles.amountBody}>
        <CustomerChip
          name={customerName}
          meta={deviceShortLabel(lookup.device.device_type, t)}
          onChange={onChangeCustomer}
          style={styles.amountChip}
        />

        <View style={styles.amountCenter}>
          <Text variant="sectionLabel" tone="muted">
            {t('paymentNew.amount.label')}
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
              {belowMinimum
                ? t('paymentNew.amount.belowMin')
                : t('paymentNew.amount.minimum')}
              {currency ? `${currency} ` : ''}
              {formatAmount(String(minimumPayment))}
            </Text>
          ) : null}
        </View>
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
          label={t('paymentNew.amount.next')}
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
}: {
  lookup: DeviceLookup;
  amount: number;
  amountFormatted: string;
  currency: string | null;
  onBack: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const customerName =
    `${lookup.customer.name} ${lookup.customer.surname}`.trim();
  const phone = primaryPhone(lookup.customer);

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('paymentNew.confirm.title')}
        subtitle={t('paymentNew.confirm.step')}
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
            {t('paymentNew.confirm.label')}
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
            {currency
              ? t('paymentNew.confirm.inCashWith', { currency })
              : t('paymentNew.confirm.inCash')}
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
              label={t('paymentNew.confirm.for')}
              value={
                <Pill
                  label={deviceForLabel(lookup.device.device_type, t)}
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
              label={t('paymentNew.confirm.device')}
              value={
                <MonoChip value={truncateUuid(lookup.device.device_serial)} />
              }
            />
          </Card>

          <Callout tone="warning" style={styles.confirmCallout}>
            <Text variant="body" tone="secondary">
              {t('paymentNew.confirm.warning')}
            </Text>
          </Callout>
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
          label={t('paymentNew.confirm.back')}
          tone="ghost"
          onPress={onBack}
          style={styles.footerBack}
        />
        <Button
          tone="success"
          label={t('paymentNew.confirm.submit')}
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
  const { t } = useTranslation();
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
            {t('paymentNew.result.title')}
          </Text>
          <Text variant="body" tone="muted" style={styles.successSubtitle}>
            {phone
              ? t('paymentNew.result.receiptSent', { phone })
              : t('paymentNew.result.recorded')}
          </Text>
        </View>

        <TokenCard token={tokenState.token} state={tokenState.status} />

        <ReceiptCard
          amount={amountFormatted}
          currency={
            currency
              ? `${currency} · ${deviceShortLabel(lookup.device.device_type, t).toLowerCase()}`
              : deviceShortLabel(lookup.device.device_type, t)
          }
          customerName={customerName}
          reference={t('paymentNew.result.refLabel', { ref: reference })}
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
          label={t('paymentNew.result.backHome')}
          tone="ghost"
          onPress={onClose}
          style={styles.footerBack}
        />
        <Button
          label={t('paymentNew.result.next')}
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
  const { t } = useTranslation();
  if (state === 'skipped') return null;

  if (state === 'pending') {
    return (
      <View style={[styles.tokenCard, styles.tokenCardPending]}>
        <View style={styles.tokenHeader}>
          <Feather name="key" size={16} color={semantic.blue} />
          <Text variant="sectionLabel" tone="brand">
            {t('paymentNew.token.generating')}
          </Text>
        </View>
        <View style={styles.tokenLoadingRow}>
          <ActivityIndicator color={semantic.blue} />
          <Text variant="meta" tone="muted">
            {t('paymentNew.token.waiting')}
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
            {t('paymentNew.token.none')}
          </Text>
        </View>
        <Text variant="meta" tone="muted">
          {t('paymentNew.token.noneBody')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.tokenCard, styles.tokenCardReady]}>
      <View style={styles.tokenHeader}>
        <Feather name="key" size={16} color={semantic.green} />
        <Text variant="sectionLabel" tone="success">
          {t('paymentNew.token.label')}
        </Text>
      </View>
      <Pressable
        onPress={() => copyToken(token.token, t)}
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
        {describeTokenCredit(token) ?? t('paymentNew.token.readToCustomer')}
      </Text>
    </View>
  );
}

async function copyToken(value: string, t: TFunction) {
  await Clipboard.setStringAsync(value);
  if (Platform.OS === 'android') {
    ToastAndroid.show(t('paymentNew.token.copied'), ToastAndroid.SHORT);
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

function deviceForLabel(deviceType: string, t: TFunction): string {
  switch (deviceKind(deviceType)) {
    case 'meter':
      return t('paymentNew.device.energyMeter');
    case 'shs':
      return t('paymentNew.device.shs');
    default:
      return deviceType || t('paymentNew.device.fallback');
  }
}

function deviceShortLabel(deviceType: string, t: TFunction): string {
  switch (deviceKind(deviceType)) {
    case 'meter':
      return t('paymentNew.device.meterShort');
    case 'shs':
      return t('paymentNew.device.shsShort');
    default:
      return deviceType || t('paymentNew.device.fallback');
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
