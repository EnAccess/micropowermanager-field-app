import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { fetchCustomer } from '@/api/customer';
import { useSession } from '@/auth/SessionContext';
import { radii, semantic, spacing } from '@/theme';

import { Pill } from './Pill';
import { Text } from './Text';

type OnboardingSectionProps = {
  customerId: number;
  showTitle?: boolean;
};

export function OnboardingSection({
  customerId,
  showTitle = true,
}: OnboardingSectionProps) {
  const { t } = useTranslation();
  const { api } = useSession();

  const customerQuery = useQuery({
    queryKey: ['customer-detail', customerId],
    queryFn: () => fetchCustomer(api!, customerId),
    enabled: !!api && Number.isFinite(customerId),
  });

  const answers = Object.entries(customerQuery.data?.onboarding_json ?? {});
  const unanswered = answers.filter(
    ([, answer]) => !answer || !String(answer).trim(),
  ).length;
  const loading = customerQuery.isLoading;

  return (
    <View style={styles.root}>
      {showTitle ? (
        <Text variant="sectionLabel" tone="muted">
          {t('onboarding.sectionLabel')}
        </Text>
      ) : null}

      <Pressable
        onPress={() => router.push(`/(app)/customers/${customerId}/onboarding`)}
        disabled={loading}
        style={({ pressed }) => [
          styles.row,
          pressed && !loading && { opacity: 0.85 },
        ]}
      >
        <View style={styles.icon}>
          {loading ? (
            <ActivityIndicator color={semantic.blue} />
          ) : (
            <Feather name="clipboard" size={20} color={semantic.blue} />
          )}
        </View>
        <View style={styles.body}>
          <Text variant="bodyEmphasis" numberOfLines={1}>
            {t('onboarding.title')}
          </Text>
          <Text variant="meta" tone="muted" numberOfLines={1}>
            {answers.length === 0
              ? t('onboarding.noAnswers')
              : unanswered > 0
                ? t('onboarding.unanswered', { n: unanswered })
                : t('onboarding.allAnswered')}
          </Text>
        </View>
        {answers.length > 0 ? (
          <Pill label={String(answers.length)} tone="blue" />
        ) : null}
        <Feather name="chevron-right" size={18} color={semantic.ink3} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: semantic.line,
    padding: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: semantic.bgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 4,
  },
});
