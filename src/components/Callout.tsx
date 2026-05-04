import { Feather } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { radii, semantic, spacing } from '@/theme';
import { Text } from './Text';

type CalloutTone = 'warning' | 'info' | 'success';

type CalloutProps = {
  tone?: CalloutTone;
  title?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const toneStyles: Record<
  CalloutTone,
  {
    bg: string;
    badgeBg: string;
    badgeColor: string;
    iconName: keyof typeof Feather.glyphMap;
  }
> = {
  warning: {
    bg: semantic.orangeLight,
    badgeBg: semantic.orange,
    badgeColor: semantic.paper,
    iconName: 'alert-triangle',
  },
  info: {
    bg: semantic.bgSoft,
    badgeBg: semantic.blue,
    badgeColor: semantic.paper,
    iconName: 'info',
  },
  success: {
    bg: semantic.greenLight,
    badgeBg: semantic.green,
    badgeColor: semantic.paper,
    iconName: 'check',
  },
};

export function Callout({
  tone = 'info',
  title,
  children,
  style,
}: CalloutProps) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.root, { backgroundColor: t.bg }, style]}>
      <View style={[styles.badge, { backgroundColor: t.badgeBg }]}>
        <Feather name={t.iconName} size={14} color={t.badgeColor} />
      </View>
      <View style={styles.body}>
        {title ? (
          <Text variant="bodyEmphasis" tone="primary">
            {title}
          </Text>
        ) : null}
        {typeof children === 'string' ? (
          <Text variant="body" tone="secondary">
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
});
