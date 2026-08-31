import { Feather } from '@expo/vector-icons';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AgentAssignedAppliance,
  applianceDeviceType,
  AppliancePaymentType,
  fetchAgentAssignedAppliances,
  fetchUnassignedDevices,
  isPaygoAppliance,
  sellAppliance,
} from '@/api/appliances';
import {
  Customer,
  CustomerPage,
  fetchCustomerPage,
  searchCustomers,
} from '@/api/customer';
import {
  CASH_PAYMENT_PROVIDER,
  PaymentProvider,
  fetchPaymentProviders,
} from '@/api/transactions';
import { usePaymentStatus } from '@/api/usePaymentStatus';
import { useSession } from '@/auth/SessionContext';
import {
  Button,
  Callout,
  Card,
  CustomerChip,
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
  SecondaryHeader,
  Select,
  SelectOption,
  StripedThumbnail,
  SuccessCheckmark,
  Text,
  TextField,
  toIsoDate,
  useToast,
} from '@/components';
import { fonts, radii, semantic, spacing } from '@/theme';
import { extractServerError as errorMessage } from '@/utils/errorMessage';
import { initials } from '@/utils/format';
import { useCurrency } from '@/utils/useCurrency';

type Step =
  | 'customer'
  | 'unit'
  | 'plan'
  | 'method'
  | 'confirm'
  | 'checkout'
  | 'awaiting'
  | 'success'
  | 'failed';

type PlanId = 'cash' | 'twelve' | 'custom' | 'energy';

type RateType = 'monthly' | 'weekly';

type Plan = {
  id: PlanId;
  labelKey: string;
  descriptionKey: string;
  tenure: number;
  downPaymentRatio: number;
};

const PLANS: Plan[] = [
  {
    id: 'cash',
    labelKey: 'saleNew.plans.cash.title',
    descriptionKey: 'saleNew.plans.cash.subtitle',
    tenure: 1,
    downPaymentRatio: 1,
  },
  {
    id: 'twelve',
    labelKey: 'saleNew.plans.twelve.title',
    descriptionKey: 'saleNew.plans.twelve.subtitle',
    tenure: 12,
    downPaymentRatio: 0.1,
  },
  {
    id: 'custom',
    labelKey: 'saleNew.plans.custom.title',
    descriptionKey: 'saleNew.plans.custom.subtitle',
    tenure: 6,
    downPaymentRatio: 0.1,
  },
  {
    id: 'energy',
    labelKey: 'saleNew.plans.energy.title',
    descriptionKey: 'saleNew.plans.energy.subtitle',
    tenure: 0,
    downPaymentRatio: 0,
  },
];

const HINT_KEY_BY_INDEX: Record<number, string> = {
  0: 'saleNew.tier.starter',
  1: 'saleNew.tier.popular',
  2: 'saleNew.tier.large',
};

export default function SellShsScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { api } = useSession();
  const queryClient = useQueryClient();
  const { format: formatCurrency, symbol: currency } = useCurrency();

  const [step, setStep] = useState<Step>('customer');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [assignment, setAssignment] = useState<AgentAssignedAppliance | null>(
    null,
  );
  const [planId, setPlanId] = useState<PlanId>('twelve');
  const [rateType, setRateType] = useState<RateType>('monthly');
  const [customTenure, setCustomTenure] = useState('6');
  const [customDeposit, setCustomDeposit] = useState('');
  const [eaasPricePerDay, setEaasPricePerDay] = useState('');
  const [eaasMinTopUp, setEaasMinTopUp] = useState('');
  const [eaasDownPayment, setEaasDownPayment] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');
  const [transactionRef, setTransactionRef] = useState<string | null>(null);
  const [providerId, setProviderId] = useState(CASH_PAYMENT_PROVIDER);
  const [payerPhoneOverride, setPayerPhoneOverride] = useState<string | null>(
    null,
  );
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<PaymentFailureDetail | null>(null);

  const plan = useMemo(() => PLANS.find((p) => p.id === planId)!, [planId]);
  const cost = assignment?.cost ?? 0;
  const isCustom = planId === 'custom';
  const isEaas = planId === 'energy';
  const customTenureNum = Math.max(1, parseAmount(customTenure));
  const customDepositNum = parseAmount(customDeposit);
  const eaasPricePerDayNum = parseAmount(eaasPricePerDay, { round: true });
  const eaasMinTopUpNum = parseAmount(eaasMinTopUp, { round: true });
  const eaasDownPaymentNum = parseAmount(eaasDownPayment);
  const downPayment = isEaas
    ? Math.min(eaasDownPaymentNum, cost)
    : isCustom
      ? Math.min(customDepositNum, cost)
      : Math.round(cost * plan.downPaymentRatio);
  const tenure = isEaas ? 0 : isCustom ? customTenureNum : plan.tenure;
  const serialRequired = !!assignment && isPaygoAppliance(assignment);
  const isWeekly = rateType === 'weekly';
  const remaining = Math.max(0, cost - downPayment);
  const installmentAmount =
    !isEaas && tenure > 1 ? Math.round(remaining / tenure) : 0;
  const firstPaymentDate = useMemo(() => {
    const d = new Date();
    if (isWeekly) d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    return d;
  }, [isWeekly]);

  const providersQuery = useQuery({
    queryKey: ['payment-providers'],
    queryFn: () => fetchPaymentProviders(api!),
    enabled: !!api,
    staleTime: 0,
    gcTime: 0,
  });

  const providers = providersQuery.data ?? [];
  const isProvider = providerId !== CASH_PAYMENT_PROVIDER;
  const resolvedPayerPhone = customer ? customerPhone(customer) : null;
  const payerPhone = payerPhoneOverride ?? resolvedPayerPhone;
  const collectsProviderDownPayment = providers.length > 0 && downPayment > 0;
  const totalSteps = collectsProviderDownPayment ? 5 : 4;

  const statusEnabled =
    step === 'awaiting' && isProvider && transactionId != null;
  const { progress, check } = usePaymentStatus(
    api,
    transactionId,
    statusEnabled,
  );

  const sellMutation = useMutation({
    mutationFn: () =>
      sellAppliance(api!, {
        person_id: customer!.id,
        agent_assigned_appliance_id: assignment!.id,
        payment_type: (isEaas
          ? 'energy_service'
          : 'installment') as AppliancePaymentType,
        down_payment: downPayment,
        ...(isEaas
          ? {
              price_per_day: eaasPricePerDayNum,
              ...(eaasMinTopUpNum > 0
                ? { minimum_payable_amount: eaasMinTopUpNum }
                : {}),
            }
          : {
              tenure,
              rate_type: rateType,
              first_payment_date: toIsoDate(firstPaymentDate),
            }),
        ...(deviceSerial.trim() ? { device_serial: deviceSerial.trim() } : {}),
        ...(isProvider ? { payment_provider: providerId } : {}),
        ...(isProvider && payerPhoneOverride
          ? { payer_phone: payerPhoneOverride }
          : {}),
      }),
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
          title: t('saleNew.failure.timeoutTitle'),
          body: t('saleNew.failure.timeoutBody'),
        });
        setStep('failed');
      } else if (!isProvider) {
        setStep('success');
      }

      await queryClient.invalidateQueries({ queryKey: ['agent-balance'] });
      await queryClient.invalidateQueries({ queryKey: ['agent-transactions'] });
      await queryClient.invalidateQueries({
        queryKey: ['agent-transactions-today'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['agent-transactions-list'],
      });
      await queryClient.invalidateQueries({ queryKey: ['sold-appliances'] });
    },
    onError: async (err) => {
      if (isAxiosError(err) && err.code === 'ECONNABORTED') {
        setFailure({
          title: t('saleNew.failure.timeoutTitle'),
          body: t('saleNew.failure.timeoutBody'),
        });
        setStep('failed');
        return;
      }

      const message = errorMessage(err, t('saleNew.failed'));

      if (isAxiosError(err) && err.response?.status === 422) {
        await queryClient.invalidateQueries({
          queryKey: ['payment-providers'],
        });
        if (isProvider) setStep('method');
        toast.showError(message);
        return;
      }

      if (isProvider) {
        setFailure({
          title: t('saleNew.failure.rejectedTitle'),
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
        title: t('saleNew.failure.rejectedTitle'),
        body: t('saleNew.failure.rejectedBody'),
      });
      setStep('failed');
    }
  }, [progress, t]);

  function submitSale() {
    if (isProvider) {
      setFailure(null);
      setStep('awaiting');
    }
    sellMutation.mutate();
  }

  function reset() {
    setStep('customer');
    setCustomer(null);
    setAssignment(null);
    setPlanId('twelve');
    setRateType('monthly');
    setCustomTenure('6');
    setCustomDeposit('');
    setEaasPricePerDay('');
    setEaasMinTopUp('');
    setEaasDownPayment('');
    setDeviceSerial('');
    setTransactionRef(null);
    setProviderId(CASH_PAYMENT_PROVIDER);
    setPayerPhoneOverride(null);
    setTransactionId(null);
    setRedirectUrl(null);
    setFailure(null);
    sellMutation.reset();
  }

  if (step === 'customer') {
    return (
      <CustomerStep
        totalSteps={totalSteps}
        onPick={(c) => {
          setCustomer(c);
          setStep('unit');
        }}
        onBack={() => router.back()}
      />
    );
  }

  if (step === 'unit' && customer) {
    return (
      <UnitStep
        totalSteps={totalSteps}
        customer={customer}
        selectedId={assignment?.id ?? null}
        onChangeCustomer={() => setStep('customer')}
        onSelect={(next) => {
          if (next.id !== assignment?.id) setDeviceSerial('');
          setAssignment(next);
        }}
        onContinue={() => assignment && setStep('plan')}
        onBack={() => setStep('customer')}
        formatCurrency={formatCurrency}
      />
    );
  }

  if (step === 'plan' && customer && assignment) {
    return (
      <PlanStep
        totalSteps={totalSteps}
        customer={customer}
        assignment={assignment}
        planId={planId}
        onPickPlan={setPlanId}
        rateType={rateType}
        onChangeRateType={setRateType}
        customTenure={customTenure}
        onChangeCustomTenure={setCustomTenure}
        customDeposit={customDeposit}
        onChangeCustomDeposit={setCustomDeposit}
        eaasPricePerDay={eaasPricePerDay}
        onChangeEaasPricePerDay={setEaasPricePerDay}
        eaasMinTopUp={eaasMinTopUp}
        onChangeEaasMinTopUp={setEaasMinTopUp}
        eaasDownPayment={eaasDownPayment}
        onChangeEaasDownPayment={setEaasDownPayment}
        deviceSerial={deviceSerial}
        onChangeSerial={setDeviceSerial}
        downPayment={downPayment}
        tenure={tenure}
        installmentAmount={installmentAmount}
        isEaas={isEaas}
        canContinue={
          (isEaas
            ? eaasPricePerDayNum > 0
            : tenure >= 1 && (!isCustom || downPayment >= 0)) &&
          (!serialRequired || deviceSerial.trim().length > 0)
        }
        formatCurrency={formatCurrency}
        onBack={() => setStep('unit')}
        onContinue={() =>
          setStep(collectsProviderDownPayment ? 'method' : 'confirm')
        }
      />
    );
  }

  if (step === 'method' && customer) {
    return (
      <MethodStep
        totalSteps={totalSteps}
        providers={providers}
        providerId={providerId}
        onChangeProvider={setProviderId}
        payerPhone={resolvedPayerPhone}
        payerPhoneOverride={payerPhoneOverride}
        onChangePayerPhone={setPayerPhoneOverride}
        downPayment={downPayment}
        formatCurrency={formatCurrency}
        onBack={() => setStep('plan')}
        onContinue={() => setStep('confirm')}
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
        providerName={providers.find((p) => p.id === providerId)?.name ?? null}
        payerPhone={payerPhone}
        amountFormatted={formatCurrency(downPayment)}
        currency={null}
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
        restartLabel={t('saleNew.failure.startOver')}
        onClose={() => router.replace('/(app)/(tabs)')}
        onRestart={reset}
      />
    );
  }

  if (step === 'confirm' && customer && assignment) {
    return (
      <ConfirmStep
        totalSteps={totalSteps}
        customer={customer}
        assignment={assignment}
        plan={plan}
        tenure={tenure}
        rateType={rateType}
        downPayment={downPayment}
        installmentAmount={installmentAmount}
        firstPaymentDate={firstPaymentDate}
        deviceSerial={deviceSerial}
        isEaas={isEaas}
        eaasPricePerDay={eaasPricePerDayNum}
        eaasMinTopUp={eaasMinTopUpNum}
        formatCurrency={formatCurrency}
        currency={currency}
        loading={sellMutation.isPending}
        providerId={providerId}
        providerName={providers.find((p) => p.id === providerId)?.name ?? null}
        payerPhone={payerPhone}
        onBack={() => setStep(collectsProviderDownPayment ? 'method' : 'plan')}
        onConfirm={submitSale}
      />
    );
  }

  if (step === 'success' && customer && assignment) {
    return (
      <SuccessStep
        customer={customer}
        assignment={assignment}
        downPayment={downPayment}
        isEaas={isEaas}
        providerId={providerId}
        reference={transactionRef ?? '—'}
        formatCurrency={formatCurrency}
        onClose={() => router.replace('/(app)/(tabs)')}
        onNext={reset}
      />
    );
  }

  return null;
}

function CustomerStep({
  totalSteps,
  onPick,
  onBack,
}: {
  totalSteps: number;
  onPick: (c: Customer) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { api } = useSession();
  const [term, setTerm] = useState('');

  const trimmed = term.trim();
  const isSearching = trimmed.length >= 2;

  const listQuery = useInfiniteQuery({
    queryKey: ['agent-customers'],
    queryFn: ({ pageParam }) => fetchCustomerPage(api!, pageParam ?? 1),
    initialPageParam: 1,
    getNextPageParam: (lastPage: CustomerPage) =>
      lastPage.currentPage < lastPage.lastPage
        ? lastPage.currentPage + 1
        : undefined,
    enabled: !!api && !isSearching,
  });

  const searchQuery = useQuery({
    queryKey: ['customer-search', trimmed],
    queryFn: () => searchCustomers(api!, trimmed),
    enabled: !!api && isSearching,
  });

  const items = useMemo<Customer[]>(() => {
    if (isSearching) return searchQuery.data ?? [];
    return (listQuery.data?.pages ?? []).flatMap((p) => p.data);
  }, [isSearching, searchQuery.data, listQuery.data]);

  const loading = isSearching ? searchQuery.isLoading : listQuery.isLoading;

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('saleNew.pickCustomer.title')}
        subtitle={t('saleNew.stepOf', { current: 1, total: totalSteps })}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={totalSteps} current={1} />
      </View>

      <View style={styles.searchBlock}>
        <Text variant="sectionLabel" tone="muted">
          {t('saleNew.pickCustomer.label')}
        </Text>
        <TextField
          placeholder={t('saleNew.pickCustomer.search')}
          autoCapitalize="none"
          autoCorrect={false}
          value={term}
          onChangeText={setTerm}
          containerStyle={styles.searchField}
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={semantic.ink3} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyPadded}>
          <Card>
            <Text variant="meta" tone="muted">
              {isSearching
                ? t('saleNew.pickCustomer.noMatches')
                : t('saleNew.pickCustomer.noCustomers')}
            </Text>
          </Card>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.listSep} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (
              !isSearching &&
              listQuery.hasNextPage &&
              !listQuery.isFetchingNextPage
            ) {
              void listQuery.fetchNextPage();
            }
          }}
          ListFooterComponent={
            !isSearching &&
            (listQuery.isFetchingNextPage || listQuery.hasNextPage) ? (
              <View style={styles.listFooter}>
                <ActivityIndicator color={semantic.ink3} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              style={({ pressed }) => [
                styles.customerRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.customerAvatar}>
                <Text variant="bodyEmphasis" tone="brand">
                  {initials(`${item.name} ${item.surname}`)}
                </Text>
              </View>
              <View style={styles.customerBody}>
                <Text variant="bodyEmphasis" numberOfLines={1}>
                  {item.name} {item.surname}
                </Text>
                <Text variant="meta" tone="muted" numberOfLines={1}>
                  {customerPhone(item) ?? '—'}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={semantic.ink3} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function UnitStep({
  totalSteps,
  customer,
  selectedId,
  onChangeCustomer,
  onSelect,
  onContinue,
  onBack,
  formatCurrency,
}: {
  totalSteps: number;
  customer: Customer;
  selectedId: number | null;
  onChangeCustomer: () => void;
  onSelect: (assignment: AgentAssignedAppliance) => void;
  onContinue: () => void;
  onBack: () => void;
  formatCurrency: (n: number) => string;
}) {
  const { t } = useTranslation();
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const appliances = useQuery({
    queryKey: ['agent-assigned-appliances'],
    queryFn: () => fetchAgentAssignedAppliances(api!),
    enabled: !!api,
  });

  const items = appliances.data ?? [];

  const customerName = `${customer.name} ${customer.surname}`.trim();

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('saleNew.pickSystem.title')}
        subtitle={t('saleNew.stepOf', { current: 2, total: totalSteps })}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={totalSteps} current={2} />
      </View>

      <ScrollView contentContainerStyle={styles.unitContent}>
        <CustomerChip
          name={customerName}
          meta={customerPhone(customer) ?? t('saleNew.pickSystem.newCustomer')}
          onChange={onChangeCustomer}
          style={styles.unitChip}
        />

        <Text variant="sectionLabel" tone="muted" style={styles.unitSection}>
          {t('saleNew.pickSystem.label')}
        </Text>

        {appliances.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={semantic.ink3} />
          </View>
        ) : items.length === 0 ? (
          <Card>
            <Text variant="meta" tone="muted">
              {t('saleNew.pickSystem.noUnits')}
            </Text>
          </Card>
        ) : (
          <View style={styles.unitList}>
            {items.map((a, idx) => {
              const selected = a.id === selectedId;
              const name =
                a.appliance?.name ??
                a.appliance_type?.name ??
                t('saleNew.pickSystem.shsUnit');
              const hintKey = HINT_KEY_BY_INDEX[idx];
              const hint = hintKey ? t(hintKey) : null;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => onSelect(a)}
                  style={({ pressed }) => [
                    styles.unitRing,
                    selected && styles.unitRingSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.unitCard,
                      selected && styles.unitCardSelected,
                    ]}
                  >
                    <StripedThumbnail size={56} label={shortLabel(name)} />
                    <View style={styles.unitBody}>
                      <View style={styles.unitTitleRow}>
                        <Text
                          variant="screenTitle"
                          tone={selected ? 'accent' : 'brand'}
                          numberOfLines={1}
                        >
                          {name}
                        </Text>
                        {hint ? (
                          <Pill
                            label={hint}
                            tone="neutral"
                            style={styles.unitHint}
                          />
                        ) : null}
                      </View>
                      <Text
                        variant="mono"
                        tone="primary"
                        style={styles.unitPrice}
                      >
                        {formatCurrency(a.cost)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.radio,
                        selected && styles.radioSelectedOrange,
                      ]}
                    >
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
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
        <Button
          label={t('saleNew.plan.back')}
          tone="ghost"
          onPress={onBack}
          style={styles.footerBack}
        />
        <Button
          tone="accent"
          label={t('saleNew.plan.title')}
          disabled={selectedId == null}
          onPress={onContinue}
          style={styles.footerPrimary}
        />
      </View>
    </View>
  );
}

function PlanStep({
  totalSteps,
  customer,
  assignment,
  planId,
  onPickPlan,
  rateType,
  onChangeRateType,
  customTenure,
  onChangeCustomTenure,
  customDeposit,
  onChangeCustomDeposit,
  eaasPricePerDay,
  onChangeEaasPricePerDay,
  eaasMinTopUp,
  onChangeEaasMinTopUp,
  eaasDownPayment,
  onChangeEaasDownPayment,
  deviceSerial,
  onChangeSerial,
  downPayment,
  tenure,
  installmentAmount,
  isEaas,
  canContinue,
  formatCurrency,
  onBack,
  onContinue,
}: {
  totalSteps: number;
  customer: Customer;
  assignment: AgentAssignedAppliance;
  planId: PlanId;
  onPickPlan: (id: PlanId) => void;
  rateType: RateType;
  onChangeRateType: (v: RateType) => void;
  customTenure: string;
  onChangeCustomTenure: (v: string) => void;
  customDeposit: string;
  onChangeCustomDeposit: (v: string) => void;
  eaasPricePerDay: string;
  onChangeEaasPricePerDay: (v: string) => void;
  eaasMinTopUp: string;
  onChangeEaasMinTopUp: (v: string) => void;
  eaasDownPayment: string;
  onChangeEaasDownPayment: (v: string) => void;
  deviceSerial: string;
  onChangeSerial: (v: string) => void;
  downPayment: number;
  tenure: number;
  installmentAmount: number;
  isEaas: boolean;
  canContinue: boolean;
  formatCurrency: (n: number) => string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const isWeekly = rateType === 'weekly';
  const perPeriod = isWeekly
    ? t('saleNew.plan.perWeek')
    : t('saleNew.plan.perMonth');
  const customerName = `${customer.name} ${customer.surname}`.trim();
  const unitName =
    assignment.appliance?.name ??
    assignment.appliance_type?.name ??
    t('saleNew.pickSystem.shsUnit');

  const applianceId = assignment.appliance?.id ?? null;
  const deviceType = applianceDeviceType(assignment);
  const serialRequired = isPaygoAppliance(assignment);
  const showSerialPicker = deviceType != null;
  const unassignedQuery = useQuery({
    queryKey: ['unassigned-devices', applianceId, deviceType],
    queryFn: () => fetchUnassignedDevices(api!, applianceId!, deviceType!),
    enabled: !!api && applianceId != null && deviceType != null,
  });

  const serialOptions = useMemo<SelectOption<string>[]>(() => {
    return (unassignedQuery.data ?? [])
      .filter((d) => !!d.device_serial)
      .map((d) => {
        const description = [
          d.device?.manufacturer?.name,
          d.device?.appliance?.name,
        ]
          .filter(Boolean)
          .join(' · ');
        return {
          value: d.device_serial,
          label: d.device_serial,
          description: description || undefined,
        };
      });
  }, [unassignedQuery.data]);

  const serialError = unassignedQuery.isError
    ? t('saleNew.errors.serialLoad')
    : applianceId == null
      ? t('saleNew.errors.applianceMissing')
      : serialRequired &&
          !unassignedQuery.isLoading &&
          serialOptions.length === 0
        ? t('saleNew.errors.noUnits')
        : undefined;

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('saleNew.plan.title')}
        subtitle={t('saleNew.planSubtitle', {
          customer: customerName,
          unit: unitName,
        })}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={totalSteps} current={3} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.planContent}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text variant="body" tone="muted">
                {t('saleNew.plan.total')}
              </Text>
              <Text variant="bodyEmphasis">
                {formatCurrency(assignment.cost)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="body" tone="muted">
                {isEaas
                  ? t('saleNew.plan.cashToday')
                  : t('saleNew.plan.depositToday')}
              </Text>
              <Text
                variant="screenTitle"
                style={{ color: semantic.orange, fontFamily: fonts.ptBold }}
              >
                {formatCurrency(downPayment)}
              </Text>
            </View>
          </Card>

          <Text variant="sectionLabel" tone="muted" style={styles.planSection}>
            {t('saleNew.plan.howWillTheyPay')}
          </Text>

          {planId === 'twelve' || planId === 'custom' ? (
            <View style={styles.freqToggle}>
              {(['monthly', 'weekly'] as RateType[]).map((value) => {
                const active = rateType === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => onChangeRateType(value)}
                    style={[
                      styles.freqOption,
                      active && styles.freqOptionActive,
                    ]}
                  >
                    <Text
                      variant="bodyEmphasis"
                      style={{
                        color: active ? semantic.blue : semantic.ink2,
                      }}
                    >
                      {value === 'weekly'
                        ? t('saleNew.plan.freqWeekly')
                        : t('saleNew.plan.freqMonthly')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.planList}>
            {PLANS.map((p) => {
              const selected = p.id === planId;
              const isCustom = p.id === 'custom';

              const cardTenure = isCustom ? tenure : p.tenure;
              const isInstallment = cardTenure > 1;
              const cardInstallment = isInstallment
                ? isCustom
                  ? installmentAmount
                  : Math.round(
                      (assignment.cost * (1 - p.downPaymentRatio)) / p.tenure,
                    )
                : 0;
              const cardTitle =
                p.id === 'twelve' && isWeekly
                  ? t('saleNew.plan.paygTitleWeek', { count: p.tenure })
                  : t(p.labelKey);

              return (
                <View key={p.id} style={styles.planItem}>
                  <Pressable
                    onPress={() => onPickPlan(p.id)}
                    style={({ pressed }) => [
                      styles.planRing,
                      selected && styles.planRingSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.planCard,
                        selected && styles.planCardSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.radio,
                          selected && styles.radioSelectedBlue,
                        ]}
                      >
                        {selected ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View style={styles.planBody}>
                        <View style={styles.planTitleRow}>
                          <Text variant="bodyEmphasis" tone="primary">
                            {cardTitle}
                          </Text>
                          {isInstallment && cardInstallment > 0 ? (
                            <Text
                              variant="mono"
                              style={{
                                color: selected ? semantic.blue : semantic.ink2,
                                fontFamily: fonts.monoBold,
                              }}
                            >
                              {formatCurrency(cardInstallment)} {perPeriod}
                            </Text>
                          ) : null}
                        </View>
                        <Text variant="meta" tone="muted">
                          {t(p.descriptionKey)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  {isCustom && selected ? (
                    <View style={styles.customPanel}>
                      <View style={styles.customRow}>
                        <View style={styles.customField}>
                          <TextField
                            label={
                              isWeekly
                                ? t('saleNew.plan.weeks')
                                : t('saleNew.plan.months')
                            }
                            placeholder={t('saleNew.plan.monthsDefault')}
                            keyboardType="number-pad"
                            mono
                            value={customTenure}
                            onChangeText={onChangeCustomTenure}
                          />
                        </View>
                        <View style={styles.customField}>
                          <TextField
                            label={t('saleNew.plan.depositLabel')}
                            placeholder={t('saleNew.plan.depositDefault')}
                            keyboardType="decimal-pad"
                            mono
                            value={customDeposit}
                            onChangeText={onChangeCustomDeposit}
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {p.id === 'energy' && selected ? (
                    <View style={styles.customPanel}>
                      <View style={styles.customRow}>
                        <View style={styles.customField}>
                          <TextField
                            label={t('saleNew.plan.pricePerDay')}
                            placeholder={t('saleNew.plan.pricePerDayDefault')}
                            keyboardType="decimal-pad"
                            mono
                            value={eaasPricePerDay}
                            onChangeText={onChangeEaasPricePerDay}
                          />
                        </View>
                        <View style={styles.customField}>
                          <TextField
                            label={t('saleNew.plan.minTopUp')}
                            placeholder={t('saleNew.plan.minTopUpDefault')}
                            keyboardType="decimal-pad"
                            mono
                            value={eaasMinTopUp}
                            onChangeText={onChangeEaasMinTopUp}
                          />
                        </View>
                      </View>
                      <View style={styles.customRow}>
                        <View style={styles.customField}>
                          <TextField
                            label={t('saleNew.plan.downPayment')}
                            placeholder={t('saleNew.plan.downPaymentDefault')}
                            keyboardType="decimal-pad"
                            mono
                            value={eaasDownPayment}
                            onChangeText={onChangeEaasDownPayment}
                          />
                        </View>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          <Callout tone="info" style={styles.planCallout}>
            <Text variant="meta" tone="secondary">
              {isEaas
                ? t('saleNew.plan.easHint')
                : !serialRequired
                  ? t('saleNew.plan.installmentHint')
                  : isWeekly
                    ? t('saleNew.plan.paygHintWeekly')
                    : t('saleNew.plan.paygHint')}
            </Text>
          </Callout>

          {showSerialPicker ? (
            <Select<string>
              label={
                serialRequired
                  ? t('saleNew.plan.unitSerial')
                  : t('saleNew.plan.unitSerialOptional')
              }
              placeholder={t('saleNew.plan.pickUnassigned')}
              searchable
              searchPlaceholder={t('saleNew.plan.searchSerial')}
              options={serialOptions}
              value={deviceSerial || null}
              onChange={onChangeSerial}
              loading={unassignedQuery.isLoading}
              error={serialError}
              disabled={serialOptions.length === 0}
              containerStyle={styles.planSerial}
            />
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
            label={t('saleNew.plan.back')}
            tone="ghost"
            onPress={onBack}
            style={styles.footerBack}
          />
          <Button
            tone="accent"
            label={
              isEaas
                ? downPayment > 0
                  ? t('saleNew.plan.collectCash', {
                      amount: formatCurrency(downPayment),
                    })
                  : t('saleNew.plan.continue')
                : t('saleNew.plan.collectDeposit', {
                    amount: formatCurrency(downPayment),
                  })
            }
            onPress={onContinue}
            disabled={!canContinue}
            style={styles.footerPrimary}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function MethodStep({
  totalSteps,
  providers,
  providerId,
  onChangeProvider,
  payerPhone,
  payerPhoneOverride,
  onChangePayerPhone,
  downPayment,
  formatCurrency,
  onBack,
  onContinue,
}: {
  totalSteps: number;
  providers: PaymentProvider[];
  providerId: number;
  onChangeProvider: (id: number) => void;
  payerPhone: string | null;
  payerPhoneOverride: string | null;
  onChangePayerPhone: (next: string | null) => void;
  downPayment: number;
  formatCurrency: (n: number) => string;
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
        title={t('saleNew.method.title')}
        subtitle={t('saleNew.stepOf', { current: 4, total: totalSteps })}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={totalSteps} current={4} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.methodContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="body" tone="muted">
            {t('saleNew.method.hint', {
              amount: formatCurrency(downPayment),
            })}
          </Text>

          <PaymentMethodPicker
            providers={providers}
            value={providerId}
            onChange={onChangeProvider}
          />

          {isProvider ? (
            <Card>
              <PayerPhoneField
                resolvedPhone={payerPhone}
                override={payerPhoneOverride}
                onChangeOverride={onChangePayerPhone}
                defaultIso="MZ"
              />
            </Card>
          ) : null}

          {isProvider ? (
            <Callout tone="warning">
              <Text variant="body" tone="secondary">
                {t('saleNew.method.rollbackWarning')}
              </Text>
            </Callout>
          ) : null}

          {missingPayer ? (
            <Callout tone="warning">
              <Text variant="body" tone="secondary">
                {t('saleNew.method.payerRequired')}
              </Text>
            </Callout>
          ) : null}
        </ScrollView>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <Button
            tone="accent"
            label={t('saleNew.method.next')}
            onPress={onContinue}
            disabled={missingPayer}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function ConfirmStep({
  totalSteps,
  customer,
  assignment,
  plan,
  tenure,
  rateType,
  downPayment,
  installmentAmount,
  firstPaymentDate,
  deviceSerial,
  isEaas,
  eaasPricePerDay,
  eaasMinTopUp,
  formatCurrency,
  currency,
  loading,
  providerId,
  providerName,
  payerPhone,
  onBack,
  onConfirm,
}: {
  totalSteps: number;
  customer: Customer;
  assignment: AgentAssignedAppliance;
  plan: Plan;
  tenure: number;
  rateType: RateType;
  downPayment: number;
  installmentAmount: number;
  firstPaymentDate: Date;
  deviceSerial: string;
  isEaas: boolean;
  eaasPricePerDay: number;
  eaasMinTopUp: number;
  formatCurrency: (n: number) => string;
  currency: string | null;
  loading: boolean;
  providerId: number;
  providerName: string | null;
  payerPhone: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isProvider = providerId !== CASH_PAYMENT_PROVIDER;
  const customerName = `${customer.name} ${customer.surname}`.trim();
  const phone = customerPhone(customer);
  const unitName =
    assignment.appliance?.name ??
    assignment.appliance_type?.name ??
    t('saleNew.pickSystem.shsUnit');

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('saleNew.confirm.title')}
        subtitle={t('saleNew.stepOf', {
          current: totalSteps,
          total: totalSteps,
        })}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={totalSteps} current={totalSteps} />
      </View>

      <ScrollView contentContainerStyle={styles.confirmContent}>
        <View style={styles.confirmHero}>
          <Text variant="sectionLabel" tone="muted">
            {isEaas
              ? t('saleNew.confirm.labelCash')
              : t('saleNew.confirm.labelDeposit')}
          </Text>
          <Text
            variant="heroNumber"
            style={[styles.confirmAmount, { color: semantic.orange }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatCurrency(downPayment)}
          </Text>
          <View style={styles.confirmMethodRow}>
            {isEaas && downPayment === 0 ? null : (
              <PaymentMethodLogo providerId={providerId} height={22} />
            )}
            <Text variant="body" tone="secondary">
              {isEaas && downPayment === 0
                ? t('saleNew.confirm.activationOnly')
                : isProvider
                  ? (providerName ?? t('paymentMethod.providerFallback'))
                  : currency
                    ? t('saleNew.confirm.inCashWith', { currency })
                    : t('saleNew.confirm.inCash')}
            </Text>
          </View>
          {isProvider && payerPhone ? (
            <Text variant="meta" tone="muted">
              {t('saleNew.confirm.payer', { phone: payerPhone })}
            </Text>
          ) : null}
        </View>

        <Card padded={false} style={styles.confirmCard}>
          <View style={styles.confirmCustomerRow}>
            <View style={styles.customerAvatarLg}>
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
            </View>
          </View>
          <DataRow label={t('saleNew.confirm.unit')} value={unitName} />
          <DataRow
            label={t('saleNew.confirm.plan')}
            value={
              <Pill
                label={t(plan.labelKey)}
                tone="blue"
                leading={<Feather name="zap" size={12} color={semantic.blue} />}
              />
            }
          />
          <DataRow
            label={t('saleNew.confirm.total')}
            value={formatCurrency(assignment.cost)}
          />
          {isEaas ? (
            <>
              <DataRow
                label={t('saleNew.confirm.pricePerDay')}
                value={formatCurrency(eaasPricePerDay)}
                mono
              />
              {eaasMinTopUp > 0 ? (
                <DataRow
                  label={t('saleNew.confirm.minTopUp')}
                  value={formatCurrency(eaasMinTopUp)}
                  mono
                />
              ) : null}
            </>
          ) : tenure > 1 ? (
            <>
              <DataRow
                label={t(
                  rateType === 'weekly'
                    ? 'saleNew.confirm.weeklyPayments'
                    : 'saleNew.confirm.monthlyPayments',
                  { count: tenure },
                )}
                value={t(
                  rateType === 'weekly'
                    ? 'saleNew.confirm.weeklyAmount'
                    : 'saleNew.confirm.monthlyAmount',
                  { amount: formatCurrency(installmentAmount) },
                )}
                mono
              />
              <DataRow
                label={t('saleNew.confirm.firstPayment')}
                value={toIsoDate(firstPaymentDate)}
                mono
              />
            </>
          ) : null}
          {deviceSerial.trim() ? (
            <DataRow
              label={t('saleNew.confirm.deviceSerial')}
              value={deviceSerial.trim()}
              mono
              last
            />
          ) : (
            <View style={styles.lastSpacer} />
          )}
        </Card>

        <Callout tone="warning" style={styles.confirmCallout}>
          <Text variant="meta" tone="secondary">
            {isEaas && downPayment === 0
              ? t('saleNew.confirm.warningEas')
              : isEaas
                ? t('saleNew.confirm.warningCash')
                : t('saleNew.confirm.warningDeposit')}
          </Text>
        </Callout>
      </ScrollView>

      <View
        style={[
          styles.footer,
          styles.footerRow,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <Button
          label={t('saleNew.confirm.back')}
          tone="ghost"
          onPress={onBack}
          style={styles.footerBack}
        />
        <Button
          tone="success"
          label={
            isEaas && downPayment === 0
              ? t('saleNew.confirm.activate')
              : t('saleNew.confirm.submit')
          }
          onPress={onConfirm}
          loading={loading}
          style={styles.footerPrimary}
        />
      </View>
    </View>
  );
}

function SuccessStep({
  customer,
  assignment,
  downPayment,
  isEaas,
  providerId,
  reference,
  formatCurrency,
  onClose,
  onNext,
}: {
  customer: Customer;
  assignment: AgentAssignedAppliance;
  downPayment: number;
  isEaas: boolean;
  providerId: number;
  reference: string;
  formatCurrency: (n: number) => string;
  onClose: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const customerName = `${customer.name} ${customer.surname}`.trim();
  const unitName =
    assignment.appliance?.name ??
    assignment.appliance_type?.name ??
    t('saleNew.pickSystem.shsUnit');

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
          { paddingBottom: insets.bottom + 100 },
        ]}
      >
        <View style={styles.successHero}>
          <SuccessCheckmark />
          <Text variant="pageTitle" tone="success" style={styles.successTitle}>
            {isEaas && downPayment === 0
              ? t('saleNew.result.titleActivated')
              : t('saleNew.result.titleSold')}
          </Text>
          <Text variant="body" tone="muted" style={styles.successSubtitle}>
            {customerName} · {unitName}
          </Text>
        </View>

        {providerId !== CASH_PAYMENT_PROVIDER ? (
          <Callout tone="info" style={styles.successNote}>
            <Text variant="body" tone="secondary">
              {t('saleNew.result.providerNote')}
            </Text>
          </Callout>
        ) : null}

        <ReceiptCard
          amount={formatCurrency(downPayment)}
          currency={
            isEaas ? t('saleNew.result.cash') : t('saleNew.result.deposit')
          }
          customerName={customerName}
          reference={t('saleNew.result.refLabel', { ref: reference })}
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
          label={t('saleNew.result.backHome')}
          tone="ghost"
          onPress={onClose}
          style={styles.footerBack}
        />
        <Button
          label={t('saleNew.result.next')}
          onPress={onNext}
          style={styles.footerPrimary}
        />
      </View>
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
      <Text variant="meta" tone="muted" style={styles.dataRowLabel}>
        {label}
      </Text>
      <View style={styles.dataRowValue}>
        {typeof value === 'string' ? (
          mono ? (
            <Text
              variant="mono"
              numberOfLines={1}
              ellipsizeMode="middle"
              style={styles.dataRowValueText}
            >
              {value}
            </Text>
          ) : (
            <Text
              variant="bodyEmphasis"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.dataRowValueText}
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

function parseAmount(input: string, { round = false } = {}): number {
  const n = Number(input) || 0;
  return Math.max(0, round ? Math.round(n) : n);
}

function customerPhone(customer: Customer): string | null {
  return (
    customer.addresses?.find((a) => a.is_primary)?.phone ??
    customer.addresses?.[0]?.phone ??
    null
  );
}

function shortLabel(name: string): string {
  const m = name.match(/(\d+)\s*W/i);
  return m ? `${m[1]}W` : 'SHS';
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
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.85,
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
  },
  footerBack: {
    flexBasis: 96,
    flexGrow: 0,
  },
  footerPrimary: {
    flex: 1,
  },

  /* customer step */
  searchBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  searchField: {
    marginTop: spacing.xs,
  },
  emptyPadded: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  listSep: {
    height: 1,
    backgroundColor: semantic.line,
  },
  listFooter: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  customerAvatar: {
    width: 40,
    height: 40,
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

  /* unit step */
  unitContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  unitChip: {
    alignSelf: 'stretch',
  },
  unitSection: {
    marginTop: spacing.md,
  },
  unitList: {
    gap: spacing.md,
  },
  unitRing: {
    borderRadius: radii.card + 3,
  },
  unitRingSelected: {
    backgroundColor: 'rgba(250,141,65,0.15)',
    padding: 3,
  },
  unitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: semantic.line2,
    padding: spacing.md,
  },
  unitCardSelected: {
    backgroundColor: semantic.orangeLight,
    borderColor: semantic.orange,
  },
  unitBody: {
    flex: 1,
    gap: 4,
  },
  unitTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  unitHint: {
    paddingVertical: 3,
  },
  unitPrice: {
    fontFamily: fonts.monoBold,
  },

  /* radios */
  radio: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: semantic.line2,
    backgroundColor: semantic.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelectedBlue: {
    borderColor: semantic.blue,
    backgroundColor: semantic.blue,
  },
  radioSelectedOrange: {
    borderColor: semantic.orange,
    backgroundColor: semantic.orange,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: semantic.paper,
  },

  /* plan step */
  planContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  summaryCard: {
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planSection: {
    marginTop: spacing.md,
  },
  freqToggle: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: semantic.line2,
    padding: 3,
    marginBottom: spacing.md,
  },
  freqOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.card - 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  freqOptionActive: {
    backgroundColor: semantic.bgSoft,
    borderColor: semantic.blue,
  },
  planList: {
    gap: spacing.md,
  },
  planItem: {
    gap: spacing.sm,
  },
  customPanel: {
    paddingLeft: spacing.lg,
  },
  customRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  customField: {
    flex: 1,
  },
  planRing: {
    borderRadius: radii.card + 3,
  },
  planRingSelected: {
    backgroundColor: 'rgba(23,69,105,0.15)',
    padding: 3,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: semantic.line2,
    padding: spacing.md,
  },
  planCardSelected: {
    backgroundColor: semantic.bgSoft,
    borderColor: semantic.blue,
  },
  planBody: {
    flex: 1,
    gap: 4,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  planCallout: {
    marginTop: spacing.xs,
  },
  planSerial: {
    marginTop: spacing.lg,
  },

  /* confirm */
  confirmContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  confirmHero: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: semantic.orangeLight,
    alignItems: 'center',
    gap: 6,
  },
  confirmAmount: {
    marginTop: 4,
  },
  successNote: {
    width: '100%',
    marginTop: 0,
  },
  methodContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  confirmMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  confirmCard: {
    marginHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  confirmCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
  },
  customerAvatarLg: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: semantic.bgSoft,
    borderWidth: 1.5,
    borderColor: semantic.sky,
    alignItems: 'center',
    justifyContent: 'center',
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
  dataRowLabel: {
    flexShrink: 0,
  },
  dataRowValue: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  dataRowValueText: {
    textAlign: 'right',
  },
  dataRowLast: {
    borderBottomWidth: 0,
  },
  lastSpacer: {
    height: 0,
  },
  confirmCallout: {
    marginHorizontal: spacing.lg,
  },

  /* success */
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
});
