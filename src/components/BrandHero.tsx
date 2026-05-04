import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';
import { Burst } from './Burst';
import { Logo } from './Logo';
import { Text } from './Text';

type BrandHeroProps = {
  title: string;
  subtitle?: string;
};

export function BrandHero({ title, subtitle }: BrandHeroProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.burstWrapper} pointerEvents="none">
        <Burst
          size={220}
          color={colors.brand.accent}
          opacity={0.18}
          rotation={45}
        />
      </View>
      <View style={styles.content}>
        <View style={styles.lockup}>
          <Logo size={32} />
          <Text variant="heading" tone="onNavy">
            MicroPowerManager
          </Text>
        </View>
        <Text variant="display" tone="onNavy" style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" tone="onNavyMuted" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.surface.navy,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    overflow: 'hidden',
  },
  burstWrapper: {
    position: 'absolute',
    top: -40,
    right: -60,
  },
  content: {
    gap: spacing.lg,
  },
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    marginTop: spacing.sm,
  },
  subtitle: {
    marginTop: spacing.xs,
  },
});
