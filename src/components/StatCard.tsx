import { Feather } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Text } from './Text';

type FeatherName = ComponentProps<typeof Feather>['name'];

export type StatTone = 'blue' | 'orange' | 'green';

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: FeatherName;
  tone?: StatTone;
  style?: StyleProp<ViewStyle>;
};

const TONE_BG: Record<StatTone, string> = {
  blue: colors.brand.ice,
  orange: '#FFF1E1',
  green: '#EAF3DD',
};

const TONE_FG: Record<StatTone, string> = {
  blue: colors.brand.primary,
  orange: colors.accent.orange,
  green: colors.accent.green,
};

export function StatCard({
  label,
  value,
  hint,
  icon = 'activity',
  tone = 'blue',
  style,
}: StatCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={[styles.iconBubble, { backgroundColor: TONE_BG[tone] }]}>
          <Feather name={icon} size={16} color={TONE_FG[tone]} />
        </View>
        <Text
          variant="label"
          tone="muted"
          numberOfLines={1}
          style={styles.label}
        >
          {label}
        </Text>
      </View>
      <Text
        variant="numeric"
        tone="primary"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface.page,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBubble: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
