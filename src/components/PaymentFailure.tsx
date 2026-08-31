import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, semantic, spacing } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

export type PaymentFailureDetail = {
  title: string;
  body: string;
};

type PaymentFailureProps = {
  failure: PaymentFailureDetail;
  restartLabel?: string;
  onClose: () => void;
  onRestart: () => void;
};

export function PaymentFailure({
  failure,
  restartLabel,
  onClose,
  onRestart,
}: PaymentFailureProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.xxl },
        ]}
      >
        <View style={styles.icon}>
          <Feather name="alert-circle" size={36} color={semantic.red} />
        </View>
        <Text variant="pageTitle" tone="danger" style={styles.title}>
          {failure.title}
        </Text>
        <Text variant="body" tone="secondary" style={styles.body}>
          {failure.body}
        </Text>
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
      >
        <Button
          label={t('paymentFailure.close')}
          tone="ghost"
          onPress={onClose}
          style={styles.footerBack}
        />
        <Button
          label={restartLabel ?? t('paymentFailure.startOver')}
          onPress={onRestart}
          style={styles.footerPrimary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semantic.paper,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: semantic.orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
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
