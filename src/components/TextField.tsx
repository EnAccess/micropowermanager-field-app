import { ComponentProps, forwardRef, ReactNode, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { fonts, radii, semantic, spacing } from '@/theme';
import { Text } from './Text';

type TextInputFocus = NonNullable<ComponentProps<typeof TextInput>['onFocus']>;
type TextInputBlur = NonNullable<ComponentProps<typeof TextInput>['onBlur']>;
type FocusArg = Parameters<TextInputFocus>[0];
type BlurArg = Parameters<TextInputBlur>[0];

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
  helper?: string;
  mono?: boolean;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(
  function TextField(
    {
      label,
      error,
      helper,
      mono,
      trailing,
      containerStyle,
      style,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);

    const handleFocus: TextInputFocus = (e: FocusArg) => {
      setFocused(true);
      onFocus?.(e);
    };
    const handleBlur: TextInputBlur = (e: BlurArg) => {
      setFocused(false);
      onBlur?.(e);
    };

    const showError = !!error;

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? (
          <Text variant="sectionLabel" tone="secondary" style={styles.label}>
            {label.toUpperCase()}
          </Text>
        ) : null}
        <View
          style={[
            styles.ring,
            focused && !showError && styles.ringFocused,
            showError && styles.ringError,
          ]}
        >
          <View
            style={[
              styles.frame,
              focused && !showError && styles.frameFocused,
              showError && styles.frameError,
            ]}
          >
            <TextInput
              ref={ref}
              placeholderTextColor={semantic.ink3}
              {...rest}
              onFocus={handleFocus}
              onBlur={handleBlur}
              style={[styles.input, mono && styles.inputMono, style]}
            />
            {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
          </View>
        </View>
        {error ? (
          <Text variant="meta" tone="danger" style={styles.helper}>
            {error}
          </Text>
        ) : helper ? (
          <Text variant="meta" tone="muted" style={styles.helper}>
            {helper}
          </Text>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    marginBottom: 2,
  },
  ring: {
    borderRadius: radii.input + 3,
  },
  ringFocused: {
    backgroundColor: semantic.bgSoft,
    padding: 3,
  },
  ringError: {
    backgroundColor: 'rgba(199, 62, 62, 0.10)',
    padding: 3,
  },
  frame: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: semantic.paper,
    borderRadius: radii.input,
    borderWidth: 1.5,
    borderColor: semantic.line2,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  frameFocused: {
    borderColor: semantic.blue,
  },
  frameError: {
    borderColor: semantic.red,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: semantic.ink,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
  },
  inputMono: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
  },
  trailing: {
    paddingLeft: spacing.sm,
  },
  helper: {
    marginTop: spacing.xs,
  },
});
