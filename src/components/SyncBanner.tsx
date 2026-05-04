import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { semantic, spacing } from '@/theme';

import { Text } from './Text';

type SyncBannerProps = {
  pendingCount: number;
  failedCount: number;
  busy: boolean;
  offline?: boolean;
  onSyncNow: () => void;
};

export function SyncBanner({
  pendingCount,
  failedCount,
  busy,
  offline,
  onSyncNow,
}: SyncBannerProps) {
  const total = pendingCount + failedCount;
  if (total === 0) return null;

  const noun = total === 1 ? 'customer' : 'customers';
  const message = offline
    ? `Still offline — we'll sync the moment you're back on a network.`
    : failedCount
      ? `${failedCount} sync failed · ${pendingCount} pending`
      : `${pendingCount} ${noun} pending sync`;

  return (
    <View
      style={[styles.root, failedCount ? styles.rootWarn : styles.rootInfo]}
    >
      <Feather
        name={failedCount ? 'alert-triangle' : 'cloud'}
        size={16}
        color={failedCount ? semantic.orange : semantic.blue}
      />
      <Text variant="meta" tone="secondary" style={styles.message}>
        {message}
      </Text>
      <Pressable
        onPress={onSyncNow}
        hitSlop={8}
        disabled={busy || pendingCount === 0}
        style={({ pressed }) => [
          styles.cta,
          (busy || pendingCount === 0) && styles.ctaDisabled,
          pressed && { opacity: 0.7 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={semantic.blue} size="small" />
        ) : (
          <Text variant="meta" tone="brand" style={styles.ctaLabel}>
            Sync now
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: semantic.line,
  },
  rootInfo: {
    backgroundColor: semantic.bgSoft,
  },
  rootWarn: {
    backgroundColor: semantic.orangeLight,
  },
  message: {
    flex: 1,
  },
  cta: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  ctaDisabled: {
    opacity: 0.4,
  },
  ctaLabel: {
    fontWeight: '600',
  },
});
