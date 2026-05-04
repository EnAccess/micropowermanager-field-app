import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { radii, semantic, shadows, spacing } from '@/theme';

type CardProps = {
  children: ReactNode;
  elevated?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  elevated = false,
  padded = true,
  style,
}: CardProps) {
  return (
    <View
      style={[
        styles.card,
        padded && styles.padded,
        elevated ? styles.elevated : styles.flat,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semantic.paper,
    borderRadius: radii.card,
  },
  padded: {
    padding: spacing.lg,
  },
  flat: {
    borderWidth: 1,
    borderColor: semantic.line,
  },
  elevated: {
    ...shadows.card,
  },
});
