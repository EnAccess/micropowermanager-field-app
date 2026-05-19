import { Feather } from '@expo/vector-icons';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
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
  AppliancePaymentType,
  fetchAgentAssignedAppliances,
  fetchUnassignedDevices,
  isSolarHomeSystem,
  sellAppliance,
} from '@/api/appliances';
import {
  Customer,
  CustomerPage,
  fetchCustomerPage,
  searchCustomers,
} from '@/api/customer';
import { useSession } from '@/auth/SessionContext';
import {
  Button,
  Callout,
  Card,
  CustomerChip,
  Pill,
  ProgressSteps,
  ReceiptCard,
  SecondaryHeader,
  Select,
  SelectOption,
  StripedThumbnail,
  SuccessCheckmark,
  Text,
  TextField,
  toIsoDate,
} from '@/components';
import { fonts, radii, semantic, spacing } from '@/theme';
import { initials } from '@/utils/format';
import { useCurrency } from '@/utils/useCurrency';

type Step = 'customer' | 'unit' | 'plan' | 'confirm' | 'success';

type PlanId = 'cash' | 'twelve' | 'twentyfour' | 'custom' | 'energy';

type Plan = {
  id: PlanId;
  label: string;
  description: string;
  tenure: number;
  downPaymentRatio: number;
};

const PLANS: Plan[] = [
  {
    id: 'cash',
    label: 'Cash upfront',
    description: 'Customer pays the full price today.',
    tenure: 1,
    downPaymentRatio: 1,
  },
  {
    id: 'twelve',
    label: '12-month PAYG',
    description: 'Active on each monthly payment.',
    tenure: 12,
    downPaymentRatio: 0.1,
  },
  {
    id: 'twentyfour',
    label: '24-month PAYG',
    description: 'Lower monthly payment.',
    tenure: 24,
    downPaymentRatio: 0.1,
  },
  {
    id: 'custom',
    label: 'Custom plan',
    description: 'Set your own deposit and number of months.',
    tenure: 6,
    downPaymentRatio: 0.1,
  },
  {
    id: 'energy',
    label: 'Energy service',
    description: 'Pay-as-you-go top-ups. No fixed tenure.',
    tenure: 0,
    downPaymentRatio: 0,
  },
];

const HINT_BY_INDEX: Record<number, string> = {
  0: 'Starter',
  1: 'Most popular',
  2: 'Large household',
};

export default function SellShsScreen() {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const { format: formatCurrency, symbol: currency } = useCurrency();

  const [step, setStep] = useState<Step>('customer');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [assignment, setAssignment] = useState<AgentAssignedAppliance | null>(
    null,
  );
  const [planId, setPlanId] = useState<PlanId>('twelve');
  const [customTenure, setCustomTenure] = useState('6');
  const [customDeposit, setCustomDeposit] = useState('');
  const [eaasPricePerDay, setEaasPricePerDay] = useState('');
  const [eaasMinTopUp, setEaasMinTopUp] = useState('');
  const [eaasDownPayment, setEaasDownPayment] = useState('');
  const [deviceSerial, setDeviceSerial] = useState('');
  const [transactionRef, setTransactionRef] = useState<string | null>(null);

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
  const remaining = Math.max(0, cost - downPayment);
  const monthly = !isEaas && tenure > 1 ? Math.round(remaining / tenure) : 0;
  const firstPaymentDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d;
  }, []);

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
              first_payment_date: toIsoDate(firstPaymentDate),
            }),
        ...(deviceSerial.trim() ? { device_serial: deviceSerial.trim() } : {}),
      }),
    onSuccess: async () => {
      setTransactionRef(String(Date.now()).slice(-6));
      setStep('success');
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
  });

  function reset() {
    setStep('customer');
    setCustomer(null);
    setAssignment(null);
    setPlanId('twelve');
    setCustomTenure('6');
    setCustomDeposit('');
    setEaasPricePerDay('');
    setEaasMinTopUp('');
    setEaasDownPayment('');
    setDeviceSerial('');
    setTransactionRef(null);
    sellMutation.reset();
  }

  if (step === 'customer') {
    return (
      <CustomerStep
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
        customer={customer}
        assignment={assignment}
        planId={planId}
        onPickPlan={setPlanId}
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
        monthly={monthly}
        isEaas={isEaas}
        canContinue={
          (isEaas
            ? eaasPricePerDayNum > 0
            : tenure >= 1 && (!isCustom || downPayment >= 0)) &&
          deviceSerial.trim().length > 0
        }
        formatCurrency={formatCurrency}
        onBack={() => setStep('unit')}
        onContinue={() => setStep('confirm')}
      />
    );
  }

  if (step === 'confirm' && customer && assignment) {
    return (
      <ConfirmStep
        customer={customer}
        assignment={assignment}
        plan={plan}
        tenure={tenure}
        downPayment={downPayment}
        monthly={monthly}
        firstPaymentDate={firstPaymentDate}
        deviceSerial={deviceSerial}
        isEaas={isEaas}
        eaasPricePerDay={eaasPricePerDayNum}
        eaasMinTopUp={eaasMinTopUpNum}
        formatCurrency={formatCurrency}
        currency={currency}
        loading={sellMutation.isPending}
        error={sellMutation.isError ? errorMessage(sellMutation.error) : null}
        onBack={() => setStep('plan')}
        onConfirm={() => sellMutation.mutate()}
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
  onPick,
  onBack,
}: {
  onPick: (c: Customer) => void;
  onBack: () => void;
}) {
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
        title="Sell SHS"
        subtitle="Step 1 of 4"
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={4} current={1} />
      </View>

      <View style={styles.searchBlock}>
        <Text variant="sectionLabel" tone="muted">
          PICK A CUSTOMER
        </Text>
        <TextField
          placeholder="Search by name or phone…"
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
                ? 'No matches. Try a different search.'
                : 'No customers yet. Register one first.'}
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
  customer,
  selectedId,
  onChangeCustomer,
  onSelect,
  onContinue,
  onBack,
  formatCurrency,
}: {
  customer: Customer;
  selectedId: number | null;
  onChangeCustomer: () => void;
  onSelect: (assignment: AgentAssignedAppliance) => void;
  onContinue: () => void;
  onBack: () => void;
  formatCurrency: (n: number) => string;
}) {
  const { api } = useSession();
  const insets = useSafeAreaInsets();
  const appliances = useQuery({
    queryKey: ['agent-assigned-appliances'],
    queryFn: () => fetchAgentAssignedAppliances(api!),
    enabled: !!api,
  });

  const items = useMemo(
    () => (appliances.data ?? []).filter(isSolarHomeSystem),
    [appliances.data],
  );

  const customerName = `${customer.name} ${customer.surname}`.trim();

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title="Sell SHS"
        subtitle="Step 2 of 4"
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={4} current={2} />
      </View>

      <ScrollView contentContainerStyle={styles.unitContent}>
        <CustomerChip
          name={customerName}
          meta={customerPhone(customer) ?? 'New customer'}
          onChange={onChangeCustomer}
          style={styles.unitChip}
        />

        <Text variant="sectionLabel" tone="muted" style={styles.unitSection}>
          PICK A SYSTEM
        </Text>

        {appliances.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={semantic.ink3} />
          </View>
        ) : items.length === 0 ? (
          <Card>
            <Text variant="meta" tone="muted">
              No SHS units assigned to you. Ask your administrator to assign
              one.
            </Text>
          </Card>
        ) : (
          <View style={styles.unitList}>
            {items.map((a, idx) => {
              const selected = a.id === selectedId;
              const name =
                a.appliance?.name ?? a.appliance_type?.name ?? 'SHS unit';
              const hint = HINT_BY_INDEX[idx];
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
          label="Back"
          tone="ghost"
          onPress={onBack}
          style={styles.footerBack}
        />
        <Button
          tone="accent"
          label="Payment plan"
          disabled={selectedId == null}
          onPress={onContinue}
          style={styles.footerPrimary}
        />
      </View>
    </View>
  );
}

function PlanStep({
  customer,
  assignment,
  planId,
  onPickPlan,
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
  monthly,
  isEaas,
  canContinue,
  formatCurrency,
  onBack,
  onContinue,
}: {
  customer: Customer;
  assignment: AgentAssignedAppliance;
  planId: PlanId;
  onPickPlan: (id: PlanId) => void;
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
  monthly: number;
  isEaas: boolean;
  canContinue: boolean;
  formatCurrency: (n: number) => string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const customerName = `${customer.name} ${customer.surname}`.trim();
  const unitName =
    assignment.appliance?.name ?? assignment.appliance_type?.name ?? 'SHS unit';

  const applianceId = assignment.appliance?.id ?? null;
  const unassignedQuery = useQuery({
    queryKey: ['unassigned-devices', applianceId],
    queryFn: () =>
      fetchUnassignedDevices(api!, applianceId!, 'solar_home_system'),
    enabled: !!api && applianceId != null,
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
    ? 'Could not load unassigned units. Check your connection.'
    : applianceId == null
      ? 'This appliance is missing — contact your admin.'
      : !unassignedQuery.isLoading && serialOptions.length === 0
        ? 'No unassigned units available for this appliance.'
        : undefined;

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title="Payment plan"
        subtitle={`${customerName} · ${unitName}`}
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={4} current={3} />
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
                Total
              </Text>
              <Text variant="bodyEmphasis">
                {formatCurrency(assignment.cost)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text variant="body" tone="muted">
                {isEaas ? 'Cash today' : 'Deposit today'}
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
            HOW WILL THEY PAY?
          </Text>

          <View style={styles.planList}>
            {PLANS.map((p) => {
              const selected = p.id === planId;
              const isCustom = p.id === 'custom';

              // Custom card shows the live tenure / monthly the user has typed;
              // preset cards show their built-in defaults.
              const cardTenure = isCustom ? tenure : p.tenure;
              const isInstallment = cardTenure > 1;
              const cardMonthly = isInstallment
                ? isCustom
                  ? monthly
                  : Math.round(
                      (assignment.cost * (1 - p.downPaymentRatio)) / p.tenure,
                    )
                : 0;

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
                            {p.label}
                          </Text>
                          {isInstallment && cardMonthly > 0 ? (
                            <Text
                              variant="mono"
                              style={{
                                color: selected ? semantic.blue : semantic.ink2,
                                fontFamily: fonts.monoBold,
                              }}
                            >
                              {formatCurrency(cardMonthly)} / month
                            </Text>
                          ) : null}
                        </View>
                        <Text variant="meta" tone="muted">
                          {p.description}
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  {isCustom && selected ? (
                    <View style={styles.customPanel}>
                      <View style={styles.customRow}>
                        <View style={styles.customField}>
                          <TextField
                            label="Months"
                            placeholder="6"
                            keyboardType="number-pad"
                            mono
                            value={customTenure}
                            onChangeText={onChangeCustomTenure}
                          />
                        </View>
                        <View style={styles.customField}>
                          <TextField
                            label="Deposit today"
                            placeholder="0"
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
                            label="Price / day"
                            placeholder="0"
                            keyboardType="decimal-pad"
                            mono
                            value={eaasPricePerDay}
                            onChangeText={onChangeEaasPricePerDay}
                          />
                        </View>
                        <View style={styles.customField}>
                          <TextField
                            label="Min. top-up"
                            placeholder="0"
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
                            label="Down payment (optional)"
                            placeholder="0"
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
                ? 'Customer pays per day of usage. Service pauses when the balance runs out.'
                : 'PAYG unlocks after each monthly payment. Customer receives SMS reminders before each due date.'}
            </Text>
          </Callout>

          <Select<string>
            label="Unit serial number"
            placeholder="Pick an unassigned unit"
            searchable
            searchPlaceholder="Search by serial…"
            options={serialOptions}
            value={deviceSerial || null}
            onChange={onChangeSerial}
            loading={unassignedQuery.isLoading}
            error={serialError}
            disabled={serialOptions.length === 0}
            containerStyle={styles.planSerial}
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
            label="Back"
            tone="ghost"
            onPress={onBack}
            style={styles.footerBack}
          />
          <Button
            tone="accent"
            label={
              isEaas
                ? downPayment > 0
                  ? `Collect ${formatCurrency(downPayment)} cash`
                  : 'Continue'
                : `Collect ${formatCurrency(downPayment)} deposit`
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

function ConfirmStep({
  customer,
  assignment,
  plan,
  tenure,
  downPayment,
  monthly,
  firstPaymentDate,
  deviceSerial,
  isEaas,
  eaasPricePerDay,
  eaasMinTopUp,
  formatCurrency,
  currency,
  loading,
  error,
  onBack,
  onConfirm,
}: {
  customer: Customer;
  assignment: AgentAssignedAppliance;
  plan: Plan;
  tenure: number;
  downPayment: number;
  monthly: number;
  firstPaymentDate: Date;
  deviceSerial: string;
  isEaas: boolean;
  eaasPricePerDay: number;
  eaasMinTopUp: number;
  formatCurrency: (n: number) => string;
  currency: string | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const insets = useSafeAreaInsets();
  const customerName = `${customer.name} ${customer.surname}`.trim();
  const phone = customerPhone(customer);
  const unitName =
    assignment.appliance?.name ?? assignment.appliance_type?.name ?? 'SHS unit';

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title="Confirm sale"
        subtitle="Step 4 of 4"
        onBack={onBack}
      />
      <View style={styles.progressWrap}>
        <ProgressSteps total={4} current={4} />
      </View>

      <ScrollView contentContainerStyle={styles.confirmContent}>
        <View style={styles.confirmHero}>
          <Text variant="sectionLabel" tone="muted">
            {isEaas ? 'CASH TODAY' : 'DEPOSIT TODAY'}
          </Text>
          <Text
            variant="heroNumber"
            style={[styles.confirmAmount, { color: semantic.orange }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatCurrency(downPayment)}
          </Text>
          <Text variant="body" tone="secondary">
            {isEaas && downPayment === 0
              ? 'Activation only — no cash collected'
              : currency
                ? `${currency} · in cash`
                : 'In cash'}
          </Text>
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
          <DataRow label="Unit" value={unitName} />
          <DataRow
            label="Plan"
            value={
              <Pill
                label={plan.label}
                tone="blue"
                leading={<Feather name="zap" size={12} color={semantic.blue} />}
              />
            }
          />
          <DataRow label="Total" value={formatCurrency(assignment.cost)} />
          {isEaas ? (
            <>
              <DataRow
                label="Price / day"
                value={formatCurrency(eaasPricePerDay)}
                mono
              />
              {eaasMinTopUp > 0 ? (
                <DataRow
                  label="Min. top-up"
                  value={formatCurrency(eaasMinTopUp)}
                  mono
                />
              ) : null}
            </>
          ) : tenure > 1 ? (
            <>
              <DataRow
                label={`${tenure} monthly payments`}
                value={`${formatCurrency(monthly)} / month`}
                mono
              />
              <DataRow
                label="First payment"
                value={toIsoDate(firstPaymentDate)}
                mono
              />
            </>
          ) : null}
          {deviceSerial.trim() ? (
            <DataRow
              label="Device serial"
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
            {isEaas && downPayment === 0 ? (
              <>
                Activating starts the energy service contract. This action is
                final.
              </>
            ) : (
              <>
                Confirm only <Text variant="bodyStrong">after</Text> you&apos;ve
                received the {isEaas ? 'cash' : 'deposit'}. This action is
                final.
              </>
            )}
          </Text>
        </Callout>

        {error ? (
          <Text variant="meta" tone="danger" style={styles.confirmError}>
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
          label="Back"
          tone="ghost"
          onPress={onBack}
          style={styles.footerBack}
        />
        <Button
          tone="success"
          label={
            isEaas && downPayment === 0
              ? 'Activate energy service'
              : 'Cash received — confirm'
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
  reference,
  formatCurrency,
  onClose,
  onNext,
}: {
  customer: Customer;
  assignment: AgentAssignedAppliance;
  downPayment: number;
  isEaas: boolean;
  reference: string;
  formatCurrency: (n: number) => string;
  onClose: () => void;
  onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  const customerName = `${customer.name} ${customer.surname}`.trim();
  const unitName =
    assignment.appliance?.name ?? assignment.appliance_type?.name ?? 'SHS unit';

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
            {isEaas && downPayment === 0 ? 'Service activated' : 'SHS sold'}
          </Text>
          <Text variant="body" tone="muted" style={styles.successSubtitle}>
            {customerName} · {unitName}
          </Text>
        </View>

        <ReceiptCard
          amount={formatCurrency(downPayment)}
          currency={isEaas ? 'Cash' : 'Deposit'}
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
          label="Next sale"
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

function errorMessage(error: unknown): string {
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
  return 'Sale failed. Try again.';
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
  confirmError: {
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
