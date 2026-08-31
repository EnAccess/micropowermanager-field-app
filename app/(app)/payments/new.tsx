import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosInstance, isAxiosError } from 'axios';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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

import {
  fetchAllSoldAppliances,
  fetchCustomerSoldAppliances,
  installmentCeiling,
  installmentFloor,
  saleCustomerName,
  saleCustomerPhone,
} from '@/api/appliances';
import {
  DeviceLookup,
  findDeviceLookup,
  searchCustomers,
} from '@/api/customer';
import {
  CASH_PAYMENT_PROVIDER,
  PaymentToken,
  collectAgentPayment,
  fetchPaymentProviders,
  fetchTransactionToken,
  payInstallment,
} from '@/api/transactions';
import { usePaymentStatus } from '@/api/usePaymentStatus';
import { useSession } from '@/auth/SessionContext';
import {
  Button,
  Callout,
  Card,
  CustomerChip,
  MonoChip,
  NumericKeypad,
  PayerPhoneField,
  PaymentAwaiting,
  PaymentFailure,
  PaymentFailureDetail,
  PaymentMethodLogo,
  PaymentMethodPicker,
  Pill,
  ProgressSteps,
  ProviderCheckout,
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

type Step =
  | 'find'
  | 'amount'
  | 'method'
  | 'confirm'
  | 'checkout'
  | 'awaiting'
  | 'success'
  | 'failed';

type CollectContext = {
  customerName: string;
  phone: string | null;
  forLabel: string;
  shortLabel: string;
  iconName: 'sun' | 'zap' | 'package';
  serial: string | null;
};

export default function CollectPaymentScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { api } = useSession();
  const queryClient = useQueryClient();
  const { symbol: currency } = useCurrency();
  const params = useLocalSearchParams<{ serial?: string; saleId?: string }>();
  const prefilledSerial = (params.serial ?? '').trim();
  const saleIdParam = Number(params.saleId);
  const installmentSaleId =
    Number.isFinite(saleIdParam) && saleIdParam > 0 ? saleIdParam : null;

  const [step, setStep] = useState<Step>(installmentSaleId ? 'amount' : 'find');
  const [serial, setSerial] = useState(prefilledSerial);
  const [lookup, setLookup] = useState<DeviceLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [amountStr, setAmountStr] = useState('');
  const [transactionRef, setTransactionRef] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [autoLookupAttempted, setAutoLookupAttempted] = useState(false);
  const [providerId, setProviderId] = useState(CASH_PAYMENT_PROVIDER);
  const [payerPhoneOverride, setPayerPhoneOverride] = useState<string | null>(
    null,
  );
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<PaymentFailureDetail | null>(null);

  const isProvider = providerId !== CASH_PAYMENT_PROVIDER;

  const lookupMutation = useMutation({
    mutationFn: async (s: string) => {
      const customers = await searchCustomers(api!, s);
      return findDeviceLookup(customers, s);
    },
  });

  const providersQuery = useQuery({
    queryKey: ['payment-providers'],
    queryFn: () => fetchPaymentProviders(api!),
    enabled: !!api,
    staleTime: 0,
    gcTime: 0,
  });

  const providers = providersQuery.data ?? [];
  const hasProviders = providers.length > 0;

  const installmentSaleQuery = useQuery({
    queryKey: ['installment-sale', installmentSaleId],
    queryFn: async () => {
      const sales = await fetchAllSoldAppliances(api!);
      return sales.find((s) => s.id === installmentSaleId) ?? null;
    },
    enabled: !!api && installmentSaleId != null,
    staleTime: 60_000,
  });

  const installmentSale = installmentSaleQuery.data ?? null;

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
    enabled: !!api && !!lookup && installmentSaleId == null,
    staleTime: 60_000,
  });

  const matchedSale = matchedSaleQuery.data ?? null;
  const amountValue = Number(amountStr) || 0;

  const minimumPayment = installmentSale
    ? installmentFloor(installmentSale)
    : matchedSale
      ? installmentFloor(matchedSale)
      : 0;
  const maximumPayment = installmentSale
    ? installmentCeiling(installmentSale)
    : 0;

  const context = useMemo<CollectContext | null>(() => {
    if (installmentSaleId != null) {
      if (!installmentSale) return null;
      return {
        customerName:
          saleCustomerName(installmentSale) ?? t('paymentNew.customerFallback'),
        phone: saleCustomerPhone(installmentSale),
        forLabel:
          installmentSale.appliance?.name ?? t('paymentNew.device.installment'),
        shortLabel: t('paymentNew.device.installmentShort'),
        iconName: 'package',
        serial: installmentSale.device_serial ?? null,
      };
    }
    if (!lookup) return null;
    return {
      customerName: `${lookup.customer.name} ${lookup.customer.surname}`.trim(),
      phone: primaryPhone(lookup.customer),
      forLabel: deviceForLabel(lookup.device.device_type, t),
      shortLabel: deviceShortLabel(lookup.device.device_type, t),
      iconName: deviceKind(lookup.device.device_type) === 'shs' ? 'sun' : 'zap',
      serial: lookup.device.device_serial,
    };
  }, [installmentSaleId, installmentSale, lookup, t]);

  const payerPhone = payerPhoneOverride ?? context?.phone ?? null;

  const statusEnabled =
    step === 'awaiting' && isProvider && transactionId != null;
  const { progress, check } = usePaymentStatus(
    api,
    transactionId,
    statusEnabled,
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      const providerFields = {
        ...(isProvider ? { payment_provider: providerId } : {}),
        ...(isProvider && payerPhoneOverride
          ? { payer_phone: payerPhoneOverride }
          : {}),
      };

      if (installmentSaleId != null) {
        return payInstallment(api!, installmentSaleId, {
          amount: amountValue,
          ...providerFields,
        });
      }

      return collectAgentPayment(api!, {
        device_serial: context!.serial!,
        amount: amountValue,
        ...providerFields,
      });
    },
    onSuccess: async (result) => {
      setTransactionRef(
        result.transactionId != null
          ? String(result.transactionId)
          : String(Date.now()).slice(-6),
      );
      setTransactionId(result.transactionId);

      if (isProvider && result.redirectUrl) {
        setRedirectUrl(result.redirectUrl);
        setStep('checkout');
      } else if (isProvider && result.transactionId == null) {
        setFailure({
          title: t('paymentNew.failure.timeoutTitle'),
          body: t('paymentNew.failure.timeoutBody'),
        });
        setStep('failed');
      } else if (!isProvider) {
        setStep('success');
      }

      await invalidatePaymentQueries(queryClient);
    },
    onError: async (error) => {
      if (isAxiosError(error) && error.code === 'ECONNABORTED') {
        setFailure({
          title: t('paymentNew.failure.timeoutTitle'),
          body: t('paymentNew.failure.timeoutBody'),
        });
        setStep('failed');
        return;
      }

      const message = errorMessage(error, t('paymentNew.failed'));

      if (isAxiosError(error) && error.response?.status === 422) {
        await queryClient.invalidateQueries({
          queryKey: ['payment-providers'],
        });
        if (isProvider) setStep('method');
        toast.showError(message);
        return;
      }

      if (isProvider) {
        setFailure({
          title: t('paymentNew.failure.rejectedTitle'),
          body: message,
        });
        setStep('failed');
        return;
      }

      toast.showError(message);
    },
  });

  useEffect(() => {
    if (progress === 'processed') setStep('success');
    if (progress === 'failed') {
      setFailure({
        title: t('paymentNew.failure.rejectedTitle'),
        body: t('paymentNew.failure.rejectedBody'),
      });
      setStep('failed');
    }
  }, [progress, t]);

  useEffect(() => {
    if (autoLookupAttempted) return;
    if (!api || !prefilledSerial || installmentSaleId != null) return;
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
  }, [
    api,
    prefilledSerial,
    autoLookupAttempted,
    lookupMutation,
    installmentSaleId,
    t,
  ]);

  function reset() {
    setStep(installmentSaleId ? 'amount' : 'find');
    setSerial('');
    setLookup(null);
    setLookupError(null);
    setAmountStr('');
    setTransactionRef(null);
    setTransactionId(null);
    setProviderId(CASH_PAYMENT_PROVIDER);
    setPayerPhoneOverride(null);
    setRedirectUrl(null);
    setFailure(null);
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

  function submit() {
    if (isProvider) {
      setFailure(null);
      setStep('awaiting');
    }
    submitMutation.mutate();
  }

  const totalSteps = hasProviders ? 4 : 3;

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

  if (!context) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={semantic.blue} />
      </View>
    );
  }

  if (step === 'amount') {
    const belowMinimum =
      minimumPayment > 0 && amountValue > 0 && amountValue < minimumPayment;
    const aboveMaximum = maximumPayment > 0 && amountValue > maximumPayment;
    return (
      <AmountStep
        context={context}
        amount={amountValue}
        amountFormatted={formatAmount(amountStr)}
        currency={currency}
        minimumPayment={minimumPayment}
        maximumPayment={maximumPayment}
        belowMinimum={belowMinimum}
        aboveMaximum={aboveMaximum}
        totalSteps={totalSteps}
        onKeyPress={handleKeypress}
        onDelete={handleDelete}
        onChangeCustomer={
          installmentSaleId == null ? () => setStep('find') : undefined
        }
        onContinue={() => {
          if (amountValue <= 0 || belowMinimum || aboveMaximum) return;
          setStep(hasProviders ? 'method' : 'confirm');
        }}
        onBack={() =>
          installmentSaleId == null ? setStep('find') : router.back()
        }
      />
    );
  }

  if (step === 'method') {
    return (
      <MethodStep
        providers={providers}
        providerId={providerId}
        onChangeProvider={setProviderId}
        payerPhone={context.phone}
        payerPhoneOverride={payerPhoneOverride}
        onChangePayerPhone={setPayerPhoneOverride}
        totalSteps={totalSteps}
        onBack={() => setStep('amount')}
        onContinue={() => setStep('confirm')}
      />
    );
  }

  if (step === 'confirm') {
    return (
      <ConfirmStep
        context={context}
        amount={amountValue}
        amountFormatted={formatAmount(amountStr)}
        currency={currency}
        providerId={providerId}
        providerName={providerNameOf(providers, providerId)}
        payerPhone={payerPhone}
        totalSteps={totalSteps}
        onBack={() => setStep(hasProviders ? 'method' : 'amount')}
        onConfirm={submit}
        loading={submitMutation.isPending}
      />
    );
  }

  if (step === 'checkout' && redirectUrl) {
    return (
      <ProviderCheckout
        url={redirectUrl}
        onDone={() => {
          setRedirectUrl(null);
          setStep('awaiting');
        }}
      />
    );
  }

  if (step === 'awaiting') {
    return (
      <PaymentAwaiting
        providerId={providerId}
        providerName={providerNameOf(providers, providerId)}
        payerPhone={payerPhone}
        amountFormatted={formatAmount(amountStr)}
        currency={currency}
        unresolved={progress === 'unresolved'}
        onCheckAgain={check}
        onClose={() => router.replace('/(app)/(tabs)')}
      />
    );
  }

  if (step === 'failed' && failure) {
    return (
      <PaymentFailure
        failure={failure}
        onClose={() => router.replace('/(app)/(tabs)')}
        onRestart={reset}
      />
    );
  }

  if (step === 'success') {
    return (
      <SuccessStep
        context={context}
        amountFormatted={formatAmount(amountStr)}
        reference={transactionRef ?? '—'}
        currency={currency}
        transactionId={transactionId}
        providerId={providerId}
        onClose={() => router.replace('/(app)/(tabs)')}
        onNext={reset}
      />
    );
  }

  return null;
}

async function invalidatePaymentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await queryClient.invalidateQueries({ queryKey: ['agent-balance'] });
  await queryClient.invalidateQueries({ queryKey: ['agent-transactions'] });
  await queryClient.invalidateQueries({
    queryKey: ['agent-transactions-today'],
  });
  await queryClient.invalidateQueries({
    queryKey: ['agent-transactions-list'],
  });
  await queryClient.invalidateQueries({ queryKey: ['sold-appliances'] });
  await queryClient.invalidateQueries({
    queryKey: ['agent-sold-appliances-all'],
  });
}

function providerNameOf(
  providers: { id: number; name: string }[],
  providerId: number,
): string | null {
  return providers.find((p) => p.id === providerId)?.name ?? null;
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
  context,
  amount,
  amountFormatted,
  currency,
  minimumPayment,
  maximumPayment,
  belowMinimum,
  aboveMaximum,
  totalSteps,
  onKeyPress,
  onDelete,
  onChangeCustomer,
  onContinue,
  onBack,
}: {
  context: CollectContext;
  amount: number;
  amountFormatted: string;
  currency: string | null;
  minimumPayment: number;
  maximumPayment: number;
  belowMinimum: boolean;
  aboveMaximum: boolean;
  totalSteps: number;
  onKeyPress: (k: string) => void;
  onDelete: () => void;
  onChangeCustomer?: () => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('paymentNew.amount.title')}
        subtitle={t('paymentNew.stepOf', { current: 1, total: totalSteps })}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={totalSteps} current={1} />
      </View>

      <View style={styles.amountBody}>
        <CustomerChip
          name={context.customerName}
          meta={context.shortLabel}
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
          {aboveMaximum ? (
            <Text variant="meta" tone="danger" style={styles.amountMinimum}>
              {t('paymentNew.amount.aboveMax')}
              {currency ? `${currency} ` : ''}
              {formatAmount(String(maximumPayment))}
            </Text>
          ) : minimumPayment > 0 ? (
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
          disabled={amount <= 0 || belowMinimum || aboveMaximum}
        />
      </View>
    </View>
  );
}

function MethodStep({
  providers,
  providerId,
  onChangeProvider,
  payerPhone,
  payerPhoneOverride,
  onChangePayerPhone,
  totalSteps,
  onBack,
  onContinue,
}: {
  providers: { id: number; name: string }[];
  providerId: number;
  onChangeProvider: (id: number) => void;
  payerPhone: string | null;
  payerPhoneOverride: string | null;
  onChangePayerPhone: (next: string | null) => void;
  totalSteps: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isProvider = providerId !== CASH_PAYMENT_PROVIDER;
  const missingPayer = isProvider && !payerPhone && !payerPhoneOverride;

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('paymentNew.method.title')}
        subtitle={t('paymentNew.stepOf', { current: 2, total: totalSteps })}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={totalSteps} current={2} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.methodContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="body" tone="muted" style={styles.methodIntro}>
            {t('paymentNew.method.hint')}
          </Text>

          <PaymentMethodPicker
            providers={providers}
            value={providerId}
            onChange={onChangeProvider}
          />

          {isProvider ? (
            <Card style={styles.methodPayerCard}>
              <PayerPhoneField
                resolvedPhone={payerPhone}
                override={payerPhoneOverride}
                onChangeOverride={onChangePayerPhone}
                defaultIso="MZ"
              />
            </Card>
          ) : null}

          {missingPayer ? (
            <Callout tone="warning" style={styles.methodCallout}>
              <Text variant="body" tone="secondary">
                {t('paymentNew.method.payerRequired')}
              </Text>
            </Callout>
          ) : null}
        </ScrollView>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <Button
            tone="accent"
            label={t('paymentNew.method.next')}
            onPress={onContinue}
            disabled={missingPayer}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function ConfirmStep({
  context,
  amount,
  amountFormatted,
  currency,
  providerId,
  providerName,
  payerPhone,
  totalSteps,
  onBack,
  onConfirm,
  loading,
}: {
  context: CollectContext;
  amount: number;
  amountFormatted: string;
  currency: string | null;
  providerId: number;
  providerName: string | null;
  payerPhone: string | null;
  totalSteps: number;
  onBack: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isProvider = providerId !== CASH_PAYMENT_PROVIDER;

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('paymentNew.confirm.title')}
        subtitle={t('paymentNew.stepOf', {
          current: totalSteps - 1,
          total: totalSteps,
        })}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={totalSteps} current={totalSteps - 1} />
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
          <View style={styles.confirmMethodRow}>
            <PaymentMethodLogo providerId={providerId} height={22} />
            <Text variant="body" tone="secondary">
              {isProvider
                ? (providerName ?? t('paymentMethod.providerFallback'))
                : currency
                  ? t('paymentNew.confirm.inCashWith', { currency })
                  : t('paymentNew.confirm.inCash')}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.confirmCardWrap}>
          <Card padded={false} style={styles.confirmCard}>
            <View style={styles.customerRow}>
              <View style={styles.customerAvatar}>
                <Text variant="bodyEmphasis" tone="brand">
                  {avatarInitials(context.customerName)}
                </Text>
              </View>
              <View style={styles.customerBody}>
                <Text variant="bodyEmphasis" numberOfLines={1}>
                  {context.customerName}
                </Text>
                {context.phone ? (
                  <Text variant="meta" tone="muted" numberOfLines={1}>
                    {context.phone}
                  </Text>
                ) : null}
              </View>
            </View>

            <DataRow
              label={t('paymentNew.confirm.for')}
              value={
                <Pill
                  label={context.forLabel}
                  tone="blue"
                  leading={
                    <Feather
                      name={context.iconName}
                      size={12}
                      color={semantic.blue}
                    />
                  }
                />
              }
            />
            {context.serial ? (
              <DataRow
                label={t('paymentNew.confirm.device')}
                value={<MonoChip value={truncateUuid(context.serial)} />}
              />
            ) : null}
            {isProvider && payerPhone ? (
              <DataRow
                label={t('paymentNew.confirm.payer')}
                value={<MonoChip value={payerPhone} />}
              />
            ) : null}
          </Card>

          <Callout tone="warning" style={styles.confirmCallout}>
            <Text variant="body" tone="secondary">
              {isProvider
                ? t('paymentNew.confirm.providerWarning')
                : t('paymentNew.confirm.warning')}
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
          label={
            isProvider
              ? t('paymentNew.confirm.request')
              : t('paymentNew.confirm.submit')
          }
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
  context,
  amountFormatted,
  reference,
  currency,
  transactionId,
  providerId,
  onClose,
  onNext,
}: {
  context: CollectContext;
  amountFormatted: string;
  reference: string;
  currency: string | null;
  transactionId: number | null;
  providerId: number;
  onClose: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const tokenState = useTokenPolling(api, transactionId);
  const isProvider = providerId !== CASH_PAYMENT_PROVIDER;

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
            {context.phone
              ? t('paymentNew.result.receiptSent', { phone: context.phone })
              : t('paymentNew.result.recorded')}
          </Text>
        </View>

        {isProvider ? (
          <Callout tone="info" style={styles.successNote}>
            <Text variant="body" tone="secondary">
              {t('paymentNew.result.providerNote')}
            </Text>
          </Callout>
        ) : null}

        <TokenCard token={tokenState.token} state={tokenState.status} />

        <ReceiptCard
          amount={amountFormatted}
          currency={
            currency
              ? `${currency} · ${context.shortLabel.toLowerCase()}`
              : context.shortLabel
          }
          customerName={context.customerName}
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
    const MAX_ATTEMPTS = 12;

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
        // retried below
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
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semantic.paper,
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

  /* Method */
  methodContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  methodIntro: {
    marginBottom: spacing.xs,
  },
  methodPayerCard: {
    marginTop: spacing.xs,
  },
  methodCallout: {
    marginTop: 0,
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
  confirmMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
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
  successNote: {
    width: '100%',
    marginTop: 0,
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
