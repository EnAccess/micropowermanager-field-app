import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Text } from './Text';

type ContextStripProps = {
  location?: string;
  detail?: string;
};

export function ContextStrip({ location, detail }: ContextStripProps) {
  return (
    <View style={styles.root}>
      <Feather name="map-pin" size={14} color={colors.brand.primary} />
      <View style={styles.body}>
        <Text variant="label" tone="brand" numberOfLines={1}>
          {location ?? 'No location selected'}
        </Text>
        {detail ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.brand.ice,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  body: {
    flex: 1,
    gap: 2,
  },
});
