import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { semantic, spacing } from '@/theme';
import { Button } from './Button';
import { Card } from './Card';
import { ReversedPaymentMethodLogo, reversedMarkOf } from './PaymentMethodLogo';
import { Text } from './Text';

type PaymentAwaitingProps = {
  providerId: number;
  providerName: string | null;
  payerPhone: string | null;
  amountFormatted: string;
  currency: string | null;
  unresolved: boolean;
  onCheckAgain: () => void;
  onClose: () => void;
};

export function PaymentAwaiting({
  providerId,
  providerName,
  payerPhone,
  amountFormatted,
  currency,
  unresolved,
  onCheckAgain,
  onClose,
}: PaymentAwaitingProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reversed = reversedMarkOf(providerId);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.brand,
          {
            paddingTop: insets.top + spacing.lg,
            backgroundColor: reversed?.background ?? semantic.blue,
          },
        ]}
      >
        {reversed ? (
          <ReversedPaymentMethodLogo providerId={providerId} height={36} />
        ) : (
          <Text variant="pageTitle" tone="onNavy">
            {providerName ?? t('paymentMethod.providerFallback')}
          </Text>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
      >
        {unresolved ? (
          <Feather name="clock" size={44} color={semantic.orange} />
        ) : (
          <ActivityIndicator size="large" color={semantic.blue} />
        )}

        <Text variant="pageTitle" style={styles.title}>
          {unresolved
            ? t('paymentAwaiting.unresolvedTitle')
            : t('paymentAwaiting.title')}
        </Text>

        <Text variant="body" tone="muted" style={styles.body}>
          {unresolved
            ? t('paymentAwaiting.unresolvedBody')
            : payerPhone
              ? t('paymentAwaiting.body', { phone: payerPhone })
              : t('paymentAwaiting.bodyNoPhone')}
        </Text>

        <Card style={styles.amountCard}>
          <Text variant="sectionLabel" tone="muted">
            {t('paymentAwaiting.amountLabel')}
          </Text>
          <Text variant="screenTitle" tone="brand">
            {currency ? `${currency} ` : ''}
            {amountFormatted}
          </Text>
        </Card>

        {!unresolved ? (
          <Text variant="meta" tone="muted" style={styles.hint}>
            {t('paymentAwaiting.hint')}
          </Text>
        ) : null}
      </ScrollView>

      {unresolved ? (
        <View
          style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
        >
          <Button
            label={t('paymentAwaiting.close')}
            tone="ghost"
            onPress={onClose}
            style={styles.footerBack}
          />
          <Button
            label={t('paymentAwaiting.checkAgain')}
            onPress={onCheckAgain}
            style={styles.footerPrimary}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.paper,
  },
  brand: {
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    marginTop: spacing.md,
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
  amountCard: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  hint: {
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: semantic.paper,
    borderTopWidth: 1,
    borderTopColor: semantic.line,
  },
  footerBack: {
    flexBasis: 96,
    flexGrow: 0,
  },
  footerPrimary: {
    flex: 1,
  },
});
