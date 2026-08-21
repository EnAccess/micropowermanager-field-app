import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Customer,
  MAX_ONBOARDING_ANSWERS,
  OnboardingAnswer,
  fetchCustomer,
  updateCustomerOnboarding,
} from '@/api/customer';
import { useSession } from '@/auth/SessionContext';
import {
  Button,
  SecondaryHeader,
  Text,
  TextField,
  useToast,
} from '@/components';
import { radii, semantic, spacing } from '@/theme';
import { extractServerError } from '@/utils/errorMessage';

export default function CustomerOnboardingScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const customerId = Number(params.id);
  const { api } = useSession();

  const customerQuery = useQuery({
    queryKey: ['customer-detail', customerId],
    queryFn: () => fetchCustomer(api!, customerId),
    enabled: !!api && Number.isFinite(customerId),
  });

  if (customerQuery.isLoading) {
    return (
      <View style={styles.root}>
        <SecondaryHeader
          title={t('onboarding.title')}
          onBack={() => router.back()}
        />
        <View style={styles.centered}>
          <ActivityIndicator color={semantic.blue} />
        </View>
      </View>
    );
  }

  if (!customerQuery.data) {
    return (
      <View style={styles.root}>
        <SecondaryHeader
          title={t('onboarding.title')}
          onBack={() => router.back()}
        />
        <View style={styles.centered}>
          <Text variant="body" tone="muted">
            {t('customerDetail.notFound')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <OnboardingForm customerId={customerId} customer={customerQuery.data} />
  );
}

type Row = {
  key: number;
  question: string;
  answer: string;
  existing: boolean;
};

type Draft = { question: string; answer: string };

function OnboardingForm({
  customerId,
  customer,
}: {
  customerId: number;
  customer: Customer;
}) {
  const { t } = useTranslation();
  const { api } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(customer.onboarding_json ?? {}).map(
      ([question, answer], index) => ({
        key: index,
        question,
        answer: stringifyAnswer(answer),
        existing: true,
      }),
    ),
  );
  const [dirty, setDirty] = useState(false);
  const nextKey = useRef(rows.length);
  const drafts = useRef<Map<number, Draft> | null>(null);
  if (!drafts.current) {
    drafts.current = new Map(
      rows.map((row) => [
        row.key,
        { question: row.question, answer: row.answer },
      ]),
    );
  }

  const saveMutation = useMutation({
    mutationFn: (answers: OnboardingAnswer[]) =>
      updateCustomerOnboarding(api!, customerId, answers),
    onSuccess: (updated) => {
      queryClient.setQueryData<Customer>(
        ['customer-detail', customerId],
        (prev) =>
          prev
            ? { ...prev, onboarding_json: updated.onboarding_json ?? null }
            : prev,
      );
      setDirty(false);
      toast.showSuccess(t('onboarding.saved'));
      router.back();
    },
    onError: (err) => {
      Alert.alert(
        t('onboarding.saveError'),
        extractServerError(err, t('onboarding.saveRetry')),
      );
    },
  });

  const saving = saveMutation.isPending;

  const guardBack = useCallback((): boolean => {
    if (saving) return true;
    if (!dirty) return false;
    Alert.alert(t('onboarding.discardTitle'), t('onboarding.discardBody'), [
      { text: t('onboarding.keepEditing'), style: 'cancel' },
      {
        text: t('common.discard'),
        style: 'destructive',
        onPress: () => router.back(),
      },
    ]);
    return true;
  }, [dirty, saving, t]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      guardBack,
    );
    return () => subscription.remove();
  }, [guardBack]);

  function setField(key: number, field: keyof Draft, text: string) {
    const draft = drafts.current?.get(key);
    if (!draft) return;
    draft[field] = text;
    setDirty(true);
  }

  function addRow() {
    if (rows.length >= MAX_ONBOARDING_ANSWERS) {
      Alert.alert(
        t('onboarding.maxTitle'),
        t('onboarding.maxBody', { n: MAX_ONBOARDING_ANSWERS }),
      );
      return;
    }
    const key = nextKey.current++;
    drafts.current?.set(key, { question: '', answer: '' });
    setDirty(true);
    setRows((prev) => [
      ...prev,
      { key, question: '', answer: '', existing: false },
    ]);
  }

  function removeRow(row: Row) {
    const drop = () => {
      drafts.current?.delete(row.key);
      setDirty(true);
      setRows((prev) => prev.filter((r) => r.key !== row.key));
    };
    if (!row.existing) {
      drop();
      return;
    }
    Alert.alert(
      t('onboarding.removeTitle'),
      t('onboarding.removeBody', { question: row.question }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('onboarding.remove'), style: 'destructive', onPress: drop },
      ],
    );
  }

  function handleSave() {
    const answers: OnboardingAnswer[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const draft = drafts.current?.get(row.key);
      const question = (draft?.question ?? '').trim();
      const answer = (draft?.answer ?? '').trim();
      if (!question) {
        if (answer) {
          Alert.alert(
            t('onboarding.saveError'),
            t('onboarding.missingQuestion'),
          );
          return;
        }
        continue;
      }
      const identity = question.toLowerCase();
      if (seen.has(identity)) {
        Alert.alert(
          t('onboarding.saveError'),
          t('onboarding.duplicate', { question }),
        );
        return;
      }
      seen.add(identity);
      answers.push({ question, answer: answer || null });
    }
    saveMutation.mutate(answers);
  }

  return (
    <View style={styles.root}>
      <SecondaryHeader
        title={t('onboarding.title')}
        subtitle={`${customer.name} ${customer.surname}`.trim()}
        onBack={() => {
          if (!guardBack()) router.back();
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="clipboard" size={28} color={semantic.ink3} />
              <Text variant="bodyEmphasis" style={styles.emptyTitle}>
                {t('onboarding.empty')}
              </Text>
              <Text variant="meta" tone="muted" style={styles.emptyBody}>
                {t('onboarding.emptyBody')}
              </Text>
            </View>
          ) : null}

          {rows.map((row) => (
            <View key={row.key} style={styles.card}>
              <View style={styles.cardHead}>
                {row.existing ? (
                  <Text variant="bodyEmphasis" style={styles.question}>
                    {row.question}
                  </Text>
                ) : (
                  <Text
                    variant="sectionLabel"
                    tone="muted"
                    style={styles.question}
                  >
                    {t('onboarding.newQuestion')}
                  </Text>
                )}
                <Pressable
                  onPress={() => removeRow(row)}
                  disabled={saving}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.remove,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Feather name="trash-2" size={16} color={semantic.red} />
                </Pressable>
              </View>
              {row.existing ? null : (
                <TextField
                  defaultValue={row.question}
                  onChangeText={(text) => setField(row.key, 'question', text)}
                  placeholder={t('onboarding.questionPlaceholder')}
                  maxLength={255}
                  editable={!saving}
                />
              )}
              <TextField
                defaultValue={row.answer}
                onChangeText={(text) => setField(row.key, 'answer', text)}
                placeholder={t('onboarding.answerPlaceholder')}
                maxLength={1000}
                editable={!saving}
              />
            </View>
          ))}

          {rows.length < MAX_ONBOARDING_ANSWERS ? (
            <Pressable
              onPress={addRow}
              disabled={saving}
              style={({ pressed }) => [
                styles.addRow,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Feather name="plus" size={16} color={semantic.blue} />
              <Text variant="bodyEmphasis" style={styles.addRowLabel}>
                {t('onboarding.addQuestion')}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <Button
            label={t('common.save')}
            onPress={handleSave}
            loading={saving}
            disabled={!dirty}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function stringifyAnswer(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.bgSoft,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: spacing.md,
    gap: spacing.md,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  emptyTitle: {
    marginTop: spacing.sm,
  },
  emptyBody: {
    textAlign: 'center',
  },
  card: {
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: semantic.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  question: {
    flex: 1,
  },
  remove: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radii.input,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: semantic.line2,
  },
  addRowLabel: {
    color: semantic.blue,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: semantic.paper,
    borderTopWidth: 1,
    borderTopColor: semantic.line,
  },
});
