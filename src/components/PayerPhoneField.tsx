import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { semantic, spacing } from '@/theme';
import { PhoneField } from './PhoneField';
import { Text } from './Text';

type PayerPhoneFieldProps = {
  resolvedPhone: string | null;
  override: string | null;
  onChangeOverride: (next: string | null) => void;
  defaultIso?: string;
  style?: StyleProp<ViewStyle>;
};

export function PayerPhoneField({
  resolvedPhone,
  override,
  onChangeOverride,
  defaultIso,
  style,
}: PayerPhoneFieldProps) {
  const { t } = useTranslation();
  const overriding = override !== null;

  return (
    <View style={[styles.container, style]}>
      <Text variant="sectionLabel" tone="secondary">
        {t('paymentMethod.payerLabel').toUpperCase()}
      </Text>

      {overriding ? (
        <PhoneField
          value={override}
          onChange={(next) => onChangeOverride(next)}
          defaultIso={defaultIso}
        />
      ) : (
        <Text variant="bodyEmphasis">
          {resolvedPhone ?? t('paymentMethod.payerMissing')}
        </Text>
      )}

      <Pressable
        onPress={() => onChangeOverride(overriding ? null : '')}
        hitSlop={8}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <Feather
          name={overriding ? 'rotate-ccw' : 'edit-2'}
          size={13}
          color={semantic.blueMid}
        />
        <Text variant="meta" tone="brand">
          {overriding
            ? t('paymentMethod.payerUseDefault')
            : t('paymentMethod.payerUseOther')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.7,
  },
});
