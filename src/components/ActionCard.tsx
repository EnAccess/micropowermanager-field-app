import { Feather } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Text } from './Text';

type FeatherName = ComponentProps<typeof Feather>['name'];

export type ActionTone = 'primary' | 'accent';

type ActionCardProps = {
  label: string;
  description?: string;
  icon: FeatherName;
  tone?: ActionTone;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const TONE_STRIPE: Record<ActionTone, string> = {
  primary: colors.brand.primary,
  accent: colors.accent.orange,
};

const TONE_ICON_BG: Record<ActionTone, string> = {
  primary: colors.brand.ice,
  accent: '#FFF1E1',
};

const TONE_ICON_FG: Record<ActionTone, string> = {
  primary: colors.brand.primary,
  accent: colors.accent.orange,
};

export function ActionCard({
  label,
  description,
  icon,
  tone = 'primary',
  onPress,
  disabled,
  style,
}: ActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: TONE_STRIPE[tone] },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View
        style={[styles.iconBubble, { backgroundColor: TONE_ICON_BG[tone] }]}
      >
        <Feather name={icon} size={20} color={TONE_ICON_FG[tone]} />
      </View>
      <View style={styles.body}>
        <Text variant="heading">{label}</Text>
        {description ? (
          <Text variant="caption" tone="secondary" style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={20} color={colors.text.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface.page,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.subtle,
    borderLeftWidth: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  description: {
    lineHeight: 18,
  },
});
