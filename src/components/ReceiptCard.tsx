import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { semantic, spacing } from '@/theme';
import { Card } from './Card';
import { Pill } from './Pill';
import { Text } from './Text';

type ReceiptCardProps = {
  amount: string;
  currency?: string;
  customerName: string;
  reference: string;
  syncedLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function ReceiptCard({
  amount,
  currency,
  customerName,
  reference,
  syncedLabel = 'SYNCED',
  style,
}: ReceiptCardProps) {
  return (
    <Card elevated style={style}>
      <View style={styles.headRow}>
        <View style={styles.amountWrap}>
          <Text variant="heroNumberSm" tone="brand">
            {amount}
          </Text>
          {currency ? (
            <Text variant="meta" tone="muted" style={styles.currency}>
              {currency}
            </Text>
          ) : null}
        </View>
        <Pill label={syncedLabel} tone="green" />
      </View>
      <View style={styles.separator} />
      <View style={styles.metaRow}>
        <Text variant="bodyEmphasis" tone="primary">
          {customerName}
        </Text>
        <Text variant="mono" tone="muted">
          {reference}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amountWrap: {
    gap: 2,
  },
  currency: {
    marginTop: 2,
  },
  separator: {
    marginVertical: spacing.md,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: semantic.line,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
