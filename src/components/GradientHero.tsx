import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { semantic, spacing } from '@/theme';
import { Burst } from './Burst';

type Variant = 'blue' | 'orange';

type GradientHeroProps = {
  children: ReactNode;
  variant?: Variant;
  burst?: boolean;
  paddedTop?: boolean;
  paddedBottom?: number;
  style?: StyleProp<ViewStyle>;
};

const GRADIENTS: Record<Variant, [string, string]> = {
  blue: [semantic.blue, '#1E5278'],
  orange: ['#FA8D41', '#F77536'],
};

export function GradientHero({
  children,
  variant = 'blue',
  burst = true,
  paddedTop = true,
  paddedBottom = spacing.xxl,
  style,
}: GradientHeroProps) {
  const insets = useSafeAreaInsets();
  const burstColor =
    variant === 'blue' ? semantic.sky : 'rgba(255,255,255,0.5)';
  const burstOpacity = variant === 'blue' ? 0.28 : 0.18;

  return (
    <LinearGradient
      colors={GRADIENTS[variant]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.root,
        {
          paddingTop: paddedTop ? insets.top + spacing.lg : 0,
          paddingBottom: paddedBottom,
        },
        style,
      ]}
    >
      {burst ? (
        <View style={styles.burstWrapper} pointerEvents="none">
          <Burst size={220} color={burstColor} opacity={burstOpacity} />
        </View>
      ) : null}
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  burstWrapper: {
    position: 'absolute',
    top: 0,
    right: -60,
  },
  content: {
    gap: spacing.md,
  },
});
