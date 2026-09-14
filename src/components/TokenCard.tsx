import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  ToastAndroid,
  View,
  ViewStyle,
} from 'react-native';

import { PaymentToken } from '@/api/transactions';
import { TokenStatus } from '@/api/useTokenPolling';
import { fonts, radii, semantic, spacing } from '@/theme';
import { describeTokenCredit } from '@/utils/tokenDisplay';
import { Text } from './Text';

type TokenCardProps = {
  token: PaymentToken | null;
  state: TokenStatus;
  style?: StyleProp<ViewStyle>;
};

async function copyToken(value: string, t: TFunction) {
  await Clipboard.setStringAsync(value);
  if (Platform.OS === 'android') {
    ToastAndroid.show(t('token.copied'), ToastAndroid.SHORT);
  }
}

export function TokenCard({ token, state, style }: TokenCardProps) {
  const { t } = useTranslation();
  if (state === 'skipped') return null;

  if (state === 'pending') {
    return (
      <View style={[styles.card, styles.pending, style]}>
        <View style={styles.header}>
          <Feather name="key" size={16} color={semantic.blue} />
          <Text variant="sectionLabel" tone="brand">
            {t('token.generating')}
          </Text>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={semantic.blue} />
          <Text variant="meta" tone="muted">
            {t('token.waiting')}
          </Text>
        </View>
      </View>
    );
  }

  if (state === 'unavailable' || !token) {
    return (
      <View style={[styles.card, styles.muted, style]}>
        <View style={styles.header}>
          <Feather name="info" size={16} color={semantic.ink3} />
          <Text variant="sectionLabel" tone="muted">
            {t('token.none')}
          </Text>
        </View>
        <Text variant="meta" tone="muted">
          {t('token.noneBody')}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.ready, style]}>
      <View style={styles.header}>
        <Feather name="key" size={16} color={semantic.green} />
        <Text variant="sectionLabel" tone="success">
          {t('token.label')}
        </Text>
      </View>
      <Pressable
        onPress={() => copyToken(token.token, t)}
        style={({ pressed }) => [styles.valueRow, pressed && { opacity: 0.7 }]}
      >
        <Text
          style={styles.value}
          selectable
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {token.token}
        </Text>
        <Feather name="copy" size={16} color={semantic.ink2} />
      </Pressable>
      <Text variant="meta" tone="muted">
        {describeTokenCredit(token) ?? t('token.readToCustomer')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginTop: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.sm,
  },
  pending: {
    borderColor: semantic.line2,
    backgroundColor: semantic.bgSoft,
  },
  ready: {
    borderColor: semantic.green,
    backgroundColor: semantic.greenLight,
  },
  muted: {
    borderColor: semantic.line,
    backgroundColor: semantic.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  value: {
    flex: 1,
    fontFamily: fonts.monoBold,
    fontSize: 22,
    letterSpacing: 1,
    color: semantic.ink,
  },
});
