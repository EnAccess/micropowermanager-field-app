import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { radii, semantic, spacing } from '@/theme';
import { Text } from './Text';

type Tone = 'primary' | 'secondary' | 'ghost' | 'accent' | 'success';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  tone?: Tone;
  /** @deprecated use `tone` */
  variant?: Tone;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  tone,
  variant,
  loading = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const resolvedTone: Tone = tone ?? variant ?? 'primary';
  const isDisabled = disabled || loading;
  const variantStyle = toneStyles[resolvedTone];

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyle.container,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator color={variantStyle.loader} />
        ) : (
          <Text
            variant="callout"
            style={[styles.label, { color: variantStyle.label }]}
          >
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.button,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: 15,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
});

const toneStyles: Record<
  Tone,
  { container: ViewStyle; label: string; loader: string }
> = {
  primary: {
    container: { backgroundColor: semantic.blue },
    label: semantic.paper,
    loader: semantic.paper,
  },
  secondary: {
    container: {
      backgroundColor: semantic.bgSoft,
      borderWidth: 1,
      borderColor: semantic.line,
    },
    label: semantic.ink,
    loader: semantic.ink,
  },
  ghost: {
    container: {
      backgroundColor: semantic.paper,
      borderWidth: 1.5,
      borderColor: semantic.line2,
    },
    label: semantic.ink,
    loader: semantic.ink,
  },
  accent: {
    container: { backgroundColor: semantic.orange },
    label: semantic.paper,
    loader: semantic.paper,
  },
  success: {
    container: { backgroundColor: semantic.green },
    label: semantic.paper,
    loader: semantic.paper,
  },
};
