import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { CASH_PAYMENT_PROVIDER, PaymentProvider } from '@/api/transactions';
import { radii, semantic, spacing } from '@/theme';
import { PaymentMethodLogo } from './PaymentMethodLogo';
import { Text } from './Text';

type PaymentMethodPickerProps = {
  providers: PaymentProvider[];
  value: number;
  onChange: (providerId: number) => void;
  style?: StyleProp<ViewStyle>;
};

export function PaymentMethodPicker({
  providers,
  value,
  onChange,
  style,
}: PaymentMethodPickerProps) {
  const { t } = useTranslation();

  const methods = [
    {
      id: CASH_PAYMENT_PROVIDER,
      label: t('paymentMethod.cash'),
      description: t('paymentMethod.cashHint'),
    },
    ...providers.map((provider) => ({
      id: provider.id,
      label: provider.name,
      description: t('paymentMethod.providerHint'),
    })),
  ];

  return (
    <View style={[styles.list, style]}>
      {methods.map((method) => {
        const selected = method.id === value;
        return (
          <Pressable
            key={method.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(method.id)}
            style={({ pressed }) => [
              styles.ring,
              selected && styles.ringSelected,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.card, selected && styles.cardSelected]}>
              <PaymentMethodLogo providerId={method.id} />
              <View style={styles.body}>
                <Text variant="bodyEmphasis" numberOfLines={1}>
                  {method.label}
                </Text>
                <Text variant="meta" tone="muted" numberOfLines={2}>
                  {method.description}
                </Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  ring: {
    borderRadius: radii.card + 3,
  },
  ringSelected: {
    backgroundColor: 'rgba(27,117,186,0.14)',
    padding: 3,
  },
  pressed: {
    opacity: 0.85,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: semantic.line2,
    padding: spacing.md,
  },
  cardSelected: {
    backgroundColor: semantic.bgSoft,
    borderColor: semantic.blueMid,
  },
  body: {
    flex: 1,
    gap: 2,
  },
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
  radioSelected: {
    borderColor: semantic.blueMid,
    backgroundColor: semantic.blueMid,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: semantic.paper,
  },
});
